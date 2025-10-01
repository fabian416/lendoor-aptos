'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { InfoTip } from '@/components/common/InfoTooltip'
import { CenteredAmountInput } from '@/components/common/CenteredAmountInput'
import { AvailableToWithdrawKPI } from '@/components/kpi/AvailableToWithdraw'
import { JusdcBalanceKPI } from '@/components/kpi/jUSDCBalance'
import { JusdcExchangeRateKPI } from '@/components/kpi/ExchangeRatejUSDC'
import UserJourneyBadge from '@/components/common/UserJourneyBadge'
import { useUserJourney } from '@/providers/UserProvider'
import { useMoveModule } from '@/providers/MoveModuleProvider'
import { USDC_TYPE, USDC_DECIMALS } from '@/lib/constants'
import { parseUnitsAptos, formatUnitsAptos, fq } from '@/lib/utils'
import { useWallet } from '@aptos-labs/wallet-adapter-react'


type WithdrawPanelProps = {
  isLoggedIn: boolean
  loadingNetwork: boolean
  onConnect: () => void
  availableLabel?: string // e.g., "AVAILABLE: $"
}

export function WithdrawjUSDCPanel({
  isLoggedIn,
  loadingNetwork,
  onConnect,
  availableLabel = 'AVAILABLE: $',
}: WithdrawPanelProps) {
  const [amount, setAmount] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const { ready, value } = useUserJourney()
  const [balance, setBalance] = useState('0')       // jUSDC balance (shares)
  const [submitting, setSubmitting] = useState(false)

  const { account } = useWallet()
  const connectedAddress = account?.address
  const { callView, entry } = useMoveModule()

  // Withdraw jUSDC (shares) -> get LP -> redeem to USDC
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) return onConnect()
    if (!amount || !connectedAddress) return

    setSubmitting(true)
    try {
      // Interpret input as jUSDC shares (same decimals as underlying/LP)
      const sharesU64 = parseUnitsAptos(amount, USDC_DECIMALS)

      // 1) Burn jUSDC -> receive LP back to user's wallet
      await entry(
        fq('junior', 'withdraw'),
        [USDC_TYPE],
        [sharesU64.toString()],
        { checkSuccess: true }
      )

      // 2) Check how many LP we now hold and redeem them to underlying USDC
      const [lpNowStr] = await callView<[string]>(
        fq('reserve', 'lp_balance'),     // #[view] helper you added
        [USDC_TYPE],
        [connectedAddress]
      )
      if (BigInt(lpNowStr) > 0n) {
        await entry(
          fq('controller', 'redeem'),
          [USDC_TYPE],
          [lpNowStr],
          { checkSuccess: true }
        )
      }

      await refreshJBalance()
    } catch (err) {
      console.error('withdraw jUSDC error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // Read jUSDC balance via helper view
  const refreshJBalance = async () => {
    if (!connectedAddress) return
    try {
      const [rawStr] = await callView<[string]>(
        fq('reserve', 'junior_balance'), // #[view] helper you added
        [USDC_TYPE],
        [connectedAddress]
      )
      const next = formatUnitsAptos(BigInt(rawStr), USDC_DECIMALS)
      setBalance(prev => (prev === next ? prev : next))
    } catch (e) {
      console.error('read junior_balance:', e)
    }
  }

  // Optionally compute "available to withdraw" in USDC here if you later expose a view
  // that returns a jUSDC -> underlying quote. For now, keep a placeholder or map it to shares.
  const availableToWithdraw = '-' // replace with a computed value when you add a quote view

  useEffect(() => {
    if (!connectedAddress) return
    refreshJBalance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, submitting])

  const cta = !isLoggedIn && !loadingNetwork ? 'Connect Wallet' : 'Withdraw Liquidity';
  const isDisabled = !amount || submitting;
  const showBadge = ready && (value === "withdraw_susdc");

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2 w-full mx-auto">
        <JusdcBalanceKPI value={balance} />
        <AvailableToWithdrawKPI value={`${availableToWithdraw} USDC`} />
        <JusdcExchangeRateKPI value="—" />
      </div>

      <Card className="p-4 border-2 border-border/50">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground font-mono">MANAGE LIQUIDITY (Junior)</span>
        </div>

        <form onSubmit={submit} className="w-full">
          <CenteredAmountInput value={amount} onChange={setAmount} symbol="¢" showBadge={showBadge && !amount} />
          <div className="mt-1 mb-4 text-xs text-muted-foreground text-center">
            {availableLabel}{availableToWithdraw}
          </div>

          <Button
            type="submit"
            disabled={isDisabled}
            className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 cursor-pointer text-base font-semibold"
          >
            { !!amount && showBadge && <UserJourneyBadge/>}
            {cta}
          </Button>
        </form>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              TX Cost <InfoTip label="Estimated gas for jUSDC withdraw (junior withdraw + LP redeem)." variant="light" />
            </span>
            <span className="text-xs">-</span>
          </div>
        </div>

        {/* Collapsible Info */}
        <div className="border-top border-border pt-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-muted rounded flex items-center justify-center">
                <span className="text-xs">🏦</span>
              </div>
              <span className="text-sm font-medium">Withdrawal Info</span>
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-3">
              <div className="text-xs text-muted-foreground">
                Real-time liquidity depends on reserve cash; junior shares burn to LP, then LP redeem to USDC.
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  )
}
