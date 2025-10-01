// backend/src/config/contractConfig.ts
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

/* ------------------- env helpers ------------------- */
function requireEnv(name: string, ...fallbacks: string[]) {
  const keys = [name, ...fallbacks];
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  throw new Error(
    `Missing required env var: ${name}${fallbacks.length ? ` (or ${fallbacks.join(" / ")})` : ""}`,
  );
}

/* ------------------- config ------------------- */
const NODE_URL = process.env.APTOS_NODE_URL?.trim() || "https://api.devnet.aptoslabs.com/v1";
const PACKAGE  = requireEnv("LENDOOR_CONTRACT", "VITE_LENDOOR_CONTRACT");
const COIN     = process.env.USDC_TYPE?.trim() || "0x1::aptos_coin::AptosCoin";
const USDC_DEC = Number(process.env.USDC_DECIMALS ?? "6");

/* ------------------- lazy singletons ------------------- */
let _aptos: Aptos | null = null;
let _admin: Account | null = null;

function getAptos(): Aptos {
  if (_aptos) return _aptos;
  _aptos =
    NODE_URL.includes("devnet")
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
      "APTOS_PRIVATE_KEY (or PRIVATE_KEY) is missing. Check your backend .env and process manager env.",
    );
  }

  const pkHex = pkHexRaw.startsWith("0x") ? pkHexRaw : `0x${pkHexRaw}`;
  const pk = new Ed25519PrivateKey(pkHex);
  _admin = Account.fromPrivateKey({ privateKey: pk });
  return _admin;
}

/* ------------------- types & utils ------------------- */
type FQName = `${string}::${string}::${string}`;
const fq = (m: string, f: string) => `${PACKAGE}::${m}::${f}` as FQName;

const toU64 = (v: bigint): U64 => BigInt.asUintN(64, v) as unknown as U64;

function parseUnitsAptos(amount: string, decimals: number): bigint {
  const [i, f = ""] = amount.split(".");
  const base = 10n ** BigInt(decimals);
  const clean = (f + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(i || "0") * base) + BigInt(clean || "0");
}

/* ------------------- tx helper ------------------- */
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

/* ------------------- contract calls ------------------- */
async function ensureCreditManagerInitialized() {
  const admin = getAdmin();
  try {
    await signSubmitWait({ signer: admin, func: fq("credit_manager", "init") });
  } catch {
    // already initialized
  }
}

async function adminSetLimitForUser(
  userAddress: string,
  amountHuman: string,
  assetType: string = COIN,
  decimals: number = USDC_DEC,
) {
  const admin = getAdmin();
  const amountU64: U64 = toU64(parseUnitsAptos(amountHuman, decimals));
  const args: EntryFunctionArgumentTypes[] = [
    AccountAddress.fromString(userAddress),
    amountU64,
  ];
  return signSubmitWait({
    signer: admin,
    func: fq("credit_manager", "admin_set_limit"),
    typeArguments: [assetType],
    functionArguments: args,
  });
}

/* ------------------- views ------------------- */
export async function getUserLimit(userAddress: string, assetType: string = COIN): Promise<bigint> {
  const aptos = getAptos();
  const payload: InputViewFunctionData = {
    function: fq("credit_manager", "get_limit"),
    typeArguments: [assetType],
    functionArguments: [userAddress],
  };
  const [limit] = await aptos.view<[MoveValue]>({ payload });
  return BigInt(limit as any);
}

export async function getUserUsage(userAddress: string, assetType: string = COIN): Promise<bigint> {
  const aptos = getAptos();
  const payload: InputViewFunctionData = {
    function: fq("credit_manager", "get_usage"),
    typeArguments: [assetType],
    functionArguments: [userAddress],
  };
  const [usage] = await aptos.view<[MoveValue]>({ payload });
  return BigInt(usage as any);
}

/* ------------------- public API ------------------- */
export async function giveCreditScoreAndLimit(address: string) {
  await ensureCreditManagerInitialized();
  await adminSetLimitForUser(address, "1000", COIN, USDC_DEC);
  return 200;
}
