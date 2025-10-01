'use client'

import { useState } from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PullPanel } from '@/components/borrow/PullPanel'
import { RepayPanel } from '@/components/borrow/RepayPanel'
import UserJourneyBadge from '@/components/common/UserJourneyBadge'
import { useUserJourney } from '@/providers/UserProvider'
import { toast } from 'sonner';

type Tab = 'Pull' | 'Repay'

export function CreditMarket({setShowQR}: any) {
  const [activeTab, setActiveTab] = useState<Tab>('Pull')
  const { connected: isLoggedIn, isLoading: loadingNetwork } = useWallet();
  const { ready, value, is_only_borrow } = useUserJourney();

  // Trigger global WalletSelector dialog (handled in WalletSelector via window event listener)
  const openConnect = () => {
    try {
      window.dispatchEvent(new Event('open-wallet-selector'))
    } catch {
      toast.error('Could not open the wallet selector. Please try again.');
    }
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
                  {ready && is_only_borrow && activeTab != tab && tab == "Pull" && <UserJourneyBadge />}
                  {ready && value == "repay" && activeTab != tab && tab == "Repay" && <UserJourneyBadge />}
                  &nbsp;&nbsp;
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === 'Pull' ? (
            <PullPanel
              isLoggedIn={!!isLoggedIn}
              loadingNetwork={loadingNetwork}
              onConnect={openConnect}
              setShowQR={setShowQR}
            />
          ) : (
            <RepayPanel
              isLoggedIn={!!isLoggedIn}
              loadingNetwork={loadingNetwork}
              onConnect={openConnect}
            />
          )}
      </div>
    </TooltipProvider>
  )
}
