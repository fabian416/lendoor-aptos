'use client';
import * as React from 'react';
import { useWallet } from '@aptos-labs/wallet-adapter-react';

/**
 * Narrow adapter shape used only for optional event subscription.
 * Different adapters expose different surfaces; keep everything optional.
 */
type AdapterLike = {
  onAccountChange?: (cb: (acc: any) => void) => (() => void) | void;
  onNetworkChange?: (cb: (n: any) => void) => (() => void) | void;
  onDisconnect?: (cb: () => void) => (() => void) | void;
  account?: () => Promise<{ address?: string | { toString(): string } } | null>;
};

export function WalletEventsBridge() {
  const { wallet, connected, account, connect, disconnect } = useWallet();

  // Subscribe to adapter events when available.
  React.useEffect(() => {
    // TS: some versions do not declare `.adapter` on `wallet` type; fall back to `any`.
    const adapter: AdapterLike | undefined =
      (wallet as unknown as { adapter?: AdapterLike })?.adapter ??
      (wallet as unknown as AdapterLike | undefined);

    if (!adapter) return;

    const offAccount =
      adapter.onAccountChange?.(async () => {
        try {
          // Reconnect pulls the fresh account into provider state.
          await connect(wallet!.name);
        } catch (e) {
          console.error('onAccountChange handler failed:', e);
        }
      }) ?? undefined;

    const offNetwork =
      adapter.onNetworkChange?.(async () => {
        try {
          await connect(wallet!.name);
        } catch (e) {
          console.error('onNetworkChange handler failed:', e);
        }
      }) ?? undefined;

    const offDisconnect =
      adapter.onDisconnect?.(async () => {
        try {
          await disconnect();
        } catch (e) {
          console.error('onDisconnect handler failed:', e);
        }
      }) ?? undefined;

    return () => {
      try { offAccount && offAccount(); } catch {}
      try { offNetwork && offNetwork(); } catch {}
      try { offDisconnect && offDisconnect(); } catch {}
    };
  }, [wallet, wallet?.name, connect, disconnect]);

  // Fallback polling for adapters that do not emit events reliably.
  React.useEffect(() => {
    let timer: any;
    const adapter: AdapterLike | undefined =
      (wallet as unknown as { adapter?: AdapterLike })?.adapter ??
      (wallet as unknown as AdapterLike | undefined);

    if (!adapter || !connected || typeof adapter.account !== 'function') return;

    timer = setInterval(async () => {
      try {
        const info = await adapter.account!();
        const next =
          (typeof info?.address === 'string'
            ? info.address
            : info?.address?.toString?.()) ?? '';
        const cur = account?.address ?? '';
        if (next && next !== cur) {
          await connect(wallet!.name);
        }
      } catch {
        // Keep silent; extension may be locked.
      }
    }, 1500);

    return () => clearInterval(timer);
  }, [wallet, connected, account?.address, connect]);

  return null;
}
