import {
  Aptos,
  AptosConfig,
  Account,
  Ed25519PrivateKey,
  AccountAddress,
  type InputViewFunctionData,
  type MoveValue,
  type EntryFunctionArgumentTypes,
  type U64,
} from "@aptos-labs/ts-sdk";

/**
 * Configuration
 */
const NODE_URL = process.env.APTOS_NODE_URL ?? "https://api.devnet.aptoslabs.com/v1";
const PK_HEX = process.env.APTOS_PRIVATE_KEY!;
const PACKAGE = process.env.LENDOOR_CONTRACT!; // e.g. 0x... (Move package address)
const COIN = process.env.USDC_TYPE ?? "0x1::aptos_coin::AptosCoin";
const USDC_DEC = Number(process.env.USDC_DECIMALS ?? "6");

/**
 * SDK instances
 */
const aptos = new Aptos(new AptosConfig({ fullnode: NODE_URL }));

const pk = new Ed25519PrivateKey(PK_HEX.startsWith("0x") ? PK_HEX : `0x${PK_HEX}`);
export const admin = Account.fromPrivateKey({ privateKey: pk });

/**
 * Types & helpers
 */
type FQName = `${string}::${string}::${string}`;
const fq = (m: string, f: string) => `${PACKAGE}::${m}::${f}` as FQName;

// Coerce bigint to branded U64 expected by ts-sdk. Guarantees 64-bit range.
const toU64 = (v: bigint): U64 => BigInt.asUintN(64, v) as unknown as U64;

// Parse/format helpers for Aptos u64 amounts.
function parseUnitsAptos(amount: string, decimals: number): bigint {
  const [i, f = ""] = amount.split(".");
  const base = 10n ** BigInt(decimals);
  const clean = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(i || "0") * base + BigInt(clean || "0");
}

/**
 * Build → sign → submit → wait
 */
async function signSubmitWait(params: {
  signer: Account;
  func: FQName;
  typeArguments?: string[];
  functionArguments?: EntryFunctionArgumentTypes[];
}) {
  const { signer, func, typeArguments = [], functionArguments = [] } = params;

  const transaction = await aptos.transaction.build.simple({
    sender: signer.accountAddress,
    data: {
      function: func,
      typeArguments,
      functionArguments,
    },
  });

  const pending = await aptos.signAndSubmitTransaction({
    signer,
    transaction,
  });

  await aptos.waitForTransaction({ transactionHash: pending.hash });
  return pending.hash;
}

/**
 * Contract calls
 */
async function ensureCreditManagerInitialized() {
  try {
    await signSubmitWait({
      signer: admin,
      func: fq("credit_manager", "init"),
    });
  } catch {
    // Already initialized → ignore
  }
}

async function adminSetLimitForUser(
  userAddress: string,
  amountHuman: string,
  assetType: string = COIN,
  decimals: number = USDC_DEC
) {
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

/**
 * Views
 */
export async function getUserLimit(userAddress: string, assetType: string = COIN): Promise<bigint> {
  const payload: InputViewFunctionData = {
    function: fq("credit_manager", "get_limit"),
    typeArguments: [assetType],
    functionArguments: [userAddress],
  };
  const [limit] = await aptos.view<[MoveValue]>({ payload });
  return BigInt(limit as any);
}

export async function getUserUsage(userAddress: string, assetType: string = COIN): Promise<bigint> {
  const payload: InputViewFunctionData = {
    function: fq("credit_manager", "get_usage"),
    typeArguments: [assetType],
    functionArguments: [userAddress],
  };
  const [usage] = await aptos.view<[MoveValue]>({ payload });
  return BigInt(usage as any);
}

/**
 * Public API used by your service layer
 */
export async function giveCreditScoreAndLimit(address: string) {
  await ensureCreditManagerInitialized();
  await adminSetLimitForUser(address, "1000", COIN, USDC_DEC);
  return 200;
}
