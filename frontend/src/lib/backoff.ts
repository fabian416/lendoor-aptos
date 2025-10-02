
type State = { until: number; fails: number };
const map = new Map<string, State>();

export function shouldSkip(key: string): boolean {
  const s = map.get(key);
  return !!s && Date.now() < s.until;
}

export function onSuccess(key: string, baseMs = 10_000): number {
  map.set(key, { until: Date.now() + baseMs, fails: 0 });
  return baseMs;
}

export function onError(key: string, _err?: unknown, baseMs = 10_000): number {
  const prev = map.get(key) ?? { until: 0, fails: 0 };
  const fails = Math.min(prev.fails + 1, 6);              // cap
  const next = Math.min(baseMs * 2 ** fails, 60_000);     // expo backoff ≤ 60s
  const jitter = Math.floor(Math.random() * Math.min(2000, next / 4));
  const ms = next + jitter;
  map.set(key, { until: Date.now() + ms, fails });
  return ms;
}