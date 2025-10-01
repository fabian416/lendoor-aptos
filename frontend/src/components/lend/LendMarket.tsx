'use client'

import { useState } from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SupplyPanelUSDC } from '@/components/lend/SupplyPanelUSDC'
import { SupplyPanelSUSDC } from '@/components/lend/SupplyPanelSUSDC'
import { WithdrawUSDCPanel } from '@/components/lend/WithdrawUSDCPanel'
import { WithdrawSUSDCPanel } from '@/components/lend/WithdrawSUSDCPanel'
import UserJourneyBadge from '@/components/common/UserJourneyBadge'
import { useUserJourney } from '@/providers/UserProvider'
import { toast } from 'sonner';

type Tab = 'Supply USDC' | 'Supply sUSDC' | 'Withdraw USDC' | 'Withdraw sUSDC'

export function LendMarket() {
  const [activeTab, setActiveTab] = useState<Tab>('Supply USDC')
  const { connected: isLoggedIn, isLoading: loadingNetwork } = useWallet();
  const { ready, value } = useUserJourney();

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
              {(['Supply USDC','Supply sUSDC', 'Withdraw USDC', 'Withdraw sUSDC'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === tab
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground cursor-pointer'
                  }`}
                >

                  {ready && value == "deposit_usdc" && activeTab != tab && tab == "Supply USDC" && <UserJourneyBadge />}
                  {ready && value == "deposit_susdc" && activeTab != tab && tab == "Supply sUSDC" && <UserJourneyBadge />}
                  {ready && value == "withdraw_usdc" && activeTab != tab && tab == "Withdraw USDC" && <UserJourneyBadge />}
                  {ready && value == "withdraw_susdc" && activeTab != tab && tab == "Withdraw sUSDC" && <UserJourneyBadge />}
                  &nbsp;&nbsp;
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === 'Supply USDC' ? (
          <SupplyPanelUSDC
            isLoggedIn={!!isLoggedIn}
            loadingNetwork={loadingNetwork}
            onConnect={openConnect}
          />
        ) : activeTab === 'Supply sUSDC' ? (
          <SupplyPanelSUSDC
            isLoggedIn={!!isLoggedIn}
            loadingNetwork={loadingNetwork}
            onConnect={openConnect}
          />
        ) : activeTab === 'Withdraw USDC' ? (
          <WithdrawUSDCPanel
            isLoggedIn={!!isLoggedIn}
            loadingNetwork={loadingNetwork}
            onConnect={openConnect}
          />
        ) :
          <WithdrawSUSDCPanel
            isLoggedIn={!!isLoggedIn}
            loadingNetwork={loadingNetwork}
            onConnect={openConnect}
          />
      }
      </div>
    </TooltipProvider>
  )
}
