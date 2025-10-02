'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { useCreditLine } from '@/hooks/borrow/useCreditLine' // <- tu versión Move
import { DECIMALS, parseUnitsAptos } from '@/lib/utils'
import { LENDOOR_CONTRACT, WUSDC_TYPE } from '@/lib/constants'
import type { FQName } from '@/types/aptos'

type Options = { requireController?: boolean } // kept for API parity; no-op on Move

const err = (e: any) => e?.shortMessage || e?.reason || e?.message || 'Transaction failed'

/** Integer formatter (truncate decimals) with thousands separators. */
function fmt0(amount: bigint, decimals = DECIMALS): string {
  const base = 10n ** BigInt(decimals)
  const whole = amount / base
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** sanitize input like "1_000" or "1,000.25" -> "1000.25" */
function cleanAmountInput(s: string): string {
  return (s || '').replace(/[_,\s]/g, '')
}

// controller::borrow_fa<Coin>(profile_name: vector<u8>, amount: u64)
const FN_BORROW_FA = `${LENDOOR_CONTRACT}::controller::borrow_fa` as FQName

export function useBorrow({ requireController = true }: Options = {}) {
  const { aptos } = useAptos()
  const { account, signAndSubmitTransaction } = useWallet()

  // Credit line (Move version): limitRaw/borrowedRaw in base units
  const { limitRaw, borrowedRaw } = useCreditLine({ pollMs: 15_000 })

  const [submitting, setSubmitting] = React.useState(false)

  // Capacity = max(limit - borrowed, 0)
  const maxBorrowRaw: bigint | null = React.useMemo(() => {
    if (limitRaw == null || borrowedRaw == null) return null
    const cap = limitRaw - borrowedRaw
    return cap > 0n ? cap : 0n
  }, [limitRaw, borrowedRaw])

  const maxBorrowDisplay: string = React.useMemo(() => {
    if (maxBorrowRaw == null) return '—'
    return `${fmt0(maxBorrowRaw, DECIMALS)} USDC`
  }, [maxBorrowRaw])

  /** Basic amount validation vs capacity */
  const validateAmount = React.useCallback(
    (amountInput: string) => {
      const cleaned = cleanAmountInput(amountInput)
      if (!cleaned) return { ok: false, reason: 'Enter an amount.' as string, amount: null as bigint | null }
      let amount: bigint
      try {
        amount = parseUnitsAptos(cleaned, DECIMALS)
      } catch {
        return { ok: false, reason: 'Invalid amount.', amount: null }
      }
      if (amount <= 0n) return { ok: false, reason: 'Amount must be greater than 0.', amount: null }
      if (maxBorrowRaw != null && amount > maxBorrowRaw) {
        return { ok: false, reason: 'Amount exceeds your available capacity.', amount: null }
      }
      return { ok: true as const, reason: null as null, amount }
    },
    [maxBorrowRaw],
  )

  /** UI helper for progressive validation */
  const exceedsCapacity = React.useCallback(
    (amountInput: string) => {
      const cleaned = cleanAmountInput(amountInput)
      try {
        const a = parseUnitsAptos(cleaned || '0', DECIMALS)
        return maxBorrowRaw != null && a > maxBorrowRaw
      } catch {
        return false
      }
    },
    [maxBorrowRaw],
  )

  // Encode vector<u8> for Move
  const toBytes = React.useMemo(() => new TextEncoder(), []).encode.bind(new TextEncoder())

  const submit = React.useCallback(
    async (amountInput: string, profileName: string = 'main') => {
      const addr = account?.address?.toString()
      if (!addr) {
        toast.error('Connect a wallet', { description: 'No account connected.' })
        return false
      }

      const { ok, reason, amount } = validateAmount(amountInput)
      if (!ok || !amount) {
        toast.error('Invalid amount', { description: reason ?? 'Please check the value.' })
        return false
      }

      setSubmitting(true)
      const tLoading = toast.loading('Submitting borrow…')

      try {
        // No "enable controller" step on Move; controller access is configured on-chain by admins.

        // Borrow FA to the caller
        const pending = await signAndSubmitTransaction({
          data: {
            function: FN_BORROW_FA,
            typeArguments: [WUSDC_TYPE],
            functionArguments: [toBytes(profileName), amount],
          },
        })
        await aptos.waitForTransaction({ transactionHash: pending.hash })

        toast.dismiss(tLoading)
        toast.success('Borrow confirmed', {
          description: 'Funds have been transferred to your wallet.',
        })
        return true
      } catch (e: any) {
        toast.dismiss(tLoading)
        toast.error('Borrow failed', { description: err(e) })
        return false
      } finally {
        setSubmitting(false)
      }
    },
    [account?.address, signAndSubmitTransaction, aptos, validateAmount],
  )

  return {
    limitRaw,
    borrowedRaw,
    maxBorrowRaw,

    maxBorrowDisplay,
    exceedsCapacity,
    validateAmount,
    canSubmit: (amountStr: string) => validateAmount(amountStr).ok,

    submit,
    submitting,
  }
}
