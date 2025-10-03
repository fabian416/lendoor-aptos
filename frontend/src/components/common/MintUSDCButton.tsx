'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { BACKEND_URL, NETWORK } from '@/lib/constants';

type Props = {
  endpoint?: string;        // defaults to `${BACKEND_URL}/fa/mint`
  className?: string;
};

// Fixed mint amount (human units)
const AMOUNT = '100';

export default function MintUSDCButton({ endpoint, className = '' }: Props) {
  const { account } = useWallet();
  const [loading, setLoading] = React.useState(false);

  const explorerTx = (hash?: string) =>
    hash ? `https://explorer.aptoslabs.com/txn/${hash}?network=${NETWORK}` : '';

  // Compact error mapping
  const humanize = (raw: any) => {
    const m =
      raw?.shortMessage ||
      raw?.reason ||
      raw?.message ||
      raw?.vm_status ||
      (typeof raw === 'string' ? raw : '') ||
      '';
    const s = String(m);
    const lo = s.toLowerCase();
    if (s.includes('E_NOT_INITIALIZED')) return 'Contract not initialized.';
    if (s.includes('E_AMOUNT_ZERO')) return 'Amount must be greater than zero.';
    if (s.includes('E_ONLY_CREATOR')) return 'Only the creator can mint this FA.';
    if (s.includes('E_MINT_DISABLED')) return 'Minting is disabled for this asset.';
    if (lo.includes('insufficient') || lo.includes('not enough')) return 'Insufficient balance.';
    return s || 'Transaction failed';
  };

  const parseBackendError = async (res: Response) => {
    try {
      const data = await res.json();
      return data?.error || data?.message || data?.vm_status || res.statusText || `HTTP ${res.status}`;
    } catch {
      return res.statusText || `HTTP ${res.status}`;
    }
  };

  const onClick = async () => {
    if (!account?.address) {
      toast.error('Connect a wallet first');
      return;
    }

    setLoading(true);
    const id = toast.loading(`Minting ${AMOUNT} USDC…`);

    const url = (endpoint ?? `${BACKEND_URL}/user/${account.address}/mint`).replace(/\/+$/, '');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: "100" }),
        signal: ctrl.signal,
      });

      if (!res.ok) throw new Error(await parseBackendError(res));

      const data: any = await res.json().catch(() => ({}));
      const hash: string | undefined = data?.hash;

      toast.success('Mint successful', {
        id,
        description: `Minted ${AMOUNT} USDC`,
        action: hash
          ? { label: 'View', onClick: () => window.open(explorerTx(hash), '_blank') }
          : undefined,
      });
    } catch (e: any) {
      const desc = e?.name === 'AbortError' ? 'Request timed out. Try again.' : humanize(e?.message || e);
      toast.error('Mint failed', { id, description: desc });
    } finally {
      clearTimeout(t);
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!account?.address || loading}
      className={[
        'h-8 px-2 rounded-md border border-primary/30 text-xs mono-text cursor-pointer',
        'bg-background hover:bg-primary/10 disabled:opacity-50 transition-colors',
        className,
      ].join(' ')}
      title={account?.address ? 'Mint 100 USDC' : 'Connect a wallet'}
    >
      {loading ? 'Minting…' : 'Mint 100 USDC'}
    </button>
  );
}
