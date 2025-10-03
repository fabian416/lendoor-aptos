'use client';

import * as React from 'react';
import { useAptos } from '@/providers/WalletProvider';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { LENDOOR_CONTRACT, WUSDC_TYPE, WUSDC_DECIMALS } from '@/lib/constants';

/* ========================================================================================
 * Credit line + score hook (silent views)
 *  - Reads:
 *      - lendoor::credit_manager::get_limit<Asset>(user) -> u64/u128 as string
 *      - lendoor::credit_manager::get_usage<Asset>(user) -> u64/u128 as string
 *      - lendoor::credit_manager::get_score(user)        -> u8 as number/string
 *  - Polls with gentle backoff and NEVER throws. UI-friendly: returns strings for display
 *    and raw values (bigint | null, number | null).
 *  - Fully self-contained (no external backoff/utils needed).
 * ====================================================================================== */

type Options = {
  /** How often to poll when data is healthy. Default 15s. */
  pollMs?: number;
  /** Optional override of asset type for limit/usage reads. Default: WUSDC_TYPE. */
  assetType?: string;
  /** Decimals for that asset (formatting only). Default: WUSDC_DECIMALS. */
  decimals?: number;
};

/* -------------------------------- small helpers -------------------------------- */

/** Naive formatter: integer `amount` → "<whole>" with thousands separators. */
function formatUnits0(amount: bigint, decimals = 6): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Best-effort coercion to BigInt from string/number/bigint. Returns null if invalid. */
function toBigIntLoose(v: unknown): bigint | null {
  try {
    if (typeof v === 'bigint') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return BigInt(Math.trunc(v));
    if (typeof v === 'string' && v.trim().length) return BigInt(v.trim());
    return null;
  } catch {
    return null;
  }
}

/** Best-effort coercion to u8 number (0..255) from any JSON-ish value. */
function toU8Loose(v: unknown): number | null {
  try {
    if (v == null) return null;
    const b = toBigIntLoose(v);
    if (b == null) return null;
    const n = Number(b);
    if (!Number.isFinite(n)) return null;
    if (n < 0 || n > 255) return null;
    return Math.trunc(n);
  } catch {
    return null;
  }
}

/* ---------------------------- minimal backoff memory ---------------------------- */

const backoffState = new Map<string, { failCount: number; nextAt: number }>();

function shouldSkip(key: string) {
  const s = backoffState.get(key);
  if (!s) return false;
  return Date.now() < s.nextAt;
}
function onSuccess(key: string, pollMs: number) {
  backoffState.set(key, { failCount: 0, nextAt: Date.now() + pollMs });
  return pollMs;
}
function onError(key: string, why: string) {
  const s = backoffState.get(key) ?? { failCount: 0, nextAt: 0 };
  const fail = Math.min(s.failCount + 1, 6); // cap ~max backoff
  const delay = Math.round(1000 * Math.pow(1.75, fail)); // ~1.7s → ~28s
  backoffState.set(key, { failCount: fail, nextAt: Date.now() + delay });
  return delay;
}

/* ------------------------------ silent /v1/view client ----------------------------- */

type ViewOk = { ok: true; data: unknown[] };
type ViewErr = { ok: false; status: number; text: string };
type ViewResp = ViewOk | ViewErr;
const isViewErr = (r: ViewResp): r is ViewErr => r.ok === false;

const DEFAULT_NODE = 'https://api.testnet.aptoslabs.com';

function resolveNodeUrl(aptos: any): string {
  let u =
    aptos?.config?.fullnode?.[0] ??
    aptos?.config?.fullnodeUrl ??
    aptos?.client?.nodeUrl ??
    aptos?.nodeUrl ??
    process.env.NEXT_PUBLIC_APTOS_NODE ??
    DEFAULT_NODE;
  u = String(u || '').trim();
  if (!/^https?:\/\//i.test(u)) u = DEFAULT_NODE; // guard against relative paths
  return u.replace(/\/+$/, '');
}
function viewUrl(base: string): string {
  const clean = base.replace(/\/+$/, '');
  return /\/v1$/i.test(clean) ? `${clean}/view` : `${clean}/v1/view`;
}

/** POST /v1/view — fully silent (never throws). */
async function silentViewRaw(
  aptos: any,
  payload: { function: string; typeArguments?: string[]; functionArguments?: any[] }
): Promise<ViewResp> {
  const url = viewUrl(resolveNodeUrl(aptos));
  const body = JSON.stringify({
    function: payload.function,
    type_arguments: payload.typeArguments ?? [],
    arguments: payload.functionArguments ?? [],
  });

  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    const text = await res.text().catch(() => '');
    if (!res.ok) return { ok: false, status: res.status, text };
    let data: unknown[] = [];
    try { data = text ? JSON.parse(text) : []; } catch { /* ignore parse */ }
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, text: 'network error' };
  }
}

/** View helper that returns `bigint | null` and NEVER throws. */
async function viewBigintNullable(
  aptos: any,
  fn: string,
  typeArguments: string[],
  functionArguments: any[]
): Promise<bigint | null> {
  const r = await silentViewRaw(aptos, { function: fn, typeArguments, functionArguments });
  if (isViewErr(r)) return null; // hide any abort/404/429/network
  const v = r.data?.[0];
  const bi = toBigIntLoose(v);
  return bi == null ? 0n : bi; // interpret missing as 0 for UX
}

/** View helper that returns `number | null` (u8) and NEVER throws. */
async function viewU8Nullable(
  aptos: any,
  fn: string,
  functionArguments: any[]
): Promise<number | null> {
  const r = await silentViewRaw(aptos, { function: fn, typeArguments: [], functionArguments });
  if (isViewErr(r)) return null;
  const u8 = toU8Loose(r.data?.[0]);
  return u8 == null ? 0 : u8; // interpret missing as 0 for UX
}

/* ------------------------------------ Hook ------------------------------------ */

export function useCreditLine(opts: Options = {}) {
  const { pollMs = 15_000, assetType = WUSDC_TYPE, decimals = WUSDC_DECIMALS } = opts;
  const { aptos } = useAptos();
  const { account } = useWallet();

  // Current owner (wallet address) as string, or null when disconnected.
  const owner = account?.address ? String(account.address) : null;

  // Raw values
  const [limitRaw, setLimitRaw] = React.useState<bigint | null>(null);
  const [usageRaw, setUsageRaw] = React.useState<bigint | null>(null);
  const [scoreRaw, setScoreRaw] = React.useState<number | null>(null);

  // Display strings (safe defaults)
  const [limitDisplay, setLimitDisplay] = React.useState<string>('—/—');
  const [borrowedDisplay, setBorrowedDisplay] = React.useState<string>('—');
  const [scoreDisplay, setScoreDisplay] = React.useState<string>('—/250');

  // Status
  const [loading, setLoading] = React.useState(false);
  const [error] = React.useState<string | null>(null); // we keep the UX silent

  // Control
  const key = React.useMemo(
    () => `credit:${owner ?? 'unknown'}:${assetType}`,
    [owner, assetType]
  );
  const mountedRef = React.useRef(true);
  const runningRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedule = React.useCallback((ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void read(), ms);
  }, []);

  const read = React.useCallback(async () => {
    // Reset when disconnected
    if (!owner) {
      setLimitRaw(null);
      setUsageRaw(null);
      setScoreRaw(null);
      setBorrowedDisplay('—');
      setLimitDisplay('—/—');
      setScoreDisplay('—/250');
      return;
    }
    if (runningRef.current) return;
    if (shouldSkip(key)) { schedule(3_000); return; }

    runningRef.current = true;
    setLoading(true);
    try {
      // Read in parallel:
      //   - get_limit<Asset>(owner)
      //   - get_usage<Asset>(owner)
      //   - get_score(owner)
      const [limit, usage, score] = await Promise.all([
        viewBigintNullable(
          aptos,
          `${LENDOOR_CONTRACT}::credit_manager::get_limit`,
          [assetType],
          [owner],
        ),
        viewBigintNullable(
          aptos,
          `${LENDOOR_CONTRACT}::credit_manager::get_usage`,
          [assetType],
          [owner],
        ),
        viewU8Nullable(
          aptos,
          `${LENDOOR_CONTRACT}::credit_manager::get_score`,
          [owner],
        ),
      ]);

      if (!mountedRef.current) return;

      setLimitRaw(limit);
      setUsageRaw(usage);
      setScoreRaw(score);

      // Borrowed / Limit display
      if (limit == null || usage == null) {
        setBorrowedDisplay('—');
        setLimitDisplay('—/—');
      } else {
        const dBorrowed = formatUnits0(usage, decimals);
        const dLimit = formatUnits0(limit, decimals);
        setBorrowedDisplay(dBorrowed);
        setLimitDisplay(`${dBorrowed}/${dLimit} USDC`);
      }

      // Score display
      if (score == null) setScoreDisplay('—/250');
      else setScoreDisplay(`${score}/250`);

      // Schedule next read (healthy vs backoff)
      const healthy = limit != null && usage != null;
      schedule(healthy ? onSuccess(key, pollMs) : onError(key, 'no-data'));
    } finally {
      if (mountedRef.current) setLoading(false);
      runningRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aptos, owner, assetType, decimals, pollMs, key, schedule]);

  // Mount/unmount
  React.useEffect(() => {
    mountedRef.current = true;
    void read();
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [read]);

  // Reset when account changes
  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLimitRaw(null);
    setUsageRaw(null);
    setScoreRaw(null);
    setBorrowedDisplay('—');
    setLimitDisplay('—/—');
    setScoreDisplay('—/250');
    timerRef.current = setTimeout(() => void read(), 0);
  }, [owner, read]);

  return {
    // addresses / config
    clmAddress: LENDOOR_CONTRACT,
    assetType,

    // raw values
    limitRaw,
    borrowedRaw: usageRaw,
    scoreRaw,

    // display strings
    limitDisplay,     // "<borrowed>/<limit> USDC" or "—/—"
    borrowedDisplay,  // "<borrowed>" or "—"
    scoreDisplay,     // "<score>/250" or "—/250"

    // status
    loading,
    error,

    // manual refresh
    refresh: read,
  };
}
