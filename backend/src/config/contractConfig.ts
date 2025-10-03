import "dotenv/config";
import {
  Aptos,
  AptosConfig,
  Account,
  Ed25519PrivateKey,
  AccountAddress,
  Network,
  type InputViewFunctionData,
  type MoveValue,
  type EntryFunctionArgumentTypes,
  type U64,
} from "@aptos-labs/ts-sdk";

/* -------------------------------------------------------------------------- */
/*                              ENV & SMALL HELPERS                            */
/* -------------------------------------------------------------------------- */

function requireEnv(name: string, ...fallbacks: string[]) {
  const keys = [name, ...fallbacks];
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  throw new Error(
    `Missing required env var: ${name}${
      fallbacks.length ? ` (or ${fallbacks.join(" / ")})` : ""
    }`
  );
}

// Prefer TESTNET; allow override via APTOS_NODE_URL if you need a custom fullnode
const NODE_URL =
  process.env.APTOS_NODE_URL?.trim() || "https://api.testnet.aptoslabs.com/v1";

// Deployed package address that contains the lendoor::* modules
const PACKAGE = requireEnv("LENDOOR_CONTRACT", "VITE_LENDOOR_CONTRACT");

// IMPORTANT: must be the **wrapped coin type**, e.g. 0x<addr>::wusdc::WUSDC
const ASSET_TYPE =
  process.env.WUSDC_TYPE?.trim() ||
  process.env.USDC_TYPE?.trim() || // legacy fallback
  "0x1::aptos_coin::AptosCoin";    // final fallback (dev-only)

// Decimals for the wrapped coin (USDC-style = 6)
const DECIMALS = Number(
  process.env.WUSDC_DECIMALS ?? process.env.USDC_DECIMALS ?? "6"
);

/* ----------------------- lazy singletons (SDK/Admin) ----------------------- */
let _aptos: Aptos | null = null;
let _admin: Account | null = null;

function getAptos(): Aptos {
  if (_aptos) return _aptos;
  _aptos =
    NODE_URL.includes("testnet")
      ? new Aptos(new AptosConfig({ network: Network.TESTNET }))
      : NODE_URL.includes("devnet")
      ? new Aptos(new AptosConfig({ network: Network.DEVNET }))
      : new Aptos(new AptosConfig({ network: Network.CUSTOM, fullnode: NODE_URL }));
  return _aptos;
}

function getAdmin(): Account {
  if (_admin) return _admin;
  const pkHexRaw =
    process.env.APTOS_PRIVATE_KEY?.trim() ??
    process.env.PRIVATE_KEY?.trim() ??
    "";
  if (!pkHexRaw) {
    throw new Error(
      "APTOS_PRIVATE_KEY (or PRIVATE_KEY) is missing. Check your backend .env and process manager env."
    );
  }
  const pkHex = pkHexRaw.startsWith("0x") ? pkHexRaw : `0x${pkHexRaw}`;
  _admin = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(pkHex) });
  return _admin;
}

/* -------------------------------------------------------------------------- */
/*                                 TYPES & UTILS                               */
/* -------------------------------------------------------------------------- */

type FQName = `${string}::${string}::${string}`;
const fq = (m: string, f: string) => `${PACKAGE}::${m}::${f}` as FQName;

// Safe u64 cast with bounds check
const toU64 = (v: bigint): U64 => {
  const U64_MAX = (1n << 64n) - 1n;
  if (v < 0n || v > U64_MAX) throw new Error("Value does not fit into u64");
  return (v as unknown) as U64;
};

// Parse human "123.45" into base units with given decimals
export function parseUnitsAptos(amount: string, decimals: number): bigint {
  const [i, f = ""] = amount.split(".");
  const base = 10n ** BigInt(decimals);
  const clean = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(i || "0") * base + BigInt(clean || "0");
}

// Convenience caster for SDK arg union (quiet TS2322 for numbers/bools/custom types)
const asArg = (v: unknown) => v as unknown as EntryFunctionArgumentTypes;

/* -------------------------------------------------------------------------- */
/*                                TX HELPER (SDK)                              */
/* -------------------------------------------------------------------------- */

async function signSubmitWait(params: {
  signer: Account;
  func: FQName;
  typeArguments?: string[];
  functionArguments?: EntryFunctionArgumentTypes[];
}) {
  const aptos = getAptos();
  const { signer, func, typeArguments = [], functionArguments = [] } = params;

  const transaction = await aptos.transaction.build.simple({
    sender: signer.accountAddress,
    data: { function: func, typeArguments, functionArguments },
  });

  const pending = await aptos.signAndSubmitTransaction({ signer, transaction });
  await aptos.waitForTransaction({ transactionHash: pending.hash });
  return pending.hash;
}

/* -------------------------------------------------------------------------- */
/*                              ON-CHAIN OPERATIONS                            */
/* -------------------------------------------------------------------------- */

/**
 * Ensure credit_manager is initialized (idempotent).
 * Requires the signer to be the configured admin (controller_config::admin_addr()).
 * If already initialized, we swallow the abort and treat it as success.
 */
async function ensureCreditManagerInitialized() {
  const admin = getAdmin();
  try {
    await signSubmitWait({ signer: admin, func: fq("credit_manager", "init") });
  } catch {
    // Already initialized or admin already set — ok to ignore.
  }
}

/**
 * Admin: set/replace a user's per-asset credit limit (u64 base units).
 * Asset type must be the wrapped coin type (e.g., PKG::wusdc::WUSDC).
 */
export async function adminSetLimitForUser(params: {
  userAddress: string;
  limitHuman: string;       // e.g. "1000" for 1000 USDC
  assetType?: string;       // defaults to ASSET_TYPE (wrapped USDC)
  decimals?: number;        // defaults to DECIMALS
}) {
  const { userAddress, limitHuman, assetType = ASSET_TYPE, decimals = DECIMALS } = params;
  const admin = getAdmin();

  if (!userAddress?.trim()) throw new Error("userAddress is required");
  if (!limitHuman?.trim()) throw new Error("limitHuman is required");

  const limitU64: U64 = toU64(parseUnitsAptos(limitHuman, decimals));

  const args: EntryFunctionArgumentTypes[] = [
    asArg(AccountAddress.fromString(userAddress)), // address
    asArg(limitU64),                               // u64
  ];

  const hash = await signSubmitWait({
    signer: admin,
    func: fq("credit_manager", "admin_set_limit"),
    typeArguments: [assetType],
    functionArguments: args,
  });

  return { hash, limitU64, assetType };
}

/**
 * Admin: set (score u8) + limit (u64) in one shot.
 * This matches your CLI script calling credit_manager::admin_set_line<AssetType>(addr, u8, u64).
 */
export async function adminSetLineForUser(params: {
  userAddress: string;
  score: number;            // u8
  limitHuman: string;       // human units
  assetType?: string;
  decimals?: number;
}) {
  const {
    userAddress,
    score,
    limitHuman,
    assetType = ASSET_TYPE,
    decimals = DECIMALS,
  } = params;

  const admin = getAdmin();

  if (!userAddress?.trim()) throw new Error("userAddress is required");
  if (!limitHuman?.trim()) throw new Error("limitHuman is required");
  if (!Number.isFinite(score) || score < 0 || score > 255)
    throw new Error("score must be in [0, 255]");

  // Convert human units -> base units (u64)
  const limitU64: U64 = toU64(parseUnitsAptos(limitHuman, decimals));
  // u8 as small JS number (we'll cast it to the SDK arg union)
  const scoreU8 = (score | 0) & 0xff;

  const args: EntryFunctionArgumentTypes[] = [
    asArg(AccountAddress.fromString(userAddress)), // address
    asArg(scoreU8),                                 // u8
    asArg(limitU64),                                // u64
  ];

  const hash = await signSubmitWait({
    signer: admin,
    func: fq("credit_manager", "admin_set_line"),
    typeArguments: [assetType],
    functionArguments: args,
  });

  return { hash, score: scoreU8, limitU64, assetType };
}

/**
 * Admin: pause or unpause a user (optional policy hook).
 */
export async function adminPauseUser(userAddress: string, paused: boolean) {
  const admin = getAdmin();

  const args: EntryFunctionArgumentTypes[] = [
    asArg(AccountAddress.fromString(userAddress)),
    asArg(paused), // bool
  ];

  const hash = await signSubmitWait({
    signer: admin,
    func: fq("credit_manager", "admin_pause_user"),
    functionArguments: args,
  });
  return { hash, paused };
}

/* -------------------------------------------------------------------------- */
/*                                     VIEWS                                   */
/* -------------------------------------------------------------------------- */

export async function getUserLimit(
  userAddress: string,
  assetType: string = ASSET_TYPE
): Promise<bigint> {
  const aptos = getAptos();
  const payload: InputViewFunctionData = {
    function: fq("credit_manager", "get_limit"),
    typeArguments: [assetType],
    functionArguments: [userAddress],
  };
  const [limit] = await aptos.view<[MoveValue]>({ payload });
  return BigInt(limit as any);
}

export async function getUserUsage(
  userAddress: string,
  assetType: string = ASSET_TYPE
): Promise<bigint> {
  const aptos = getAptos();
  const payload: InputViewFunctionData = {
    function: fq("credit_manager", "get_usage"),
    typeArguments: [assetType],
    functionArguments: [userAddress],
  };
  const [usage] = await aptos.view<[MoveValue]>({ payload });
  return BigInt(usage as any);
}

/* -------------------------------------------------------------------------- */
/*                       PUBLIC API (used by your ZkMe flow)                   */
/* -------------------------------------------------------------------------- */

/**
 * Keeps your service contract:
 * - Initializes credit_manager if needed.
 * - Sets the user's on-chain score + credit limit for the configured wrapped asset.
 * - Returns 200 to signal success to the caller.
 *
 * Note: “credit score” is also stored off-chain in your DB; on-chain you’re storing it
 * here via credit_manager::admin_set_line (u8) together with the limit (u64).
 */
export async function giveCreditScoreAndLimit(
  address: string,
  opts?: { score?: number; limitHuman?: string; assetType?: string; decimals?: number }
) {
  const score     = opts?.score     ?? 180;   // sensible default
  const limit     = opts?.limitHuman ?? "1000";
  const assetType = opts?.assetType ?? ASSET_TYPE;
  const decimals  = opts?.decimals  ?? DECIMALS;

  await ensureCreditManagerInitialized();

  // If your module also requires a separate init for scores, do it idempotently here:
  // try { await signSubmitWait({ signer: getAdmin(), func: fq("credit_manager", "init_scores") }); } catch {}

  await adminSetLineForUser({
    userAddress: address,
    score,
    limitHuman: limit,
    assetType,
    decimals,
  });

  return 200;
}
