'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { useAptos } from '@/providers/WalletProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { DECIMALS, parseUnitsAptos } from '@/lib/utils'
import { LENDOOR_CONTRACT, WUSDC_TYPE } from '@/lib/constants'
import { useJuniorAvailableToWithdraw } from './useJuniorAvailableToWithdraw'

// Minimal, readable message extractor
const errMsg = (e: any) => e?.shortMessage || e?.reason || e?.message || 'Transaction failed'

// Encode vector<u8> for Move
const utf8Bytes = (s: string) => new TextEncoder().encode(s)

/** Try demote-by-s-shares entrypoints first (preferred UX). */
async function tryDemoteBySshares(
  signAndSubmitTransaction: any,
  aptos: any,
  sShares: bigint,
  profileName: string,
): Promise<boolean> {
  // With profile (vector<u8>)
  const preferWithProfile = [
    `${LENDOOR_CONTRACT}::controller::demote_junior_to_senior_by_s_shares`,
    `${LENDOOR_CONTRACT}::controller::demote_to_senior_by_s_shares`,
  ]
  for (const fn of preferWithProfile) {
    try {
      const pending = await signAndSubmitTransaction({
        data: {
          function: fn,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [utf8Bytes(profileName), sShares],
        },
      })
      await aptos.waitForTransaction({ transactionHash: pending.hash })
      return true
    } catch {}
  }

  // Without profile
  const noProfile = [
    `${LENDOOR_CONTRACT}::junior::redeem_s_shares`,
    `${LENDOOR_CONTRACT}::junior::demote_by_s_shares`,
    `${LENDOOR_CONTRACT}::junior::redeem_to_senior`,
  ]
  for (const fn of noProfile) {
    try {
      const pending = await signAndSubmitTransaction({
        data: {
          function: fn,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [sShares],
        },
      })
      await aptos.waitForTransaction({ transactionHash: pending.hash })
      return true
    } catch {}
  }
  return false
}

/** If only a j-shares demotion is available, try these. */
async function tryDemoteByJshares(
  signAndSubmitTransaction: any,
  aptos: any,
  jShares: bigint,
  profileName: string,
): Promise<boolean> {
  // With profile (vector<u8>)
  const withProfile = [
    `${LENDOOR_CONTRACT}::controller::demote_junior_to_senior`,
    `${LENDOOR_CONTRACT}::controller::redeem_junior_shares`,
  ]
  for (const fn of withProfile) {
    try {
      const pending = await signAndSubmitTransaction({
        data: {
          function: fn,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [utf8Bytes(profileName), jShares],
        },
      })
      await aptos.waitForTransaction({ transactionHash: pending.hash })
      return true
    } catch {}
  }

  // Without profile
  const noProfile = [
    `${LENDOOR_CONTRACT}::junior::redeem`,
    `${LENDOOR_CONTRACT}::junior::demote_to_senior`,
    `${LENDOOR_CONTRACT}::junior::redeem_j_shares`,
  ]
  for (const fn of noProfile) {
    try {
      const pending = await signAndSubmitTransaction({
        data: {
          function: fn,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [jShares],
        },
      })
      await aptos.waitForTransaction({ transactionHash: pending.hash })
      return true
    } catch {}
  }
  return false
}

/** Compute the j-shares required for a target amount of s-shares via view fns, with fallbacks. */
async function previewJForSshares(aptos: any, sShares: bigint): Promise<bigint | null> {
  // Direct helper on junior module (assets path), common names first
  const assetViews = [
    `${LENDOOR_CONTRACT}::junior::preview_withdraw`,            // (assets u64) -> j_shares u64
    `${LENDOOR_CONTRACT}::junior::shares_for_assets`,           // (assets u64) -> j_shares u64
    `${LENDOOR_CONTRACT}::controller::preview_withdraw_junior`, // <T>(assets u64) -> j_shares u64
  ]

  // Need assets for the s-shares target: try reserve/junior helpers
  const assetsFromSViews = [
    `${LENDOOR_CONTRACT}::reserve::assets_from_senior_shares`, // <T>(s_shares u64) -> assets u64
    `${LENDOOR_CONTRACT}::reserve::convert_to_assets`,         // <T>(s_shares u64) -> assets u64
    `${LENDOOR_CONTRACT}::junior::assets_from_s_shares`,       // <T>(s_shares u64) -> assets u64
  ]

  // 1) s-shares -> assets
  let assets: bigint | null = null
  for (const fn of assetsFromSViews) {
    try {
      const out = await aptos.view({
        payload: {
          function: fn,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [sShares],
        },
      })
      const v = out?.[0]
      if (v != null) {
        assets = typeof v === 'bigint' ? v : BigInt(v as string)
        break
      }
    } catch {}
  }
  if (assets == null) return null

  // 2) assets -> j-shares
  for (const fn of assetViews) {
    try {
      const out = await aptos.view({
        payload: {
          function: fn,
          typeArguments: [WUSDC_TYPE],
          functionArguments: [assets],
        },
      })
      const v = out?.[0]
      if (v != null) return typeof v === 'bigint' ? v : BigInt(v as string)
    } catch {}
  }

  return null
}

/**
 * Move adaptation of “demote junior to senior”.
 * Input is sUSDC in UI units (scaled with DECIMALS). Returns the same shape.
 */
export function useDemoteJunior() {
  const { aptos } = useAptos()
  const { account, signAndSubmitTransaction } = useWallet()

  // Available s-shares from the junior wrapper (we refresh it after tx)
  const { rawSShares, refresh: refreshAvailable } = useJuniorAvailableToWithdraw({ pollMs: 0 })

  // UI: base / 10^DECIMALS
  const availableUi = React.useMemo(
    () => (rawSShares == null ? 0 : Number(rawSShares) / 10 ** DECIMALS),
    [rawSShares],
  )

  const [submitting, setSubmitting] = React.useState(false)

  const submit = React.useCallback(
    async (amountInput: string, profileName: string = 'main') => {
      const amt = amountInput?.trim()
      if (!amt) return
      if (!account?.address) {
        toast.error('Connect a wallet', { description: 'No account connected.' })
        return
      }

      const want = Number(amt)
      if (!Number.isFinite(want) || want <= 0) {
        toast.error('Invalid amount')
        return
      }

      // Validate against available (both in UI units)
      if (want > availableUi) {
        toast.error('Amount exceeds available', {
          description: `Requested ${want.toFixed(DECIMALS)} sUSDC, available ${availableUi.toFixed(DECIMALS)} sUSDC.`,
        })
        return
      }

      setSubmitting(true)
      try {
        // UI -> on-chain base units (s-shares)
        const sDesiredBase = parseUnitsAptos(amt, DECIMALS)

        // Preferred path: demote by s-shares directly
        if (await tryDemoteBySshares(signAndSubmitTransaction, aptos, sDesiredBase, profileName)) {
          toast.success('Demote confirmed')
          await refreshAvailable()
          return true
        }

        // Fallback: compute required j-shares via views, then demote by j-shares
        let jNeeded: bigint | null = null
        try {
          jNeeded = await previewJForSshares(aptos, sDesiredBase)
        } catch {}
        if (jNeeded == null || jNeeded <= 0n) {
          toast.error('Demote failed', { description: 'No preview path available.' })
          return
        }

        if (await tryDemoteByJshares(signAndSubmitTransaction, aptos, jNeeded, profileName)) {
          toast.success('Demote confirmed')
          await refreshAvailable()
          return true
        }

        toast.error('Demote failed', { description: 'No demote entrypoint succeeded.' })
      } catch (e: any) {
        toast.error('Demote failed', { description: errMsg(e) })
      } finally {
        setSubmitting(false)
      }
    },
    [account?.address, availableUi, signAndSubmitTransaction, aptos, refreshAvailable],
  )

  return { submit, submitting, availableUi }
}
