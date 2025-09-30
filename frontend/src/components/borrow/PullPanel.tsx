'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/common/InfoTooltip'
import { CenteredAmountInput } from '@/components/common/CenteredAmountInput'
import { Card } from '@/components/ui/card'
import { ChevronDown, ShieldCheck } from 'lucide-react'
import { BorrowLimitKPI } from '@/components/kpi/Limit'
import { CreditScoreKPI } from '@/components/kpi/Score'
import { BaseApyKPI } from '@/components/kpi/BaseAPY'
import UserJourneyBadge from '@/components/common/UserJourneyBadge'
import ExpandedMenu from '@/components/borrow/ExpandedMenu'
import { useUserJourney } from '@/providers/UserProvider'
import { useMoveModule } from '@/providers/MoveModuleProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { USDC_TYPE, USDC_DECIMALS } from '@/lib/constants'
import { parseUnitsAptos, formatUnitsAptos, fq } from '@/lib/utils'

type PullPanelProps = {
  isLoggedIn: boolean,
  loadingNetwork: boolean,
  onConnect: () => void,
  maxPullLabel?: string,
  setShowQR: (show: boolean) => void,
}

export function PullPanel({
  isLoggedIn,
  loadingNetwork,
  onConnect,
  maxPullLabel = 'MAX PULL: ',
  setShowQR
}: PullPanelProps) {
  const [amount, setAmount] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const { ready, value, isVerified } = useUserJourney()

  const [submitting, setSubmitting] = useState(false)

  // KPIs state
  const [borrowedUnderlying, setBorrowedUnderlying] = useState('0') // formatted USDC
  const [limitU64, setLimitU64] = useState<bigint>(0n)
  const [usageU64, setUsageU64] = useState<bigint>(0n)

  const { account } = useWallet()
  const connectedAddress = account?.address
  const { callView, entry } = useMoveModule()

  // Submit borrow → controller::withdraw<Coin>(profile_name, amount, allow_borrow=true)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) return onConnect()
    if (ready && !isVerified) return setShowQR(true)
    if (!amount || !connectedAddress) return

    setSubmitting(true)
    try {
      // Optional: ensure user is registered once
      // const [isReg] = await callView<[boolean]>(fq('profile', 'is_registered'), [], [connectedAddress])
      // if (!isReg) {
      //   const name = new TextEncoder().encode('main')
      //   await entry(fq('controller', 'register_user'), [], [name], { checkSuccess: true })
      // }

      const amountU64 = parseUnitsAptos(amount, USDC_DECIMALS)
      const profileName = new TextEncoder().encode('main') // vector<u8> profile name

      await entry(
        fq('controller', 'withdraw'),
        [USDC_TYPE],
        [profileName, amountU64.toString(), true], // allow_borrow = true
        { checkSuccess: true }
      )

      // Update panels
      await Promise.all([refreshDebt(), refreshCreditLimit()])
    } catch (err: any) {
      console.error('borrow tx failed:', err)
      // bubble an error toast if needed
    } finally {
      setSubmitting(false)
    }
  }

  // Read current debt (underlying) from profile::profile_loan<Coin>(user)
  // profile_loan returns (borrowed_share_decimal, borrowed_amount_decimal) both as Decimal raw (1e18).
  // We convert borrowed_amount_decimal (u128 as string) → token base units (1e6) by dividing by 1e12.
  const refreshDebt = async () => {
    if (!connectedAddress) return
    try {
      const [_shareRaw, borrowedDecRaw] = await callView<[string, string]>(
        fq('profile', 'profile_loan'),
        [USDC_TYPE],
        [connectedAddress]
      )
      const borrowedDec = BigInt(borrowedDecRaw)            // 1e18 scaled
      const asTokenBase = borrowedDec / 1_000_000_000_000n  // /1e12 → 1e6 base units
      const next = formatUnitsAptos(asTokenBase, USDC_DECIMALS)
      setBorrowedUnderlying(prev => (prev === next ? prev : next))
    } catch (e) {
      console.error('read profile_loan:', e)
    }
  }

  // Read credit limit & usage for this asset from credit_manager
  const refreshCreditLimit = async () => {
    if (!connectedAddress) return
    try {
      const limit = await callView<[string]>(fq('credit_manager', 'get_limit'), [USDC_TYPE], [connectedAddress])
      const usage = await callView<[string]>(fq('credit_manager', 'get_usage'), [USDC_TYPE], [connectedAddress])
      const lim = BigInt(limit[0])
      const use = BigInt(usage[0])
      setLimitU64(lim)
      setUsageU64(use)
    } catch (e) {
      console.error('read credit limit/usage:', e)
    }
  }

  // Derived KPIs
  const borrowed = borrowedUnderlying // prettified
  const borrowLimit = formatUnitsAptos(limitU64, USDC_DECIMALS)
  const usedPretty  = formatUnitsAptos(usageU64, USDC_DECIMALS)
  // Note: toBorrow (headroom) = limit - usage (both u64)
  const toBorrowBase = limitU64 > usageU64 ? (limitU64 - usageU64) : 0n
  const toBorrowPretty = formatUnitsAptos(toBorrowBase, USDC_DECIMALS)
  const score = '—' // keep placeholder unless you wire a real score

  useEffect(() => {
    if (!connectedAddress) return
    // Load KPIs on mount/changes
    Promise.all([refreshDebt(), refreshCreditLimit()]).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, submitting])

  const cta = !isLoggedIn && !loadingNetwork ? 'Connect Wallet' : 'Borrow now'

  return (
    <>
      <div className="grid grid-cols-4 gap-2 w-full mx-auto">
        <BaseApyKPI value="6.82%" />
        <BorrowLimitKPI value={`${usedPretty}/${borrowLimit}`} />
        <CreditScoreKPI value={score} />
      </div>

      <Card className="p-4 border-2 border-border/50">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground font-mono">
            BORROW BANK-FREE
          </span>

          {isVerified && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[11px] font-semibold">
              <ShieldCheck className="w-3 h-3" />
              Identity Verified
            </span>
          )}
        </div>

        <div className="mb-4">
          <form onSubmit={submit} className="w-full">
            <CenteredAmountInput value={amount} onChange={setAmount} symbol="¢" />
            <div className="mt-1 mb-4 text-xs text-muted-foreground text-center">
              {maxPullLabel}{toBorrowPretty}{" USDC"}
            </div>

            <Button
              type="submit"
              disabled={!amount || submitting}
              className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 cursor-pointer text-base font-semibold"
            >
              {ready && (value === 'verify_identity' || value === 'borrow') && <UserJourneyBadge />}
              {cta}
            </Button>
          </form>
        </div>

        <div className="space-y-2 mb-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              TX Cost <InfoTip label="Estimated gas for this borrow (controller.withdraw with allow_borrow=true)." variant="light" />
            </span>
            <span className="text-xs">-</span>
          </div>
        </div>

        {/* Collapsible Credit Info */}
        <div className="border-t border-border pt-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-muted rounded flex items-center justify-center">
                <span className="text-xs">💳</span>
              </div>
              <span className="text-sm font-medium">Credit Info</span>
            </div>
            {isExpanded ? <ChevronDown className="w-4 h-4 rotate-180" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          
          {isExpanded && ( <ExpandedMenu score={score} /> )}
        </div>
      </Card>
    </>
  )
}
