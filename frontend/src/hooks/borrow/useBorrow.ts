'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useAptos } from '@/providers/WalletProvider';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import { useCreditLine } from '@/hooks/borrow/useCreditLine';
import { triggerCreditRefresh } from '@/lib/creditBus';

import {
  LENDOOR_CONTRACT,
  WUSDC_TYPE,
  WUSDC_DECIMALS,
  DEFAULT_NODE,
  FA_METADATA_OBJECT as DEFAULT_FA_OBJECT,
} from '@/lib/constants';

import {
  parseUnitsAptos,
  formatUSDCAmount2dp,
  DECIMALS as DEFAULT_DECIMALS,
  toBigIntLoose,
  fq, // fq(module, fn) -> `${LENDOOR_CONTRACT}::module::fn`
} from '@/lib/utils';

/* ========================================================================================
 * useBorrowFA — Borrow FA against Coin-based credit line
 * - Wrapper-ready check -> reserve cash -> pre FA balance -> tx -> post FA balance
 * - Indexer-first for FA balance; fallback to /v1/view
 * - Fires triggerCreditRefresh(owner) + local refresh
 * ====================================================================================== */

type Options = {
  decimals?: number;
  assetType?: string;           // Coin type used by credit manager (e.g., <pkg>::wusdc::WUSDC)
  faMetadataObject?: string;    // FA metadata object id (defaults to DEFAULT_FA_OBJECT)
  defaultProfileName?: string;  // vector<u8> for borrow_fa profile (default: "main")
  requireWrapperReady?: boolean;
};

type BorrowResult = {
  ok: boolean;
  hash?: string;
  faDelta?: bigint; // post - pre
  error?: string;
};

type FQName = `${string}::${string}::${string}`;

/* -------------------------------- helpers -------------------------------- */

/** Keep inputs like "1_000" or "1,000.25" → "1000.25". */
function cleanAmountInput(s: string) {
  return (s || '').replace(/[_,\s]/g, '');
}

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

/** POST /v1/view (never throws; returns {ok:false} on any error; logs 400 text). */
async function viewCall(
  aptos: any,
  payload: { function: FQName; typeArguments?: string[]; functionArguments?: any[] }
): Promise<{ ok: true; data: unknown[] } | { ok: false; status: number; text: string }> {
  const url = viewUrl(resolveNodeUrl(aptos));
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        function: payload.function,
        type_arguments: payload.typeArguments ?? [],
        arguments: payload.functionArguments ?? [],
      }),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      // help debugging 400s
      console.warn('[viewCall] HTTP', res.status, payload.function, '→', text);
      return { ok: false, status: res.status, text };
    }
    let data: unknown[] = [];
    try { data = text ? JSON.parse(text) : []; } catch { /* ignore */ }
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, text: 'network error' };
  }
}

/* -------------------------------- views -------------------------------- */

/** fa_to_coin_wrapper::is_ready<Asset>() -> bool */
async function isWrapperReady(aptos: any, assetType: string): Promise<boolean> {
  const r = await viewCall(aptos, {
    function: fq('fa_to_coin_wrapper', 'is_ready') as FQName,
    typeArguments: [assetType],
    functionArguments: [],
  });
  return r.ok ? Boolean(r.data?.[0]) : false;
}

/** reserve::reserve_state<Asset>() -> struct { total_cash_available: u64, ... } */
async function getReserveCash(aptos: any, assetType: string): Promise<bigint | null> {
  const r = await viewCall(aptos, {
    function: fq('reserve', 'reserve_state') as FQName,
    typeArguments: [assetType],
    functionArguments: [],
  });
  if (!r.ok) return null;
  const row = r.data?.[0] as any;
  const raw = row?.total_cash_available;
  try { return toBigIntLoose(raw); } catch { return 0n; }
}

/** Try indexer first: /accounts/{addr}/fungible_asset_balances */
async function getFaBalanceIndexer(aptos: any, owner: string, faObject: string): Promise<bigint | null> {
  try {
    // TS SDK name can vary; treat as any and filter by metadata address.
    const rows: any[] = await (aptos as any).getAccountFungibleAssetBalances?.({
      accountAddress: owner,
    });
    if (!Array.isArray(rows)) return null;

    // rows[i].metadata?.address OR rows[i].fungible_asset_metadata?.address (SDK versions differ)
    const row = rows.find((r: any) => {
      const metaAddr =
        r?.metadata?.address ??
        r?.fungible_asset_metadata?.address ??
        r?.asset?.metadata?.address;
      return typeof metaAddr === 'string' && metaAddr.toLowerCase() === faObject.toLowerCase();
    });

    if (!row) return 0n;

    const amt = row.amount ?? row?.balance ?? row?.amount_v1 ?? '0';
    return toBigIntLoose(amt);
  } catch {
    return null; // force fallback to /v1/view
  }
}

/** 0x1::fungible_asset::balance(address, object) -> u128 (fallback when indexer fails) */
async function getFaBalanceView(aptos: any, owner: string, faObject: string): Promise<bigint | null> {
  const r = await viewCall(aptos, {
    function: '0x1::fungible_asset::balance' as FQName,
    typeArguments: [],
    functionArguments: [owner, faObject],
  });
  if (!r.ok) return null;
  try { return toBigIntLoose(r.data?.[0]); } catch { return 0n; }
}

async function getFaBalance(aptos: any, owner: string, faObject: string): Promise<bigint | null> {
  const idx = await getFaBalanceIndexer(aptos, owner, faObject);
  if (idx != null) return idx;
  return await getFaBalanceView(aptos, owner, faObject);
}

/* ---------------------------------- Hook ---------------------------------- */

export function useBorrow({
  decimals = WUSDC_DECIMALS ?? DEFAULT_DECIMALS,
  assetType = WUSDC_TYPE,
  faMetadataObject = DEFAULT_FA_OBJECT,
  defaultProfileName = 'main',
  requireWrapperReady = true,
}: Options = {}) {
  const { aptos } = useAptos();
  const { account, signAndSubmitTransaction } = useWallet();

  const { limitRaw, borrowedRaw, refresh: refreshCredit } = useCreditLine({
    pollMs: 15_000,
    assetType,
    decimals,
  });

  const [submitting, setSubmitting] = React.useState(false);
  const [lastTxHash, setLastTxHash] = React.useState<string | null>(null);
  const owner = account?.address ? String(account.address) : null;

  // Capacity = max(limit - borrowed, 0)
  const maxBorrowRaw: bigint | null = React.useMemo(() => {
    if (limitRaw == null || borrowedRaw == null) return null;
    const cap = limitRaw - borrowedRaw;
    return cap > 0n ? cap : 0n;
  }, [limitRaw, borrowedRaw]);

  const maxBorrowDisplay: string = React.useMemo(() => {
    if (maxBorrowRaw == null) return '—';
    return `${formatUSDCAmount2dp(maxBorrowRaw)} USDC`;
  }, [maxBorrowRaw]);

  /** Progressive validator (format + capacity). */
  const validateAmount = React.useCallback(
    (amountInput: string) => {
      const cleaned = cleanAmountInput(amountInput);
      if (!cleaned) return { ok: false, reason: 'Enter an amount.', amount: null as bigint | null };
      let amount: bigint;
      try { amount = parseUnitsAptos(cleaned, decimals); }
      catch { return { ok: false, reason: 'Invalid amount.', amount: null }; }
      if (amount <= 0n) return { ok: false, reason: 'Amount must be greater than 0.', amount: null };
      if (maxBorrowRaw != null && amount > maxBorrowRaw) {
        return { ok: false, reason: 'Amount exceeds your available capacity.', amount: null };
      }
      return { ok: true as const, reason: null as null, amount };
    },
    [maxBorrowRaw, decimals],
  );

  const exceedsCapacity = React.useCallback(
    (amountInput: string) => {
      try {
        const a = parseUnitsAptos(cleanAmountInput(amountInput) || '0', decimals);
        return maxBorrowRaw != null && a > maxBorrowRaw;
      } catch { return false; }
    },
    [maxBorrowRaw, decimals],
  );

  // Encode profile name (vector<u8>)
  const encoder = React.useMemo(() => new TextEncoder(), []);
  const toBytes = React.useCallback((s: string) => encoder.encode(s), [encoder]);

  // Fully-qualified function for tx
  const FN_BORROW_FA = React.useMemo(
    () => `${LENDOOR_CONTRACT}::controller::borrow_fa` as FQName,
    [],
  );

  /** Submit borrow (FA) */
  const submit = React.useCallback(
    async (amountInput: string, profileName: string = defaultProfileName): Promise<BorrowResult> => {
      if (!owner) {
        toast.error('Connect a wallet', { description: 'No account connected.' });
        return { ok: false, error: 'no-account' };
      }
      if (!faMetadataObject) {
        toast.error('Missing FA metadata object', { description: 'Set VITE_FA_METADATA_OBJECT or VITE_USDC_ADDRESS.' });
        return { ok: false, error: 'no-fa-object' };
      }

      const { ok, reason, amount } = validateAmount(amountInput);
      if (!ok || !amount) {
        toast.error('Invalid amount', { description: reason ?? 'Please check the value.' });
        return { ok: false, error: reason ?? 'invalid-amount' };
      }

      // (0) Wrapper readiness (optional)
      if (requireWrapperReady) {
        const ready = await isWrapperReady(aptos, assetType);
        if (!ready) {
          toast.error('Wrapper not ready', { description: 'FA wrapper is not initialized for this asset.' });
          return { ok: false, error: 'wrapper-not-ready' };
        }
      }

      // (1) Liquidity check
      const cash = await getReserveCash(aptos, assetType);
      if (cash == null || cash < amount) {
        toast.error('Insufficient liquidity', {
          description: `Reserve cash ${cash == null ? '—' : formatUSDCAmount2dp(cash)} < amount ${formatUSDCAmount2dp(amount)}`,
        });
        return { ok: false, error: 'insufficient-liquidity' };
      }

      // (2) PRE FA balance
      const pre = await getFaBalance(aptos, owner, faMetadataObject);

      setSubmitting(true);
      const tLoading = toast.loading('Submitting borrow…');

      try {
        // (3) TX: controller::borrow_fa<Asset>(profile: vector<u8>, amount: u64)
        const pending = await signAndSubmitTransaction({
          data: {
            function: FN_BORROW_FA,
            typeArguments: [assetType],
            functionArguments: [toBytes(profileName), amount],
          },
        });
        setLastTxHash(pending.hash);
        await aptos.waitForTransaction({ transactionHash: pending.hash });

        // (4) POST FA balance + refresh credit views
        const post = await getFaBalance(aptos, owner, faMetadataObject);
        const delta = (post ?? 0n) - (pre ?? 0n);

        // broadcast refresh to any listeners (hook, widgets, etc.)
        triggerCreditRefresh(owner);
        // local best-effort refresh
        setTimeout(() => { try { refreshCredit(); } catch {} }, 250);

        toast.dismiss(tLoading);
        toast.success('Borrow confirmed', {
          description: `+${formatUSDCAmount2dp(amount)} USDC (FA).`,
        });

        return { ok: true, hash: pending.hash, faDelta: delta };
      } catch (e: any) {
        toast.dismiss(tLoading);
        const msg = e?.shortMessage || e?.reason || e?.message || 'Transaction failed';
        toast.error('Borrow failed', { description: msg });
        return { ok: false, error: msg };
      } finally {
        setSubmitting(false);
      }
    },
    [
      owner,
      aptos,
      assetType,
      decimals,
      faMetadataObject,
      requireWrapperReady,
      signAndSubmitTransaction,
      toBytes,
      validateAmount,
      refreshCredit,
      FN_BORROW_FA,
    ],
  );

  return {
    // capacity
    limitRaw,
    borrowedRaw,
    maxBorrowRaw,
    maxBorrowDisplay,
    exceedsCapacity,
    validateAmount,
    canSubmit: (amountStr: string) => validateAmount(amountStr).ok,

    // tx
    submit,
    submitting,
    lastTxHash,
  };
}
