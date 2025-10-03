import "dotenv/config";
import {
  Aptos,
  AptosConfig,
  Account,
  Ed25519PrivateKey,
  Network,
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
export const ASSET_TYPE =
  process.env.WUSDC_TYPE?.trim() ||
  process.env.USDC_TYPE?.trim() || // legacy fallback
  "0x1::aptos_coin::AptosCoin";    // final fallback (dev-only)

// Decimals for the wrapped coin (USDC-style = 6)
export const DECIMALS = Number(
  process.env.WUSDC_DECIMALS ?? process.env.USDC_DECIMALS ?? "6"
);

/* ----------------------- lazy singletons (SDK/Admin) ----------------------- */
let _aptos: Aptos | null = null;
let _admin: Account | null = null;

export function getAptos(): Aptos {
  if (_aptos) return _aptos;
  _aptos =
    NODE_URL.includes("testnet")
      ? new Aptos(new AptosConfig({ network: Network.TESTNET }))
      : NODE_URL.includes("devnet")
      ? new Aptos(new AptosConfig({ network: Network.DEVNET }))
      : new Aptos(new AptosConfig({ network: Network.CUSTOM, fullnode: NODE_URL }));
  return _aptos;
}

export function getAdmin(): Account {
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
export const fq = (m: string, f: string) => `${PACKAGE}::${m}::${f}` as FQName;

// Safe u64 cast with bounds check
export const toU64 = (v: bigint): U64 => {
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
export const asArg = (v: unknown) => v as unknown as EntryFunctionArgumentTypes;

/* -------------------------------------------------------------------------- */
/*                                TX HELPER (SDK)                              */
/* -------------------------------------------------------------------------- */

export async function signSubmitWait(params: {
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
