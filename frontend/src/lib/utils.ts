import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { LENDOOR_CONTRACT, WUSDC_DECIMALS, WUSDC_TYPE } from "./constants"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Parse human string → on-chain base units (u64-compatible). */
export function parseUnitsAptos(amountStr: string, decimals: number): bigint {
  const [int, frac = ""] = amountStr.trim().split(".")
  const base = 10n ** BigInt(decimals)
  const cleanFrac = (frac + "0".repeat(decimals)).slice(0, decimals)
  return (BigInt(int || "0") * base) + BigInt(cleanFrac || "0")
}

/** Format base units (bigint) → human string with `decimals`. */
export function formatUnitsAptos(v: bigint | string, decimals: number): string {
  const n = BigInt(typeof v === "string" ? v : v)
  const base = 10n ** BigInt(decimals)
  const i = n / base
  const f = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "")
  return f.length ? `${i}.${f}` : i.toString()
}

/** Build a fully-qualified function name for Move calls. */
export const fq = (moduleName: string, fn: string) =>
  `${LENDOOR_CONTRACT}::${moduleName}::${fn}`

/** Keep legacy export but source decimals from the FA config. */
export const DECIMALS = WUSDC_DECIMALS

/** Pretty-print a USDC-style amount with 2 decimals (expects base units when bigint). */
export function formatUSDCAmount2dp(value: bigint | string): string {
  const asString =
    typeof value === "bigint" ? formatUnitsAptos(value, DECIMALS) : value
  const num = Number(asString)
  if (!Number.isFinite(num)) return asString
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(num)
}


export const SECONDS_PER_YEAR = 31_536_000
export const DEC_SCALE = 1_000_000_000n // on-chain Decimal uses 1e9 scale



/** Best-effort bigint decoder for Move values (u64/u128 as string/number) */
export function toBigIntLoose(v: any): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') return BigInt(v)
  if (typeof v === 'string') return BigInt(v)
  throw new Error(`Cannot coerce to bigint: ${String(v)}`)
}

/** Extract raw Decimal (u128 scaled by 1e9) from arbitrary struct shape */
export function decRaw(v: any): bigint {
  if (v == null) return 0n
  if (typeof v === 'bigint' || typeof v === 'number' || typeof v === 'string') {
    return toBigIntLoose(v)
  }
  // Common field names; keep minimal but practical.
  if (typeof v === 'object') {
    if ('v' in v) return toBigIntLoose((v as any).v)
    if ('value' in v) return toBigIntLoose((v as any).value)
    if ('inner' in v) return toBigIntLoose((v as any).inner)
  }
  throw new Error(`Unknown Decimal shape: ${JSON.stringify(v)}`)
}

/** Compute PPS (price per LP) in Decimal raw scale (1e9). */
export async function readPpsScaled(aptos: any): Promise<bigint | null> {
  try {
    // reserve::reserve_state<Coin>() -> ReserveDetails
    const [state] = await aptos.view({
      payload: {
        function: `${LENDOOR_CONTRACT}::reserve::reserve_state`,
        typeArguments: [WUSDC_TYPE],
        functionArguments: [],
      },
    })

    if (!state) return null

    const totalLp = toBigIntLoose(state.total_lp_supply) // u128
    const cashU128 = toBigIntLoose(state.total_cash_available) // u128
    const initEx = decRaw(state.initial_exchange_rate) // 1e9
    const reserveAmt = decRaw(state.reserve_amount) // 1e9
    const borrowed = decRaw(state.total_borrowed) // 1e9

    if (totalLp === 0n) return initEx

    // total_user_liquidity = borrowed + cash - reserve (all in 1e9 scale)
    const cashScaled = cashU128 * DEC_SCALE
    const tvlScaled = borrowed + cashScaled - reserveAmt
    if (tvlScaled <= 0n) return null

    // PPS = tvl / totalLp (still in 1e9 scale)
    return tvlScaled / totalLp
  } catch {
    return null
  }
}
