'use client'

import { useEffect, useState } from 'react';
import { WalletSelector } from "@/components/common/WalletSelector";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useUserJourney } from '@/providers/UserProvider';
import UserJourneyBadge from '@/components/common/UserJourneyBadge';

function labelClasses(isActive: boolean) {
  const base =
    "relative inline-block tracking-wide transition-colors duration-150 " +
    "after:absolute after:left-1/2 after:bottom-[-2px] after:h-[2px] after:w-0 " +
    "after:-translate-x-1/2 after:rounded-full after:bg-primary " +
    "after:transition-all after:duration-200";
  return isActive
    ? [base, "text-foreground after:w-10"].join(" ")
    : [base, "text-muted-foreground group-hover:text-primary group-hover:after:w-6"].join(" ");
}

export function Header() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { pathname, key: routeKey } = useLocation();
  const { ready, is_borrow, is_lend } = useUserJourney();

  const showBorrowBadge = ready && is_borrow && pathname !== '/borrow';
  const showLendBadge   = ready && is_lend   && pathname !== '/lend';

  return (
    <header className="border-b border-primary/20 bg-background/95 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/" className="group focus:outline-none flex items-center gap-3">
          <img src="/favicon.png" alt="favicon" width={15} height={15} className="h-7 w-7 shrink-0 object-contain" />
          <div className="text-2xl font-bold text-primary mono-text terminal-cursor">LENDOOR</div>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <NavLink to="/borrow">
            {({ isActive }) => (
              <div className="group px-3 py-1.5 text-sm mono-text flex items-center gap-2">
                {showBorrowBadge && !isActive && (
                  <UserJourneyBadge key={`borrow-badge:${routeKey}:${Number(ready)}:${Number(is_borrow)}`} />
                )}
                <span className={labelClasses(isActive)}>BORROW</span>
              </div>
            )}
          </NavLink>

          <NavLink to="/lend">
            {({ isActive }) => (
              <div className="group px-3 py-1.5 text-sm mono-text flex items-center gap-2">
                {showLendBadge && !isActive && (
                  <UserJourneyBadge key={`lend-badge:${routeKey}:${Number(ready)}:${Number(is_lend)}`} />
                )}
                <span className={labelClasses(isActive)}>LEND</span>
              </div>
            )}
          </NavLink>
        </nav>

        <div className="min-w-[200px] w-[200px] shrink-0 flex justify-end">
          {mounted ? (
            <WalletSelector />
          ) : (
            <div className="h-10 w-full rounded-md border border-primary/20 bg-muted/40 animate-pulse" />
          )}
        </div>
      </div>
    </header>
  );
}
