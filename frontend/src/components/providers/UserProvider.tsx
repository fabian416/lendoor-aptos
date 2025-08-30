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
import { usePathname } from "next/navigation";

// Orden importa: el primero es el default
export const USER_JOURNEYS = [
  "verify_identity",
  "use_teleporter",
  "use_timetravel",
  "borrow",
  "repay",
  "supply_liquidity",
  "withdraw_susdc",
  "withdraw_jusdc",
] as const;

export type UserJourney = (typeof USER_JOURNEYS)[number];
const DEFAULT_JOURNEY: UserJourney = USER_JOURNEYS[0];
const STORAGE_KEY = "userJourney";

// Grupos para flags derivados
const ONLY_BORROW_SET = new Set<UserJourney>([
  "verify_identity",
  "use_teleporter",
  "use_timetravel",
  "borrow",
]);

const BORROW_SET = new Set<UserJourney>([
  ...ONLY_BORROW_SET,
  "repay",
]);

const LEND_SET = new Set<UserJourney>([
  "supply_liquidity",
  "withdraw_susdc",
  "withdraw_jusdc",
]);

type Ctx = {
  value: UserJourney;
  set: (next: UserJourney) => void;
  clear: () => void; // resetea al default
  ready: boolean;
  is_borrow: boolean;        // incluye repay
  is_only_borrow: boolean;   // SOLO verify_identity, teleporter, timetravel, borrow
  is_lend: boolean;
  pathname: string;
};

const UserJourneyContext = createContext<Ctx | null>(null);

function isUserJourney(v: unknown): v is UserJourney {
  return typeof v === "string" && (USER_JOURNEYS as readonly string[]).includes(v);
}

function inSection(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(base + "/");
}

export function UserJourneyProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<UserJourney>(DEFAULT_JOURNEY);
  const [ready, setReady] = useState(false);
  const pathname = usePathname() || "";

  // Hidrata desde localStorage; si no hay o es inválido, persiste el default
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const next = isUserJourney(raw) ? raw : DEFAULT_JOURNEY;
      setValue(next);
      if (!isUserJourney(raw)) {
        window.localStorage.setItem(STORAGE_KEY, DEFAULT_JOURNEY);
      }
    } catch {
      // quedamos en default
    } finally {
      setReady(true);
    }
  }, []);

  // Sync entre pestañas
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      const raw = e.newValue;
      setValue(isUserJourney(raw) ? raw : DEFAULT_JOURNEY);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const set = useCallback((next: UserJourney) => {
    setValue(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  }, []);

  const clear = useCallback(() => {
    setValue(DEFAULT_JOURNEY);
    try {
      window.localStorage.setItem(STORAGE_KEY, DEFAULT_JOURNEY);
    } catch {
      /* noop */
    }
  }, []);

  const onBorrowPage = useMemo(() => inSection(pathname, "/borrow"), [pathname]);
  const onLendPage = useMemo(() => inSection(pathname, "/lend"), [pathname]);

  const is_borrow = useMemo(
    () => BORROW_SET.has(value) && !onBorrowPage,
    [value, onBorrowPage],
  );

  const is_only_borrow = useMemo(
    () => ONLY_BORROW_SET.has(value),
    [value, onBorrowPage],
  );

  const is_lend = useMemo(
    () => LEND_SET.has(value) && !onLendPage,
    [value, onLendPage],
  );

  const ctx = useMemo<Ctx>(
    () => ({ value, set, clear, ready, is_borrow, is_only_borrow, is_lend, pathname }),
    [value, set, clear, ready, is_borrow, is_only_borrow, is_lend, pathname],
  );

  return <UserJourneyContext.Provider value={ctx}>{children}</UserJourneyContext.Provider>;
}

export function useUserJourney() {
  const ctx = useContext(UserJourneyContext);
  if (!ctx) throw new Error("useUserJourney debe usarse dentro de <UserJourneyProvider>");
  return ctx;
}

// Helpers puros por fuera del hook
export const isOnlyBorrowJourney = (j: UserJourney) => ONLY_BORROW_SET.has(j);
export const isBorrowJourney = (j: UserJourney) => BORROW_SET.has(j);
export const isLendJourney = (j: UserJourney) => LEND_SET.has(j);
