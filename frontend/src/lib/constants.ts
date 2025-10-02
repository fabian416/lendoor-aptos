import { Network } from "@aptos-labs/ts-sdk";
import type { FQName } from "@/types/aptos";

/** Fail fast if an env var is missing or malformatted */
function assertEnv(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/** Enforce 0x-prefixed hex */
function asHexAddr(v: string | undefined, key: string): `0x${string}` {
  const s = (v ?? "").replace(/^"|"$/g, ""); // strip accidental quotes
  assertEnv(/^0x[0-9a-fA-F]+$/.test(s), `Invalid or missing ${key}`);
  return s as `0x${string}`;
}

/** Compose fully-qualified type name */
function coinType(addr: `0x${string}`, mod: string, name: string): FQName {
  return `${addr}::${mod}::${name}` as FQName;
}

const ENV = import.meta.env as unknown as Record<string, string | undefined>;

/** IMPORTANT: must be lowercase ("testnet" / "devnet" / "mainnet" / "local") */
export const NETWORK: Network =
  (ENV.VITE_APTOS_NETWORK as Network) ?? Network.TESTNET;

/** Optional API key (usually only for mainnet) */
export const APTOS_API_KEY: string = ENV.VITE_APTOS_API_KEY ?? "";

/** Your package address ON TESTNET (must be the package, not an object/resource) */
export const LENDOOR_CONTRACT: `0x${string}` = asHexAddr(
  ENV.VITE_LENDOOR_ADDRESS || ENV.VITE_LENDOOR_CONTRACT,
  "VITE_LENDOOR_ADDRESS"
);

/** Default module used by generic callers (override per use) */
export const LENDOOR_MODULE: string = ENV.VITE_LENDOOR_MODULE ?? "reserve";

/** WUSDC coin type (MUST exist at that package on TESTNET) */
export const WUSDC_MODULE = ENV.VITE_WUSDC_MODULE ?? "wusdc";
export const WUSDC_STRUCT = ENV.VITE_WUSDC_STRUCT ?? "WUSDC";
export const WUSDC_TYPE: FQName = coinType(LENDOOR_CONTRACT, WUSDC_MODULE, WUSDC_STRUCT);

/** FA metadata object (address of the FA metadata; keep it testnet) */
export const FA_METADATA_OBJECT: `0x${string}` = asHexAddr(
  ENV.VITE_FA_METADATA_OBJECT || ENV.VITE_USDC_ADDRESS,
  "VITE_FA_METADATA_OBJECT / VITE_USDC_ADDRESS"
);

/** Display/convert decimals for USDC-style amounts */
export const WUSDC_DECIMALS: number = Number(ENV.VITE_USDC_DECIMALS ?? 6);

// jUSDC = junior shares sobre WUSDC
export const JUSDC_TYPE: FQName =
  `${LENDOOR_CONTRACT}::junior::S<${WUSDC_TYPE}>` as FQName;

/** Backend */
export const BACKEND_URL: string = ENV.VITE_PUBLIC_BACKEND_URL ?? "http://localhost:5001";

/** Helper for function FQN */
export const fq = (moduleName: string, fn: string) =>
  `${LENDOOR_CONTRACT}::${moduleName}::${fn}`;

export const MODULES = {
  controller: "controller",
  reserve: "reserve",
  wrapper: "fa_to_coin_wrapper",
  trancheConfig: "tranche_config",
  junior: "junior",
} as const;
