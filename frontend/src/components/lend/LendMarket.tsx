'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SupplyPanel } from '@/components/lend/SupplyPanelUSDC'
import { SupplyPanelSUSDC } from './SupplyPanelSUDC'
import { WithdrawsUSDCPanel } from '@/components/lend/WithdrawsUSDCPanel'
import { WithdrawjUSDCPanel } from './WithdrawjUSDCPanel'
import UserJourneyBadge from '../common/UserJourneyBadge'
import { useUserJourney } from '../providers/UserProvider'

type Tab = 'Supply USDC' | 'Supply sUSDC' | 'Withdraw sUSDC' | 'Withdraw jUSDC'

export function LendMarket() {
  const [activeTab, setActiveTab] = useState<Tab>('Supply USDC')
  const { connected, isLoading } = useWallet();
  const isLoggedIn = connected;
  const loadingNetwork = isLoading;
  const openConnect = () => {
    // Aquí podrías disparar tu modal de WalletSelector si expones un trigger global.
    // Por ahora, dejamos un log no intrusivo.
    console.log('Open wallet selector');
  };
  const { ready, value } = useUserJourney();

  // TODO: conectá con tus contracts
  const handleSupply = (amt: string) => console.log('Supply amount:', amt)
  const handleWithdraw = (amt: string) => console.log('Withdraw amount:', amt)

  return (
    <TooltipProvider delayDuration={150}>
      <div className="w-full max-w-md mx-auto space-y-3 px-4">
        {/* Header Tabs */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {(['Supply USDC','Supply sUSDC', 'Withdraw sUSDC', 'Withdraw jUSDC'] as Tab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === tab
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground cursor-pointer'
                  }`}
                >

                  {ready && value == "supply_liquidity" && activeTab != tab && tab == "Supply USDC" && <UserJourneyBadge />}
                  {ready && value == "withdraw_susdc" && activeTab != tab && tab == "Withdraw sUSDC" && <UserJourneyBadge />}
                  {ready && value == "withdraw_jusdc" && activeTab != tab && tab == "Withdraw jUSDC" && <UserJourneyBadge />}
                  &nbsp;&nbsp;
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === 'Supply USDC' ? (
          <SupplyPanel
            isLoggedIn={!!isLoggedIn}
            loadingNetwork={loadingNetwork}
            onConnect={openConnect}
            onSupply={handleSupply}
          />
        ) : activeTab === 'Supply sUSDC' ? (
          <SupplyPanelSUSDC
            isLoggedIn={!!isLoggedIn}
            loadingNetwork={loadingNetwork}
            onConnect={openConnect}
            onSupply={handleSupply}
          />
        ) : activeTab === 'Withdraw sUSDC' ? (
          <WithdrawsUSDCPanel
            isLoggedIn={!!isLoggedIn}
            loadingNetwork={loadingNetwork}
            onConnect={openConnect}
            onWithdraw={handleWithdraw}
          />
        ) :
          <WithdrawjUSDCPanel
            isLoggedIn={!!isLoggedIn}
            loadingNetwork={loadingNetwork}
            onConnect={openConnect}
            onWithdraw={handleWithdraw}
          />
      }
      </div>
    </TooltipProvider>
  )
}
