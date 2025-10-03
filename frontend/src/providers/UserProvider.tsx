'use client';

import * as React from 'react';

import { useCreditLine } from '@/hooks/borrow/useCreditLine';
import { useSeniorExchangeRate } from '@/hooks/senior/useSeniorExchangeRate';
import { useJuniorExchangeRate } from '@/hooks/junior/useJuniorExchangeRate';
import { useSusdcBalance } from '@/hooks/senior/useSusdcBalance';
import { useJusdcBalance } from '@/hooks/junior/useJusdcBalance';
import { useSeniorAvailableToWithdraw } from '@/hooks/senior/useSeniorAvailableToWithdraw';
import { BACKEND_URL } from '@/lib/constants';
import { useWallet } from '@aptos-labs/wallet-adapter-react';

/* =======================================================================================
 * Stable in-memory cache for "isVerified"
 *  - Survives unmount/remount of this provider (module-level singleton)
 *  - Avoids redundant network fetches and flicker after route changes
 * ======================================================================================= */
type VerifiedCache = { value: boolean; expiresAt: number };
const verifiedCache = new Map<string, VerifiedCache>();

const normalizeWallet = (addr: unknown) => {
  if (!addr) return '';
  try {
    const s = typeof addr === 'string' ? addr : (addr as any)?.toString?.() ?? String(addr);
    return s.trim().toLowerCase();
  } catch {
    return '';
  }
};

function getVerifiedCached(wallet: string): boolean | null {
  const hit = verifiedCache.get(wallet);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) return null;
  return hit.value;
}

function setVerifiedCached(wallet: string, value: boolean, ttlMs: number) {
  verifiedCache.set(wallet, { value, expiresAt: Date.now() + ttlMs });
}

type UserContextValue = {
  creditScoreDisplay: string;
  creditLimitDisplay: string;
  borrowedDisplay: string;

  seniorExchangeRateDisplay: string;
  juniorExchangeRateDisplay: string;

  susdcDisplay: string;
  jusdcDisplay: string;

  seniorWithdrawAvailableDisplay: string;
  juniorWithdrawAvailableDisplay: string;

  maxBorrowDisplay: string;
  borrowSubmit: (amountInput: string) => Promise<boolean>;
  borrowSubmitting: boolean;

  isVerified: boolean;
  setIsVerified: (on: boolean) => void;
};

const UserContext = React.createContext<UserContextValue | null>(null);

type UserProviderProps = { children: React.ReactNode };

export function UserProvider({ children }: UserProviderProps) {
  // On-chain: credit line
  const {
    scoreDisplay: creditScoreDisplay,
    limitDisplay: creditLimitDisplay,
    borrowedDisplay,
  } = useCreditLine();

  // Balances
  const { display: susdcDisplay } = useSusdcBalance();
  const { display: jusdcDisplay } = useJusdcBalance();

  // Exchange rates
  const { display: seniorExchangeRateDisplay } = useSeniorExchangeRate();
  const { display: juniorExchangeRateDisplay } = useJuniorExchangeRate();

  // Withdrawable
  const { display: seniorWithdrawAvailableDisplay } = useSeniorAvailableToWithdraw();
  const juniorWithdrawAvailableDisplay = '—';

  // APY (mock for now)
  const seniorApyDisplay = '10%';
  const juniorApyDisplay = '20%';

  // Borrow (mock)
  const maxBorrowDisplay = '7,550 USDC';
  const borrowSubmitting = false;
  const borrowSubmit = async (amountInput: string): Promise<boolean> => {
    console.log('[MOCK] borrowSubmit ->', amountInput);
    await new Promise((r) => setTimeout(r, 400));
    return true;
  };

  // Wallet
  const { account, connected } = useWallet();
  const wallet = React.useMemo(() => normalizeWallet(account?.address), [account?.address]);

  // Backend verification flag with cache
  const [isVerified, setIsVerifiedState] = React.useState<boolean>(() => {
    if (!wallet) return false;
    const cached = getVerifiedCached(wallet);
    return cached ?? false;
  });

  const setIsVerified = React.useCallback(
    (on: boolean) => {
      setIsVerifiedState(on);
      if (wallet) setVerifiedCached(wallet, on, on ? 5 * 60_000 : 60_000);
    },
    [wallet]
  );

  const fetchCtrlRef = React.useRef<AbortController | null>(null);
  const lastFetchIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!connected || !wallet) {
      fetchCtrlRef.current?.abort();
      fetchCtrlRef.current = null;
      setIsVerifiedState(false);
      return;
    }

    // Immediate cache hydrate
    const cached = getVerifiedCached(wallet);
    if (cached !== null) {
      setIsVerifiedState(cached);
      // Optional: you could still refresh in background here if you want.
      return;
    }

    // Cache miss → fetch
    const ctrl = new AbortController();
    fetchCtrlRef.current?.abort();
    fetchCtrlRef.current = ctrl;
    const fetchId = ++lastFetchIdRef.current;

    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/user/${wallet}`, { signal: ctrl.signal });
        if (!res.ok) {
          // Don't overwrite UI; set short negative cache to avoid hammering
          setVerifiedCached(wallet, false, 30_000);
          return;
        }
        const data: { isVerified?: boolean } = await res.json();
        const val = Boolean(data?.isVerified);
        if (fetchId !== lastFetchIdRef.current) return;
        setIsVerifiedState(val);
        setVerifiedCached(wallet, val, val ? 5 * 60_000 : 60_000);
      } catch (e: any) {
        // Network/abort — keep last good value, short negative cache
        setVerifiedCached(wallet, false, 20_000);
      }
    })();

    return () => ctrl.abort();
  }, [connected, wallet]);

  const value = React.useMemo<UserContextValue>(
    () => ({
      creditScoreDisplay,
      creditLimitDisplay,
      borrowedDisplay,

      seniorExchangeRateDisplay,
      juniorExchangeRateDisplay,

      susdcDisplay,
      jusdcDisplay,

      seniorWithdrawAvailableDisplay,
      juniorWithdrawAvailableDisplay,

      maxBorrowDisplay,
      borrowSubmit,
      borrowSubmitting,

      isVerified,
      setIsVerified,
    }),
    [
      creditScoreDisplay,
      creditLimitDisplay,
      borrowedDisplay,
      seniorExchangeRateDisplay,
      juniorExchangeRateDisplay,
      susdcDisplay,
      jusdcDisplay,
      seniorWithdrawAvailableDisplay,
      juniorWithdrawAvailableDisplay,
      maxBorrowDisplay,
      borrowSubmit,
      borrowSubmitting,
      isVerified,
      setIsVerified,
    ]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = React.useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within <UserProvider>.');
  return ctx;
}
