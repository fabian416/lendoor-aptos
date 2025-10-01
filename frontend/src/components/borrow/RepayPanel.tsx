'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/common/InfoTooltip'
import { CenteredAmountInput } from '@/components/common/CenteredAmountInput'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { BaseApyKPI } from '@/components/kpi/BaseAPY'
import { OutstandingKPI } from '@/components/kpi/Outstanding'
import { CreditScoreKPI } from '@/components/kpi/Score'
import UserJourneyBadge from '@/components/common/UserJourneyBadge'
import ExpandedMenu from '@/components/borrow/ExpandedMenu'
import { useUserJourney } from '@/providers/UserProvider'
import { useMoveModule } from '@/providers/MoveModuleProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { USDC_TYPE, USDC_DECIMALS } from '@/lib/constants'
import { parseUnitsAptos, formatUnitsAptos, fq } from '@/lib/utils'


type RepayPanelProps = {
  isLoggedIn: boolean,
  loadingNetwork: boolean,
  onConnect: () => void,
  outstandingLabel?: string,
}

export function RepayPanel({
  isLoggedIn,
  loadingNetwork,
  onConnect,
  outstandingLabel = 'OUTSTANDING: ',
}: RepayPanelProps) {
  const [amount, setAmount] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const { ready, value } = useUserJourney()
  const [submitting, setSubmitting] = useState(false)
  const [outstanding, setOutstanding] = useState('0')

  const { account } = useWallet()
  const connectedAddress = account?.address
  const { callView, entry } = useMoveModule()

  // --- Action: repay debt by depositing with repay_only = true
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) return onConnect()
    if (!amount || !connectedAddress) return

    setSubmitting(true)
    try {
      // Optional: ensure the user has a profile (uncomment if needed)
      // const [isReg] = await callView<[boolean]>(fq('profile','is_registered'), [], [connectedAddress])
      // if (!isReg) {
      //   const name = new TextEncoder().encode('main')
      //   await entry(fq('controller','register_user'), [], [name], { checkSuccess: true })
      // }

      const amountU64 = parseUnitsAptos(amount, USDC_DECIMALS)
      const profileName = new TextEncoder().encode('main')

      // controller::deposit<Coin>(profile_name, amount, repay_only=true)
      await entry(
        fq('controller', 'deposit'),
        [USDC_TYPE],
        [profileName, amountU64.toString(), true],
        { checkSuccess: true }
      )

      await refreshOutstanding()
    } catch (err) {
      console.error('repay error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // --- Read outstanding debt:
  // profile::profile_loan<Coin>(user) -> (borrowed_share_decimal, borrowed_amount_decimal[1e18])
  // Convert borrowed_amount_decimal (1e18) to token base units (1e6) by dividing by 1e12.
  const refreshOutstanding = async () => {
    if (!connectedAddress) return
    try {
      const [_shareRaw, borrowedDecRaw] = await callView<[string, string]>(
        fq('profile', 'profile_loan'),
        [USDC_TYPE],
        [connectedAddress]
      )
      const borrowedDec = BigInt(borrowedDecRaw)          // raw 1e18
      const baseUnits = borrowedDec / 1_000_000_000_000n  // /1e12 -> 1e6
      const next = formatUnitsAptos(baseUnits, USDC_DECIMALS)
      setOutstanding(prev => (prev === next ? prev : next))
    } catch (e) {
      console.error('read profile_loan:', e)
    }
  }

  useEffect(() => {
    if (!connectedAddress) return
    refreshOutstanding()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, submitting])

  const cta = !isLoggedIn && !loadingNetwork ? 'Connect Wallet' : 'Repay'
  const isDisabled = !amount || submitting;
  const showBadge = ready && (value === "repay");

  return (
    <>
      <div className="grid grid-cols-4 gap-2 w-full mx-auto">
        <BaseApyKPI value="6.82%" />
        <OutstandingKPI value={outstanding} />
        <CreditScoreKPI value="120/255" />
      </div>

      <Card className="p-4 border-2 border-border/50">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground font-mono">
            REPAY YOUR LOAN
          </span>
        </div>

        <div className="mb-4">
          <form onSubmit={submit} className="w-full">
              <CenteredAmountInput value={amount} onChange={setAmount} symbol='¢' showBadge={showBadge && !amount} />

            <div className="mt-1 mb-4 text-xs text-muted-foreground text-center">
              {outstandingLabel}{outstanding} USDC
            </div>

            <Button
              type="submit"
              disabled={isDisabled}
              className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 cursor-pointer text-base font-semibold"
            >
              {!!amount && showBadge && <UserJourneyBadge/>}
              {cta}
            </Button>
          </form>
        </div>

        <div className="space-y-2 mb-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              TX Cost <InfoTip label="Estimated gas for this repayment (controller.deposit with repay_only=true)." variant="light" />
            </span>
            <span className="text-xs">-</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              Repayment Type{' '}
              <InfoTip
                label="Depending on market settings, repayments may prioritize interest then principal."
                contentClassName="font-display text-[11px] leading-snug"
              />
            </span>
            <span className="text-xs">Interest first</span>
          </div>
        </div>

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
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && <ExpandedMenu score="120/255" /> }
        </div>
      </Card>
    </>
  )
}
