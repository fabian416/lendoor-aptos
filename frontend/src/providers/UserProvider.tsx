
"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { BACKEND_URL } from "@/lib/constants";
import { useLocation } from "react-router-dom";


/* ===== Allowed steps ===== */
export const USER_JOURNEYS = [
  "supply_liquidity",
  "withdraw_susdc",
  "withdraw_jusdc",
  "verify_identity",
  "borrow",
  "repay",
] as const;
export type UserJourney = (typeof USER_JOURNEYS)[number];
const DEFAULT_JOURNEY: UserJourney = USER_JOURNEYS[0];

/* ===== Derived groups ===== */
const ONLY_BORROW_SET = new Set<UserJourney>([
  "verify_identity",
  "borrow",
]);
const BORROW_SET = new Set<UserJourney>([...ONLY_BORROW_SET, "repay"]);
const LEND_SET = new Set<UserJourney>([
  "supply_liquidity",
  "withdraw_susdc",
  "withdraw_jusdc",
]);

/* ===== Utils ===== */
function isUserJourney(v: unknown): v is UserJourney {
  return typeof v === "string" && (USER_JOURNEYS as readonly string[]).includes(v);
}
export function normalizePath(p?: string | null): string {
  if (!p) return "/";
  const cleaned = p.split("?")[0].split("#")[0].replace(/\/+$/, "");
  return cleaned === "" ? "/" : cleaned;
}
export function inSection(pathname: string | null | undefined, base: string) {
  const p = normalizePath(pathname);
  const b = normalizePath(base);
  return p === b || p.startsWith(b + "/");
}
const toAddressString = (addr: unknown) =>
  typeof addr === "string"
    ? addr
    : (addr as any)?.toString?.() ?? (addr ? String(addr) : "");

/* ===== Context ===== */
type Ctx = {
  value: UserJourney;
  set: (next: UserJourney) => Promise<void>;
  setIsVerified: React.Dispatch<React.SetStateAction<boolean>>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
  ready: boolean;
  loading: boolean;
  error: string | null;
  isVerified: boolean;
  is_borrow: boolean;
  is_only_borrow: boolean;
  is_lend: boolean;
  pathname: string;
};

const UserJourneyContext = createContext<Ctx | null>(null);

/* ===== Provider ===== */
export function UserJourneyProvider({
  children,
  walletAddress, // opcional: forzar address desde props si querés
}: {
  children: ReactNode;
  walletAddress?: string | null;
}) {
  const [value, setValue] = useState<UserJourney>(DEFAULT_JOURNEY);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const location = useLocation();
  const pathname = normalizePath(location?.pathname || "/");

  /* Aptos Wallet Adapter */
  const { connected, account } = useWallet();
  const addressFromWallet = useMemo(() => toAddressString(account?.address), [account?.address]);
  const address = useMemo(
    () => (walletAddress?.trim() ? walletAddress.trim() : addressFromWallet),
    [walletAddress, addressFromWallet]
  );

  const isLoggedIn = connected && !!address; // reemplazo de Dynamic: “logueado” = wallet conectada

  /* Fetch step and verification status */
  const fetchStep = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isLoggedIn) {
        setValue(DEFAULT_JOURNEY);
        setIsVerified(false);
        return;
      }
      const res = await fetch(`${BACKEND_URL}/user-journey/${address}`);
      if (!res.ok) throw new Error(`GET /user-journey/${address} → ${res.status}`);
      const data: { walletAddress: string; step: unknown; isVerified?: boolean } = await res.json();
      setValue(isUserJourney(data.step) ? data.step : DEFAULT_JOURNEY);
      setIsVerified(Boolean(data.isVerified));
    } catch (e: any) {
      setError(e?.message ?? "Error fetching user journey");
      setValue(DEFAULT_JOURNEY);
      setIsVerified(false);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [isLoggedIn, address]);

  useEffect(() => {
    setReady(false);
    fetchStep();
  }, [fetchStep]);

  /* Update step */
  const set = useCallback(
    async (next: UserJourney) => {
      if (!isUserJourney(next)) return;

      if (!isLoggedIn) {
        setValue(DEFAULT_JOURNEY);
        setIsVerified(false);
        setReady(true);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${BACKEND_URL}/user-journey`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: address, step: next }),
        });
        if (!res.ok) throw new Error(`PATCH /user-journey → ${res.status}`);
        const data: { step: unknown; isVerified?: boolean } = await res.json();
        setValue(isUserJourney(data.step) ? data.step : DEFAULT_JOURNEY);
        if (typeof data.isVerified === "boolean") setIsVerified(data.isVerified);
      } catch (e: any) {
        setError(e?.message ?? "Error updating user journey");
      } finally {
        setLoading(false);
        setReady(true);
      }
    },
    [isLoggedIn, address]
  );

  const clear = useCallback(async () => {
    await set(DEFAULT_JOURNEY);
  }, [set]);

  const refresh = useCallback(async () => {
    await fetchStep();
  }, [fetchStep]);

  /* Derived flags */
  const onBorrowPage = useMemo(() => inSection(pathname, "/borrow"), [pathname]);
  const onLendPage = useMemo(() => inSection(pathname, "/lend"), [pathname]);

  const is_borrow = useMemo(() => BORROW_SET.has(value) && !onBorrowPage, [value, onBorrowPage]);
  const is_only_borrow = useMemo(() => ONLY_BORROW_SET.has(value), [value]);
  const is_lend = useMemo(() => LEND_SET.has(value) && !onLendPage, [value, onLendPage]);

  const ctx = useMemo<Ctx>(
    () => ({
      value,
      set,
      clear,
      refresh,
      ready,
      loading,
      error,
      isVerified,
      setIsVerified,
      is_borrow,
      is_only_borrow,
      is_lend,
      pathname,
    }),
    [
      value,
      set,
      clear,
      refresh,
      ready,
      loading,
      error,
      isVerified,
      is_borrow,
      is_only_borrow,
      is_lend,
      pathname,
    ]
  );

  return <UserJourneyContext.Provider value={ctx}>{children}</UserJourneyContext.Provider>;
}

/* Hook */
export function useUserJourney() {
  const ctx = useContext(UserJourneyContext);
  if (!ctx) throw new Error("useUserJourney must be used within <UserJourneyProvider>");
  return ctx;
}

/* Pure helpers */
export const isOnlyBorrowJourney = (j: UserJourney) => ONLY_BORROW_SET.has(j);
export const isBorrowJourney = (j: UserJourney) => BORROW_SET.has(j);
export const isLendJourney = (j: UserJourney) => LEND_SET.has(j);