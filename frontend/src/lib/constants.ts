// src/lib/constants.ts
import { Network } from "@aptos-labs/ts-sdk";
import type { FQName } from "@/types/aptos";

/* --------------------------- small helpers --------------------------- */
function assertEnv(cond: any, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function asHexAddr(v: string | undefined, key: string): `0x${string}` {
  const s = (v ?? "").replace(/^"|"$/g, "");
  assertEnv(/^0x[0-9a-fA-F]+$/.test(s), `Invalid or missing ${key}`);
  return s as `0x${string}`;
}

function coinType(addr: `0x${string}`, mod: string, name: string): FQName {
  return `${addr}::${mod}::${name}` as FQName;
}

/* -------------------------------- env -------------------------------- */
const ENV = import.meta.env as unknown as Record<string, string | undefined>;

/* --------------------------- network & api keys ----------------------- */
export const NETWORK: Network =
  (ENV.VITE_APTOS_NETWORK as Network) ?? Network.DEVNET;

export const APTOS_API_KEY: string = ENV.VITE_APTOS_API_KEY ?? "";

/* ----------------------------- core package --------------------------- */
// Package/object address where your Move package is published.
export const LENDOOR_CONTRACT: `0x${string}` = asHexAddr(
  ENV.VITE_LENDOOR_ADDRESS || ENV.VITE_LENDOOR_CONTRACT,
  "VITE_LENDOOR_ADDRESS"
);

// Default module name for generic calls (you can override per-provider).
export const LENDOOR_MODULE: string = ENV.VITE_LENDOOR_MODULE ?? "reserve";

/* ------------------------------- WUSDC FA ----------------------------- */
// Module/struct for your wrapped FA coin.
export const WUSDC_MODULE = ENV.VITE_WUSDC_MODULE ?? "wusdc";
export const WUSDC_STRUCT = ENV.VITE_WUSDC_STRUCT ?? "WUSDC";

// Fully-qualified coin type used as type-arg in entry/view.
export const WUSDC_TYPE: FQName = coinType(
  LENDOOR_CONTRACT,
  WUSDC_MODULE,
  WUSDC_STRUCT
);

// FA metadata object address used during wrapper pairing/init.
export const FA_METADATA_OBJECT: `0x${string}` = asHexAddr(
  ENV.VITE_FA_METADATA_OBJECT || ENV.VITE_USDC_ADDRESS,
  "VITE_FA_METADATA_OBJECT / VITE_USDC_ADDRESS"
);

// Token decimals for UI math/formatting.
export const WUSDC_DECIMALS: number = Number(ENV.VITE_USDC_DECIMALS ?? 6);

/* ------------------------------- misc -------------------------------- */
export const BACKEND_URL: string =
  ENV.VITE_PUBLIC_BACKEND_URL ?? "http://localhost:5001";

// Simple helper to build FN FQNs off the package address.
export const fq = (moduleName: string, fn: string) =>
  `${LENDOOR_CONTRACT}::${moduleName}::${fn}`;

// Handy labels for modules you call from the UI.
export const MODULES = {
  controller: "controller",
  reserve: "reserve",
  wrapper: "fa_to_coin_wrapper",
  trancheConfig: "tranche_config",
  junior: "junior",
} as const;
