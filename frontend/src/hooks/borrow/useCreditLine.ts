'use client';

import * as React from 'react';
import { useAptos } from '@/providers/WalletProvider';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { LENDOOR_CONTRACT, WUSDC_TYPE, WUSDC_DECIMALS, DEFAULT_NODE } from '@/lib/constants';
import { onCreditRefresh } from '@/lib/creditBus';

/* ========================================================================================
 * useCreditLine — stable, no-flicker credit usage/limit + score
 *  - In-memory cache + last-good snapshot (persists across unmounts)
 *  - Never downgrades display to '—' unless wallet really disconnects
 *  - Dedupe concurrent reads, cancel on unmount, backoff on errors
 * ====================================================================================== */

type Options = {
  pollMs?: number;
  assetType?: string;  // Must be the Coin type (e.g., "<pkg>::wusdc::WUSDC")
  decimals?: number;   // For formatting only
  cacheTtlMs?: number; // Cache TTL (ms)
};

/* ----------------------------- small helpers ----------------------------- */

function formatUnits0(amount: bigint, decimals = 6): string {
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
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
function toU8Loose(v: unknown): number | null {
  try {
    const b = toBigIntLoose(v);
    if (b == null) return null;
    const n = Number(b);
    if (!Number.isFinite(n) || n < 0 || n > 255) return null;
    return Math.trunc(n);
  } catch {
    return null;
  }
}

/* ------------------------------ /v1/view client ------------------------------ */

type ViewOk = { ok: true; data: unknown[] };
type ViewErr = { ok: false; status: number; text: string };
type ViewResp = ViewOk | ViewErr;
const isViewErr = (r: ViewResp): r is ViewErr => r.ok === false;


function resolveNodeUrl(aptos: any): string {
  let u =
    aptos?.config?.fullnode?.[0] ??
    aptos?.config?.fullnodeUrl ??
    aptos?.client?.nodeUrl ??
    aptos?.nodeUrl ??
    process.env.NEXT_PUBLIC_APTOS_NODE ??
    DEFAULT_NODE;
  u = String(u || '').trim();
  if (!/^https?:\/\//i.test(u)) u = DEFAULT_NODE;
  return u.replace(/\/+$/, '');
}
function viewUrl(base: string): string {
  const clean = base.replace(/\/+$/, '');
  return /\/v1$/i.test(clean) ? `${clean}/view` : `${clean}/v1/view`;
}

async function silentViewRaw(
  aptos: any,
  payload: { function: string; typeArguments?: string[]; functionArguments?: any[] },
  signal?: AbortSignal
): Promise<ViewResp> {
  const url = viewUrl(resolveNodeUrl(aptos));
  const body = JSON.stringify({
    function: payload.function,
    type_arguments: payload.typeArguments ?? [],
    arguments: payload.functionArguments ?? [],
  });
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal });
    const text = await res.text().catch(() => '');
    if (!res.ok) return { ok: false, status: res.status, text };
    let data: unknown[] = [];
    try { data = text ? JSON.parse(text) : []; } catch { /* ignore */ }
    return { ok: true, data };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, status: 0, text: 'aborted' };
    return { ok: false, status: 0, text: 'network error' };
  }
}
async function viewBigintNullable(
  aptos: any,
  fn: string,
  typeArguments: string[],
  functionArguments: any[],
  signal?: AbortSignal
): Promise<bigint | null> {
  const r = await silentViewRaw(aptos, { function: fn, typeArguments, functionArguments }, signal);
  if (isViewErr(r)) return null;
  const bi = toBigIntLoose(r.data?.[0]);
  return bi == null ? 0n : bi;
}
async function viewU8Nullable(
  aptos: any,
  fn: string,
  functionArguments: any[],
  signal?: AbortSignal
): Promise<number | null> {
  const r = await silentViewRaw(aptos, { function: fn, typeArguments: [], functionArguments }, signal);
  if (isViewErr(r)) return null;
  const u8 = toU8Loose(r.data?.[0]);
  return u8 == null ? 0 : u8;
}

/* ------------------- cache + last good + inflight dedupe ------------------- */

type CacheVal = {
  limit: bigint | null;
  usage: bigint | null;
  score: number | null;
  expiresAt: number;
};
type LastGood = {
  limitRaw: bigint | null;
  usageRaw: bigint | null;
  scoreRaw: number | null;
  limitDisplay: string;
  borrowedDisplay: string;
  scoreDisplay: string;
  at: number;
};

const memCache = new Map<string, CacheVal>();  // key === `${owner}-${assetType}`
const lastGood = new Map<string, LastGood>();
const inflight = new Map<string, { p: Promise<CacheVal>; abort: AbortController }>();

const keyOf = (owner: string, assetType: string) => `${owner.toLowerCase()}-${assetType}`;

/* ------------------------------------ Hook ------------------------------------ */

export function useCreditLine(opts: Options = {}) {
  const {
    pollMs = 15_000,
    assetType = WUSDC_TYPE,
    decimals = WUSDC_DECIMALS,
    cacheTtlMs = 30_000,
  } = opts;

  const { aptos } = useAptos();
  const { account, connected } = useWallet();

  // Stabilize owner: keep the last non-empty address while connected
  const lastOwnerRef = React.useRef<string | null>(null);
  if (account?.address) lastOwnerRef.current = String(account.address);

  const owner: string | null = connected
    ? (account?.address ? String(account.address) : lastOwnerRef.current)
    : null;

  const key = React.useMemo(() => (owner ? keyOf(owner, assetType) : 'no-owner'), [owner, assetType]);

  // Raw values
  const [limitRaw, setLimitRaw] = React.useState<bigint | null>(null);
  const [usageRaw, setUsageRaw] = React.useState<bigint | null>(null);
  const [scoreRaw, setScoreRaw] = React.useState<number | null>(null);

  // Display strings
  const [limitDisplay, setLimitDisplay] = React.useState<string>('—/—');
  const [borrowedDisplay, setBorrowedDisplay] = React.useState<string>('—');
  const [scoreDisplay, setScoreDisplay] = React.useState<string>('—/250');

  // Status
  const [loading, setLoading] = React.useState(false);
  const [error] = React.useState<string | null>(null);

  // Backoff memory per key
  const backoffRef = React.useRef<{ failCount: number; nextAt: number }>({ failCount: 0, nextAt: 0 });
  const mountedRef = React.useRef(true);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Hydrate UI from last-good snapshot immediately (no network). */
  const hydrateFromLastGood = React.useCallback(() => {
    if (!owner) return;
    const lg = lastGood.get(key);
    if (!lg) return;
    setLimitRaw(lg.limitRaw);
    setUsageRaw(lg.usageRaw);
    setScoreRaw(lg.scoreRaw);
    setBorrowedDisplay(lg.borrowedDisplay);
    setLimitDisplay(lg.limitDisplay);
    setScoreDisplay(lg.scoreDisplay);
  }, [key, owner]);

  /** Apply data to state + caches; never downgrade display to '—'. */
  const apply = React.useCallback(
    (data: CacheVal) => {
      // Update raws (raw can be null; UI won't degrade)
      setLimitRaw(data.limit);
      setUsageRaw(data.usage);
      setScoreRaw(data.score);

      // Compute displays only when we have fresh values
      if (data.limit != null && data.usage != null) {
        const dBorrowed = formatUnits0(data.usage, decimals);
        const dLimit = formatUnits0(data.limit, decimals);
        setBorrowedDisplay(dBorrowed);
        setLimitDisplay(`${dBorrowed}/${dLimit} USDC`);
      }
      if (data.score != null) {
        setScoreDisplay(`${data.score}/250`);
      }

      // Update caches with latest visible values
      if (owner) {
        const snapshot: LastGood = {
          limitRaw: data.limit ?? limitRaw,
          usageRaw: data.usage ?? usageRaw,
          scoreRaw: data.score ?? scoreRaw,
          borrowedDisplay,
          limitDisplay,
          scoreDisplay,
          at: Date.now(),
        };
        lastGood.set(key, snapshot);
        memCache.set(key, { ...data, expiresAt: Date.now() + cacheTtlMs });
      }
    },
    [decimals, owner, key, cacheTtlMs, limitRaw, usageRaw, scoreRaw, borrowedDisplay, limitDisplay, scoreDisplay]
  );

  /** Schedule next read. */
  const schedule = React.useCallback((ms: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void read(true), ms);
  }, []);

  /** Core reader with dedupe + abort + backoff. */
  const read = React.useCallback(
    async (respectBackoff = false) => {
      // Fully reset only if wallet is genuinely disconnected
      if (!owner) {
        setLimitRaw(null);
        setUsageRaw(null);
        setScoreRaw(null);
        setBorrowedDisplay('—');
        setLimitDisplay('—/—');
        setScoreDisplay('—/250');
        return;
      }

      // If we have last-good for this key, hydrate immediately (no flicker)
      hydrateFromLastGood();

      // Backoff gate
      if (respectBackoff && Date.now() < backoffRef.current.nextAt) return;

      // Serve fresh cache
      const cached = memCache.get(key);
      if (cached && Date.now() < cached.expiresAt) {
        apply(cached);
        schedule(pollMs);
        return;
      }

      // Dedupe in-flight
      if (inflight.has(key)) {
        try {
          const { p } = inflight.get(key)!;
          const data = await p;
          if (!mountedRef.current) return;
          apply(data);
          schedule(pollMs);
          return;
        } catch {
          // fallthrough to new attempt
        }
      }

      // New network read (abortable)
      const ctrl = new AbortController();
      const p: Promise<CacheVal> = (async () => {
        const [limit, usage, score] = await Promise.all([
          viewBigintNullable(
            aptos,
            `${LENDOOR_CONTRACT}::credit_manager::get_limit`,
            [assetType],
            [owner],
            ctrl.signal
          ),
          viewBigintNullable(
            aptos,
            `${LENDOOR_CONTRACT}::credit_manager::get_usage`,
            [assetType],
            [owner],
            ctrl.signal
          ),
          viewU8Nullable(
            aptos,
            `${LENDOOR_CONTRACT}::credit_manager::get_score`,
            [owner],
            ctrl.signal
          ),
        ]);
        return { limit, usage, score, expiresAt: Date.now() + cacheTtlMs };
      })();

      inflight.set(key, { p, abort: ctrl });
      setLoading(true);

      try {
        const data = await p;
        if (!mountedRef.current) return;
        backoffRef.current = { failCount: 0, nextAt: Date.now() + pollMs };
        apply(data);
        schedule(pollMs);
      } catch {
        if (!mountedRef.current) return;
        // Error — don't degrade UI; exponential backoff
        const prev = backoffRef.current;
        const fail = Math.min(prev.failCount + 1, 6);
        const delay = Math.round(1000 * Math.pow(1.75, fail));
        backoffRef.current = { failCount: fail, nextAt: Date.now() + delay };
        schedule(delay);
      } finally {
        setLoading(false);
        inflight.delete(key);
      }
    },
    [owner, key, aptos, assetType, pollMs, cacheTtlMs, hydrateFromLastGood, apply, schedule]
  );

  // Mount/unmount
  React.useEffect(() => {
    mountedRef.current = true;
    // First paint: hydrate from last-good immediately (if any), then read
    hydrateFromLastGood();
    void read(false);
    return () => {
      mountedRef.current = false;
      const i = inflight.get(key);
      i?.abort?.abort();
      inflight.delete(key);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [read, key, hydrateFromLastGood]);

  // Owner/asset changes: do not clear UI; just re-read
  React.useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    hydrateFromLastGood();
    void read(false);
  }, [owner, assetType, read, hydrateFromLastGood]);

  // Global refresh (e.g., after zkMe/admin_set_line)
  React.useEffect(() => {
    const off = onCreditRefresh((ev) => {
      if (!owner) return;
      if (ev?.owner && String(ev.owner).toLowerCase() !== owner.toLowerCase()) return;
      const c = memCache.get(key);
      if (c) memCache.set(key, { ...c, expiresAt: 0 });
      if (timerRef.current) clearTimeout(timerRef.current);
      void read(false);
    });
    return off;
  }, [owner, key, read]);

  return {
    clmAddress: LENDOOR_CONTRACT,
    assetType,

    // raw values
    limitRaw,
    borrowedRaw: usageRaw,
    scoreRaw,

    // display strings
    limitDisplay,     // "<borrowed>/<limit> USDC" or last-good
    borrowedDisplay,  // "<borrowed>" or last-good
    scoreDisplay,     // "<score>/250" or last-good

    // status
    loading,
    error,

    // manual refresh
    refresh: () => {
      if (!owner) return;
      const c = memCache.get(key);
      if (c) memCache.set(key, { ...c, expiresAt: 0 });
      if (timerRef.current) clearTimeout(timerRef.current);
      void read(false);
    },
  };
}
