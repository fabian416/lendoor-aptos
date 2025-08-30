'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { useIsLoggedIn, useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InfoTip } from '@/components/common/InfoTooltip'
import { PullPanel } from '@/components/borrow/PullPanel'
import { RepayPanel } from '@/components/borrow/RepayPanel'

type Tab = 'Pull' | 'Repay'

export function CreditMarket() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('Pull')
  const isLoggedIn = useIsLoggedIn()
  const { setShowAuthFlow, loadingNetwork } = useDynamicContext()

  // TODO: conecta con tus contratos
  const handlePull = (amt: string) => {
    console.log('Pull amount:', amt)
  }
  const handleRepay = (amt: string) => {
    console.log('Repay amount:', amt)
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="w-full max-w-md mx-auto space-y-3 px-4">
        {/* Header Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {(['Pull', 'Repay'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === tab
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground cursor-pointer'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          {!isLoggedIn && !loadingNetwork && (
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm px-4 py-2 cursor-pointer"
              onClick={() => setShowAuthFlow(true)}
            >
              Connect Wallet
            </Button>
          )}
        </div>

        {activeTab === 'Pull' ? (
            <PullPanel
              isLoggedIn={!!isLoggedIn}
              loadingNetwork={loadingNetwork}
              onConnect={() => setShowAuthFlow(true)}
              onPull={(amt) => handlePull(amt)}
            />
          ) : (
            <RepayPanel
              isLoggedIn={!!isLoggedIn}
              loadingNetwork={loadingNetwork}
              onConnect={() => setShowAuthFlow(true)}
              onRepay={(amt) => handleRepay(amt)}
            />
          )}
      </div>
    </TooltipProvider>
  )
}
