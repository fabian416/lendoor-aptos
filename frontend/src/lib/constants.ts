import { Network } from "@aptos-labs/ts-sdk";
import { FQName } from "@/types/aptos";

export const BACKEND_URL =
  (import.meta.env.VITE_PUBLIC_BACKEND_URL as string) ?? "http://localhost:5001";

export const NETWORK: Network =
  (import.meta.env.VITE_APTOS_NETWORK as Network) ?? Network.DEVNET;

export const APTOS_API_KEY =
  (import.meta.env.VITE_APTOS_API_KEY as string) ?? "";

/** Package (object) address donde se publicó el core package */
export const LENDOOR_CONTRACT: `0x${string}` = (() => {
  const v =
    (import.meta.env.VITE_LENDOOR_ADDRESS as string) || // ← si tus scripts guardan esta
    (import.meta.env.VITE_LENDOOR_CONTRACT as string);  // fallback por compatibilidad
  if (!v) throw new Error("Missing VITE_LENDOOR_ADDRESS (or VITE_LENDOOR_CONTRACT)");
  if (!/^0x[0-9a-fA-F]+$/.test(v)) throw new Error(`Invalid Move address: ${v}`);
  return v as `0x${string}`;
})();

/** Nombre del módulo que expone deposit/balance_of (por defecto 'reserve') */
export const LENDOOR_MODULE =
  (import.meta.env.VITE_LENDOOR_MODULE as string | undefined) ?? "reserve";

/** Coin type & decimals para UI */
export const USDC_TYPE: FQName =
  ((import.meta.env.VITE_USDC_TYPE as string) || "0x1::aptos_coin::AptosCoin") as FQName;

export const USDC_DECIMALS = Number(import.meta.env.VITE_USDC_DECIMALS ?? 6);
