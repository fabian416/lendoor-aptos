'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { InfoTip } from '@/components/common/InfoTooltip'
import { CenteredAmountInput } from '@/components/common/CenteredAmountInput'
import { JrApyKPI } from '@/components/kpi/JrAPY'
import { BackingTVVKPI } from '@/components/kpi/BackingTVV'
import { SrApyKPI } from '@/components/kpi/SrAPY'
import { AvailableToWithdrawKPI } from '../kpi/AvailableToWithdraw'
import { JusdcBalanceKPI } from '../kpi/jUSDCBalance'
import { SusdcBalanceKPI } from '../kpi/sUSDCBalance'
import { JusdcExchangeRateKPI } from '../kpi/ExchangeRatejUSDC'

type WithdrawPanelProps = {
  isLoggedIn: boolean
  loadingNetwork: boolean
  onConnect: () => void
  onWithdraw: (amount: string) => void
  availableLabel?: string // ej: "AVAILABLE: $0"
}

export function WithdrawjUSDCPanel({
  isLoggedIn,
  loadingNetwork,
  onConnect,
  onWithdraw,
  availableLabel = 'AVAILABLE: $',
}: WithdrawPanelProps) {
  const [amount, setAmount] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) return onConnect()
    if (!amount) return
    onWithdraw(amount)
  }

  const cta = !isLoggedIn && !loadingNetwork ? 'Connect Wallet' : 'Withdraw Liquidity'
  let availableToWithdraw = 20;
  return (
    <>
      {/* KPIs (mismos que Supply; podés cambiarlos si necesitás) */}
      <div className="grid grid-cols-4 gap-2 w-full mx-auto">
        <JusdcBalanceKPI value="20" />
        <AvailableToWithdrawKPI value={`${availableToWithdraw} USDC`} />
        <JusdcExchangeRateKPI value="1.107%" />
      </div>

      <Card className="p-4 border-2 border-border/50">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground font-mono">MANAGE LIQUIDITY</span>
        </div>

        <form onSubmit={submit} className="w-full">
            <CenteredAmountInput value={amount} onChange={setAmount} />
            <div className="mt-1 mb-4 text-xs text-muted-foreground text-center">
            {availableLabel}{availableToWithdraw}
            </div>

            {/* botón full width */}
            <Button
            type="submit"
            className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 cursor-pointer text-base font-semibold"
            >
            {cta}
            </Button>
        </form>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              TX Cost <InfoTip label="Estimated gas for withdrawing." variant="light" />
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
                Real-time liquidity depends on market reserves; some tranches (ej. jUSDC) pueden tener cooldown.
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  )
}
