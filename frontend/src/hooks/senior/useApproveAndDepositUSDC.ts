'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { useAptos } from '@/providers/WalletProvider';
import { useWallet } from '@aptos-labs/wallet-adapter-react';
import {
  LENDOOR_CONTRACT,
  WUSDC_DECIMALS as DECIMALS,
  WUSDC_TYPE,
  FA_METADATA_OBJECT,
} from '@/lib/constants';
import { parseUnitsAptos, formatUSDCAmount2dp } from '@/lib/utils';
import { useUserJourney } from '@/providers/UserJourneyProvider';

/** Human-friendly message extraction */
const msg = (e: any) =>
  e?.shortMessage || e?.reason || e?.message || e?.vm_status || 'Transaction failed';

/** Encode string to vector<u8> as plain number[] (wallets serialize this reliably) */
const bytes = (s: string) => Array.from(new TextEncoder().encode(s));

/** Accept string or object implementing toString() for addresses */
type Addressish = string | { toString: () => string };
const asStr = (a: Addressish | null | undefined) =>
  typeof a === 'string' ? a : a?.toString?.() ?? '';

/** Case-insensitive hex normalize */
const norm = (a?: string | null) => (a ?? '').toLowerCase();

/** Indexer FA balance by metadata object */
async function faBalanceIndexer(aptos: any, owner: Addressish, meta: string): Promise<bigint | null> {
  try {
    const list = await aptos.getAccountFungibleAssetBalances({ accountAddress: asStr(owner) });
    const hit =
      list?.find((b: any) => {
        const m1 = b?.asset?.metadata_address;
        const m2 = b?.asset?.metadata?.address;
        const m3 = b?.metadata_address;
        return [m1, m2, m3].some((x) => norm(x) === norm(meta));
      }) ?? null;
    if (hit?.amount != null) return BigInt(hit.amount);
  } catch { /* ignore indexer failures */ }
  return null;
}

/** On-chain FA balance via view: 0x1::primary_fungible_store::balance(owner, metadata_obj) -> u128 */
async function faBalanceOnChain(aptos: any, owner: Addressish, meta: string): Promise<bigint | null> {
  try {
    const res = (await aptos.view({
      payload: {
        function: '0x1::primary_fungible_store::balance',
        typeArguments: [],
        functionArguments: [asStr(owner), meta],
      },
    })) as unknown as [string] | undefined;
    const raw = res?.[0];
    if (raw != null) return BigInt(raw);
  } catch { /* tolerate nodes without this view */ }
  return null;
}

/** On-chain APT balance for gas: 0x1::coin::balance<APT>(addr) -> u64 */
async function aptBalance(aptos: any, owner: Addressish): Promise<bigint | null> {
  try {
    const res = (await aptos.view({
      payload: {
        function: '0x1::coin::balance',
        typeArguments: ['0x1::aptos_coin::AptosCoin'],
        functionArguments: [asStr(owner)],
      },
    })) as unknown as [string] | undefined;
    const raw = res?.[0];
    if (raw != null) return BigInt(raw);
  } catch { /* ignore */ }
  return null;
}

/** Map known Move aborts to clearer messages */
function normalizeMoveError(e: any): string {
  const m = msg(e);
  if (m.includes('ECONTROLLER_DEPOSIT_ZERO_AMOUNT')) return 'Amount must be greater than zero.';
  if (m.includes('EFA_SIGNER_DOES_NOT_EXIST')) return 'FA wrapper signer is not initialized.';
  if (m.includes('EWRAPPER_COIN_INFO_DOES_NOT_EXIST'))
    return 'Wrapped coin is not registered in the wrapper.';
  if (m.toLowerCase().includes('insufficient') || m.toLowerCase().includes('not enough'))
    return 'Insufficient balance for this deposit.';
  if (m.includes('ECONTROLLER_NO_CONFIG'))
    return 'Controller configuration not found at expected address.';
  if (m.includes('EONLY_PACKAGE_OWNER') || m.includes('EADMIN_MUST_EQUAL_CALLER'))
    return 'Admin/package ownership mismatch in configuration.';
  return m;
}

type SubmitOptions = {
  /** If true, proceed when neither indexer nor on-chain balance can be read */
  allowUnknownBalance?: boolean;
};

export function useApproveAndDepositUSDC() {
  const { aptos } = useAptos();
  const { account, signAndSubmitTransaction } = useWallet();
  const addr = (account?.address as any) as Addressish | undefined; // Wallet adapters vary; coerce to string
  const { value, updateJourney } = useUserJourney();
  const [submitting, setSubmitting] = React.useState(false);

  const submit = React.useCallback(
    async (amountInput: string, profileName: string = 'main', opts: SubmitOptions = {}) => {
      const { allowUnknownBalance = true } = opts;

      if (!amountInput?.trim()) return;
      if (!addr) {
        toast.error('Connect a wallet', { description: 'No account connected.' });
        return;
      }

      setSubmitting(true);
      try {
        // Parse human input into base units
        const assets = parseUnitsAptos(amountInput.trim(), DECIMALS);
        if (assets <= 0n) {
          toast.error('Invalid amount', { description: 'Enter a positive value.' });
          return;
        }

        // Gas sanity: many wallets refuse to simulate if APT = 0
        try {
          const apt = await aptBalance(aptos, addr);
          if (apt !== null && apt === 0n) {
            toast.error('No gas', { description: 'Your account has 0 APT on testnet.' });
            return;
          }
        } catch { /* ignore */ }

        // Readiness checks on-chain
        try {
          const [ready] = (await aptos.view({
            payload: {
              function: `${LENDOOR_CONTRACT}::fa_to_coin_wrapper::is_ready`,
              typeArguments: [WUSDC_TYPE],
              functionArguments: [],
            },
          })) as unknown as [boolean];
          if (!ready) {
            toast.error('Wrapper not ready', {
              description: 'FA wrapper is not initialized for this asset.',
            });
            return;
          }
          const [exists] = (await aptos.view({
            payload: {
              function: `${LENDOOR_CONTRACT}::reserve::exists_for`,
              typeArguments: [WUSDC_TYPE],
              functionArguments: [],
            },
          })) as unknown as [boolean];
          if (!exists) {
            toast.error('Reserve missing', {
              description: 'Asset reserve has not been created on-chain.',
            });
            return;
          }
        } catch {
          toast.error('Preflight failed', {
            description: 'On-chain readiness checks did not pass.',
          });
          return;
        }

        // Balance checks (indexer -> on-chain fallback)
        let bal = await faBalanceIndexer(aptos, addr, FA_METADATA_OBJECT);
        if (bal == null) {
          const onchain = await faBalanceOnChain(aptos, addr, FA_METADATA_OBJECT);
          if (onchain != null) bal = onchain;
        }
        if (bal == null && !allowUnknownBalance) {
          toast.error('Cannot verify balance', {
            description:
              'Neither indexer nor on-chain balance could be read for this FA. Check FA_METADATA_OBJECT.',
          });
          return;
        }
        if (bal != null && bal < assets) {
          toast.error('Insufficient balance', {
            description: `You have ${formatUSDCAmount2dp(bal)} and need ${formatUSDCAmount2dp(
              assets,
            )}.`,
          });
          return;
        }

        // Wallet payload: number[] for vector<u8>, string for u64
        const payload = {
          function: `${LENDOOR_CONTRACT}::controller::deposit_fa`,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [bytes(profileName), assets.toString()],
        };

        let pending: any;
        try {
          pending = await signAndSubmitTransaction({ data: payload as any });
        } catch (e: any) {
          toast.error('Signing failed', { description: normalizeMoveError(e) });
          throw e;
        }

        try {
          await aptos.waitForTransaction({ transactionHash: pending.hash });
        } catch (e: any) {
          toast.error('Deposit failed', { description: normalizeMoveError(e) });
          throw e;
        }

        toast.success('Deposit confirmed');
        if (value === 'deposit_usdc') {
          await updateJourney('deposit_susdc');
        }
        return true;
      } finally {
        setSubmitting(false);
      }
    },
    [aptos, signAndSubmitTransaction, addr, value, updateJourney],
  );

  return { submit, submitting };
}
