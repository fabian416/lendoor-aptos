import {
  AccountAddress,
  InputViewFunctionData,
  MoveValue,
  type EntryFunctionArgumentTypes,
  type U64,
} from "@aptos-labs/ts-sdk";
import {
  asArg,
  ASSET_TYPE,
  DECIMALS,
  fq,
  getAdmin,
  getAptos,
  parseUnitsAptos,
  signSubmitWait,
  toU64,
} from "./config";

/* -------------------------------------------------------------------------- */
/*                              Internal helpers                               */
/* -------------------------------------------------------------------------- */

// Normalize view result [x] or [[x]] to bigint
function unwrapSingleU64(result: unknown): bigint {
  const pick = (v: unknown): unknown => (Array.isArray(v) && v.length === 1 ? v[0] : v);
  const v = pick(pick(result));
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(v);
  if (typeof v === "string") return BigInt(v);
  throw new Error(`Unexpected view result shape: ${JSON.stringify(result)}`);
}

function ensure0x(addr: string): string {
  const t = addr.trim();
  return t.startsWith("0x") ? t : `0x${t}`;
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
    functionArguments: [ensure0x(userAddress)],
  };
  const out = await aptos.view<MoveValue[]>({ payload });
  return unwrapSingleU64(out);
}

export async function getUserUsage(
  userAddress: string,
  assetType: string = ASSET_TYPE
): Promise<bigint> {
  const aptos = getAptos();
  const payload: InputViewFunctionData = {
    function: fq("credit_manager", "get_usage"),
    typeArguments: [assetType],
    functionArguments: [ensure0x(userAddress)],
  };
  const out = await aptos.view<MoveValue[]>({ payload });
  return unwrapSingleU64(out);
}

/* -------------------------------------------------------------------------- */
/*                             ONE-TIME INITIALIZERS                           */
/* -------------------------------------------------------------------------- */

async function isControllerConfigured(): Promise<boolean> {
  const aptos = getAptos();
  try {
    const payload: InputViewFunctionData = {
      function: fq("controller_config", "config_present"),
      functionArguments: [],
      typeArguments: [],
    };
    const out = await aptos.view<MoveValue[]>({ payload });
    const v = Array.isArray(out) ? out[0] : out;
    return Boolean(v);
  } catch {
    return false;
  }
}

/** Ensure controller_config is initialized via controller::init(admin_addr). */
async function ensureControllerInitialized() {
  const admin = getAdmin();
  if (await isControllerConfigured()) return;
  await signSubmitWait({
    signer: admin,
    func: fq("controller", "init"),
    functionArguments: [asArg(admin.accountAddress.toString())],
  });
}

/** Ensure credit_manager::init has been run (idempotent). */
async function ensureCreditManagerInitialized() {
  const admin = getAdmin();
  try {
    await signSubmitWait({ signer: admin, func: fq("credit_manager", "init") });
  } catch {
    // Already initialized -> fine
  }
}

/** Ensure credit_manager::init_scores has been run (idempotent). */
async function ensureScoresInitialized() {
  const admin = getAdmin();
  try {
    await signSubmitWait({ signer: admin, func: fq("credit_manager", "init_scores") });
  } catch {
    // Already initialized -> fine
  }
}

/* -------------------------------------------------------------------------- */
/*                              ON-CHAIN OPERATIONS                            */
/* -------------------------------------------------------------------------- */

/** Admin: pause/unpause a user. */
export async function adminPauseUser(userAddress: string, paused: boolean) {
  const admin = getAdmin();
  const args: EntryFunctionArgumentTypes[] = [
    asArg(AccountAddress.fromString(userAddress)),
    asArg(paused),
  ];
  const hash = await signSubmitWait({
    signer: admin,
    func: fq("credit_manager", "admin_pause_user"),
    functionArguments: args,
  });
  return { hash, paused };
}

/** Admin: set (replace) a user's per-asset credit limit (u64 base units). */
export async function adminSetLimitForUser(params: {
  userAddress: string;
  limitHuman: string;
  assetType?: string;
  decimals?: number;
}) {
  const { userAddress, limitHuman, assetType = ASSET_TYPE, decimals = DECIMALS } = params;
  const admin = getAdmin();

  if (!userAddress?.trim()) throw new Error("userAddress is required");
  if (!limitHuman?.trim()) throw new Error("limitHuman is required");

  const limitU64: U64 = toU64(parseUnitsAptos(limitHuman, decimals));
  const args: EntryFunctionArgumentTypes[] = [
    asArg(AccountAddress.fromString(userAddress)),
    asArg(limitU64),
  ];

  const hash = await signSubmitWait({
    signer: admin,
    func: fq("credit_manager", "admin_set_limit"),
    typeArguments: [assetType],
    functionArguments: args,
  });

  return { hash, limitU64, assetType };
}

/** Admin: set a user's score (u8). Hardcoded default = 180. */
export async function adminSetScoreForUser(params: {
  userAddress: string;
  score?: number; // default 180
}) {
  const admin = getAdmin();
  const { userAddress } = params;
  const scoreU8 = ((params.score ?? 180) | 0) & 0xff;

  if (!userAddress?.trim()) throw new Error("userAddress is required");

  const args: EntryFunctionArgumentTypes[] = [
    asArg(AccountAddress.fromString(userAddress)),
    asArg(scoreU8),
  ];

  const hash = await signSubmitWait({
    signer: admin,
    func: fq("credit_manager", "admin_set_score"),
    functionArguments: args,
  });

  return { hash, score: scoreU8 };
}

/**
 * Admin: set score (u8) + limit (u64) in one transaction.
 * Matches your working CLI: credit_manager::admin_set_line<AssetType>(addr, u8, u64).
 */
export async function adminSetLineForUser(params: {
  userAddress: string;
  score?: number;       // default 180
  limitHuman: string;   // human units
  assetType?: string;
  decimals?: number;
}) {
  const {
    userAddress,
    limitHuman,
    score = 180,
    assetType = ASSET_TYPE,
    decimals = DECIMALS,
  } = params;

  if (!userAddress?.trim()) throw new Error("userAddress is required");
  if (!limitHuman?.trim()) throw new Error("limitHuman is required");

  const admin = getAdmin();
  const scoreU8 = (score | 0) & 0xff;
  const limitU64: U64 = toU64(parseUnitsAptos(limitHuman, decimals));

  const args: EntryFunctionArgumentTypes[] = [
    asArg(AccountAddress.fromString(userAddress)), // address
    asArg(scoreU8),                                // u8
    asArg(limitU64),                               // u64
  ];

  const hash = await signSubmitWait({
    signer: admin,
    func: fq("credit_manager", "admin_set_line"),
    typeArguments: [assetType],
    functionArguments: args,
  });

  return { hash, score: scoreU8, limitU64, assetType };
}

/* -------------------------------------------------------------------------- */
/*                           PUBLIC SERVICE ENDPOINT                           */
/* -------------------------------------------------------------------------- */

/**
 * Ensures controller + credit_manager + scores are initialized.
 * Then sets **score = 180** and the limit. Uses `admin_set_line` (single tx).
 */
export async function giveCreditScoreAndLimit(
  address: string,
  opts?: { score?: number; limitHuman?: string; assetType?: string; decimals?: number }
) {
  const assetType = opts?.assetType ?? ASSET_TYPE;
  const decimals  = opts?.decimals  ?? DECIMALS;
  const limit     = opts?.limitHuman ?? "1000";
  const score     = 180;

  await ensureControllerInitialized();
  await ensureCreditManagerInitialized();
  await ensureScoresInitialized();

  // Preferred: single transaction that sets both score and limit
  await adminSetLineForUser({ userAddress: address, score, limitHuman: limit, assetType, decimals });

  // If you ever need the two-step path instead:
  // await adminSetScoreForUser({ userAddress: address, score });
  // await adminSetLimitForUser({ userAddress: address, limitHuman: limit, assetType, decimals });

  return 200;
}
