import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { LENDOOR_CONTRACT } from "./constants"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// -------- Aptos unit helpers (u64-compatible) --------
export function parseUnitsAptos(amountStr: string, decimals: number): bigint {
  const [int, frac = ""] = amountStr.trim().split(".")
  const base = (10n ** BigInt(decimals))
  const cleanFrac = (frac + "0".repeat(decimals)).slice(0, decimals)
  return (BigInt(int || "0") * base) + BigInt(cleanFrac || "0")
}

export function formatUnitsAptos(v: bigint | string, decimals: number): string {
  const n = BigInt(typeof v === "string" ? v : v)
  const base = 10n ** BigInt(decimals)
  const i = n / base
  const f = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "")
  return f.length ? `${i}.${f}` : i.toString()
}

// FQName builder
export const fq = (moduleName: string, fn: string) => `${LENDOOR_CONTRACT}::${moduleName}::${fn}`