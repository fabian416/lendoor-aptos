'use client'

import * as React from 'react'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { LENDOOR_CONTRACT, WUSDC_DECIMALS, WUSDC_TYPE } from '@/lib/constants'
import { toBigIntLoose, decRaw } from '@/lib/utils'
import { shouldSkip, onSuccess, onError } from '@/lib/backoff'

type Options = { pollMs?: number }

/** Format integer amount by cutting decimals and adding thousand separators. */
function formatUnits0(amount: bigint, decimals = 6): string {
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/* ----------------------------- Silent view layer ---------------------------- */

type ViewOk = { ok: true; data: unknown[] }
type ViewErr = { ok: false; status: number; text: string }
type ViewResp = ViewOk | ViewErr
const isViewErr = (r: ViewResp): r is ViewErr => r.ok === false

const DEFAULT_NODE =
  process.env.NEXT_PUBLIC_APTOS_NODE ?? 'https://api.testnet.aptoslabs.com'

/** Resolve a proper fullnode URL. If it’s relative or empty, fall back to DEFAULT_NODE. */
function resolveNodeUrl(aptos: any): string {
  let u =
    aptos?.config?.fullnode?.[0] ??
    aptos?.config?.fullnodeUrl ??
    aptos?.client?.nodeUrl ??
    aptos?.nodeUrl ??
    DEFAULT_NODE
  u = String(u || '').trim()
  if (!/^https?:\/\//i.test(u)) u = DEFAULT_NODE // evita 404 por rutas relativas
  return u.replace(/\/+$/, '')
}
function viewUrl(base: string): string {
  const clean = base.replace(/\/+$/, '')
  return /\/v1$/i.test(clean) ? `${clean}/view` : `${clean}/v1/view`
}

/** POST /v1/view 100% silencioso (nunca throw, sin console.*) */
async function silentViewRaw(
  aptos: any,
  payload: { function: string; typeArguments?: string[]; functionArguments?: any[] }
): Promise<ViewResp> {
  const url = viewUrl(resolveNodeUrl(aptos))
  const body = JSON.stringify({
    function: payload.function,
    type_arguments: payload.typeArguments ?? [],
    arguments: payload.functionArguments ?? [],
  })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    const text = await res.text().catch(() => '')
    if (!res.ok) return { ok: false, status: res.status, text }
    let data: unknown[] = []
    try { data = text ? JSON.parse(text) : [] } catch { /* ignore */ }
    return { ok: true, data }
  } catch {
    return { ok: false, status: 0, text: 'network error' }
  }
}

/**
 * View helper que devuelve `bigint | null` y **NUNCA** lanza:
 *  - Aborts típicos (no init / usuario faltante) → `null` (UI muestra '—').
 *  - Otros HTTP (404/429/0) → `null` (UI muestra '—').
 *  - Éxito → bigint (puede ser 0n real).
 */
async function safeViewBigintNullable(
  aptos: any,
  fn: string,
  typeArguments: string[],
  functionArguments: any[]
): Promise<bigint | null> {
  const r = await silentViewRaw(aptos, { function: fn, typeArguments, functionArguments })
  if (isViewErr(r)) {
    const t = r.text.toLowerCase?.() ?? ''
    const isAbort = r.status === 400 && /move abort|abort|e_/.test(t)
    const notInit = /not\s*initialized|e_not_initialized|globalcredit/.test(t)
    const missingUser = /user.*(missing|not found)/.test(t)
    if (isAbort && (notInit || missingUser)) return null
    // 404 módulo, 429 rate limit, 0 network, etc.
    return null
  }
  const v = (r.data?.[0] as any)
  if (v == null) return 0n
  if (typeof v === 'object' && !Array.isArray(v)) return decRaw(v)
  return toBigIntLoose(v)
}

/* ----------------------------------- Hook ---------------------------------- */

/**
 * Credit line hook: muestra "<used>/<limit> USDC".
 * - Si no hay perfil / contrato no inicializado / errores → '—' y '—/—' sin logs.
 */
export function useCreditLine({ pollMs = 15_000 }: Options = {}) {
  const { aptos } = useAptos()
  const { account } = useWallet()
  const owner = account?.address ? String(account.address) : null

  const [clmAddress] = React.useState<string | null>(LENDOOR_CONTRACT)

  const [limitRaw, setLimitRaw] = React.useState<bigint | null>(null)
  const [usageRaw, setUsageRaw] = React.useState<bigint | null>(null)

  const [limitDisplay, setLimitDisplay] = React.useState<string>('—/—')
  const [borrowedDisplay, setBorrowedDisplay] = React.useState<string>('—')

  const [loading, setLoading] = React.useState(false)
  const [error] = React.useState<string | null>(null) // no mostramos errores acá

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const runningRef = React.useRef(false)
  const mountedRef = React.useRef(true)

  const key = React.useMemo(() => `credit:${owner ?? 'unknown'}:${WUSDC_TYPE}`, [owner])

  const schedule = React.useCallback((ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void read(), ms)
  }, [])

  const read = React.useCallback(async () => {
    if (!owner) {
      setLimitRaw(null)
      setUsageRaw(null)
      setBorrowedDisplay('—')
      setLimitDisplay('—/—')
      return
    }
    if (runningRef.current) return
    if (shouldSkip(key)) { schedule(5_000); return }

    runningRef.current = true
    setLoading(true)

    try {
      // lendoor::credit_manager::{get_limit, get_usage}<Asset>(user)
      const [limit, usage] = await Promise.all([
        safeViewBigintNullable(
          aptos,
          `${LENDOOR_CONTRACT}::credit_manager::get_limit`,
          [WUSDC_TYPE],
          [owner],
        ),
        safeViewBigintNullable(
          aptos,
          `${LENDOOR_CONTRACT}::credit_manager::get_usage`,
          [WUSDC_TYPE],
          [owner],
        ),
      ])

      if (!mountedRef.current) return

      setLimitRaw(limit)
      setUsageRaw(usage)

      if (limit == null || usage == null) {
        // Sin datos (perfil no creado / contrato no init / rate limit / etc.)
        setBorrowedDisplay('—')
        setLimitDisplay('—/—')
        schedule(onError(key, 'no-data')) // backoff suave
      } else {
        const dBorrowed = formatUnits0(usage, WUSDC_DECIMALS)
        const dLimit = formatUnits0(limit, WUSDC_DECIMALS)
        if (borrowedDisplay !== dBorrowed) setBorrowedDisplay(dBorrowed)
        const pair = `${dBorrowed}/${dLimit} USDC`
        if (limitDisplay !== pair) setLimitDisplay(pair)
        schedule(onSuccess(key, pollMs))
      }
    } finally {
      if (mountedRef.current) setLoading(false)
      runningRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aptos, owner, key, pollMs, schedule, borrowedDisplay, limitDisplay])

  React.useEffect(() => {
    mountedRef.current = true
    void read()
    return () => {
      mountedRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [read])

  React.useEffect(() => {
    // Reset al cambiar de cuenta
    if (timerRef.current) clearTimeout(timerRef.current)
    setLimitRaw(null)
    setUsageRaw(null)
    setBorrowedDisplay('—')
    setLimitDisplay('—/—')
    timerRef.current = setTimeout(() => void read(), 0)
  }, [owner, read])

  return {
    clmAddress,
    scoreRaw: null,
    scoreDisplay: '—',
    limitRaw,
    borrowedRaw: usageRaw,
    borrowedDisplay,
    limitDisplay,
    loading,
    error,
    refresh: read,
  }
}
