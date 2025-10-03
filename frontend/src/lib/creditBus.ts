// Tiny event bus to refresh credit data (limit/usage/score) across the app.
// Fire-and-forget: components can emit `triggerCreditRefresh(...)` and all
// listeners (hooks, widgets, etc.) will re-read on-chain views immediately.

const bus = new EventTarget();

export type CreditRefreshDetail = {
  reason?: string;   // e.g. "zkme-finished", "manual", etc.
  owner?: string;    // aptos address (optional)
  assetType?: string;
  ts?: number;       // timestamp
};

const EVENT = 'lendoor:credit-refresh';

export function triggerCreditRefresh(
  reason?: string,
  detail?: Omit<CreditRefreshDetail, 'reason' | 'ts'>
) {
  const ev = new CustomEvent<CreditRefreshDetail>(EVENT, {
    detail: { reason, ts: Date.now(), ...(detail ?? {}) },
  });
  bus.dispatchEvent(ev);
}

export function onCreditRefresh(handler: (d: CreditRefreshDetail) => void) {
  const h = (e: Event) => handler((e as CustomEvent<CreditRefreshDetail>).detail);
  bus.addEventListener(EVENT, h);
  return () => bus.removeEventListener(EVENT, h);
}
