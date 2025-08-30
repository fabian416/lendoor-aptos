'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/common/InfoTooltip'
import { CenteredAmountInput } from '../common/CenteredAmountInput'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { BorrowLimitKPI } from '../kpi/Limit'
import { CreditScoreKPI } from '../kpi/Score'
import { BaseApyKPI } from '../kpi/BaseAPY'

type PullPanelProps = {
  isLoggedIn: boolean,
  loadingNetwork: boolean,
  onConnect: () => void,
  onPull: (amount: string) => void,
  maxPullLabel?: string // ej: "MAX PULL 0"
}

export function PullPanel({
  isLoggedIn,
  loadingNetwork,
  onConnect,
  onPull,
  maxPullLabel = 'MAX PULL: ',
}: PullPanelProps) {
  const [amount, setAmount] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) return onConnect()
    if (!amount) return
    onPull(amount)
  }

  const cta = !isLoggedIn && !loadingNetwork ? 'Connect Wallet' : 'Borrow now';
  
  let borrowed = 100;
  let borrowLimit = 1000;
  let toBorrow = borrowLimit - borrowed;
  return (
    <>
        <div className="grid grid-cols-4 gap-2 w-full mx-auto">
          <BaseApyKPI value="6.82%" />
          <BorrowLimitKPI value={`${borrowed}/${borrowLimit}`} />
          <CreditScoreKPI value="120/255" />
        </div>

        {/* Panel principal (monta el componente según tab) */}
        <Card className="p-4 border-2 border-border/50">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-muted-foreground font-mono">
              BORROW BANK-FREE
            </span>
          </div>
          <div className="mb-4">
            {/* form ahora ocupa todo el ancho */}
            <form onSubmit={submit} className="w-full">
              <CenteredAmountInput value={amount} onChange={setAmount} />
              <div className="mt-1 mb-4 text-xs text-muted-foreground text-center">
                {maxPullLabel}{toBorrow}{" USDC"}
              </div>

              {/* botón full width */}
              <Button
                type="submit"
                className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 cursor-pointer text-base font-semibold"
              >
                {cta}
              </Button>
            </form>
          </div>

          <div className="space-y-2 mb-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                TX Cost <InfoTip label="Estimated gas for this pull." variant="light" />
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
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {isExpanded && (
              <div className="mt-3 space-y-3">
                <div className="text-xs font-medium text-muted-foreground">CREDIT SCORE</div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-primary rounded-full" />
                    <span className="text-xs">Lendoor Score</span>
                    <Info className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <span className="text-xs">0/1000</span>
                </div>

                <div className="text-xs font-medium text-muted-foreground mt-3">ASSETS</div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">🔗</span>
                    <span className="text-xs">Onchain</span>
                    <InfoTip label="Verified on-chain assets used as backing." variant="light" />
                  </div>
                  <span className="text-xs">$0</span>
                </div>
              </div>
            )}
          </div>
        </Card>
        </>
  )
}
