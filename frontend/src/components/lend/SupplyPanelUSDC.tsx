'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { InfoTip } from '@/components/common/InfoTooltip'
import { CenteredAmountInput } from '@/components/common/CenteredAmountInput'
import { BackingTVVKPI } from '@/components/kpi/BackingTVV'
import { SrApyKPI } from '@/components/kpi/SrAPY'
import UserJourneyBadge from '@/components/common/UserJourneyBadge'
import { useUserJourney } from '@/providers/UserProvider'
import { SusdcBalanceKPI } from '@/components/kpi/sUSDCBalance'
import { useMoveModule } from '@/providers/MoveModuleProvider'
import { USDC_TYPE, USDC_DECIMALS } from '@/lib/constants'
import { parseUnitsAptos, formatUnitsAptos, fq } from '@/lib/utils'
import { useWallet } from '@aptos-labs/wallet-adapter-react'


type SupplyPanelProps = {
  isLoggedIn: boolean
  loadingNetwork: boolean
  onConnect: () => void
  supplyCapLabel?: string
}

export function SupplyPanel({
  isLoggedIn,
  loadingNetwork,
  onConnect,
  supplyCapLabel = 'SUPPLY CAP $10.000',
}: SupplyPanelProps) {
  const [amount, setAmount] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const { ready, value } = useUserJourney()
  const [submitting, setSubmitting] = useState(false)
  const [balance, setBalance] = useState("0")

  const { account } = useWallet()
  const connectedAddress = account?.address
  const { callView, entry } = useMoveModule()

  // Submit deposit:
  // NOTE (English): On Aptos there is no ERC-20 approve. You call the Move entry function directly.
  // We must:
  //  1) ensure the user is registered (controller::register_user) once,
  //  2) call controller::deposit<Coin>(profile_name: vector<u8>, amount: u64, repay_only: bool)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) return onConnect();
    if (!amount || !connectedAddress) return;

    setSubmitting(true);
    try {

      // Deposit to the user's default profile ("main")
      const amountU64 = parseUnitsAptos(amount, USDC_DECIMALS);
      const profileName = new TextEncoder().encode('main'); // vector<u8>

      await entry(
        fq('controller', 'deposit'),
        [USDC_TYPE],
        [
          profileName,               // vector<u8> profile_name
          amountU64.toString(),      // u64 amount
          false                      // bool repay_only
        ],
        { checkSuccess: true }
      );

      await refreshBalance();
    } catch (err) {
      console.error("deposit error:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Read deposited balance (underlying):
  // NOTE (English): There is no `balance_of` in your contracts.
  // Use the view profile::profile_deposit<Coin>(user) -> (collateral_lp_amount, underlying_amount).
  const refreshBalance = async () => {
    if (!connectedAddress) return
    try {
      const [lp, underlying] = await callView<[string, string]>(
        fq('profile', 'profile_deposit'),
        [USDC_TYPE],
        [connectedAddress]
      );
      // `underlying` is u64 as string (Move view returns), so we format to decimals
      const next = formatUnitsAptos(BigInt(underlying), USDC_DECIMALS)
      setBalance(prev => (prev === next ? prev : next))
    } catch (e) {
      console.error('read profile_deposit:', e)
    }
  }

  // Refresh on connect and after submit
  useEffect(() => {
    if (!connectedAddress) return
    refreshBalance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, submitting])

  const cta = !isLoggedIn && !loadingNetwork ? 'Connect Wallet' : 'Supply Liquidity'
  const isDisabled = !amount || submitting;
  const showBadge = ready && (value === "deposit_usdc");

  return (
    <>
      {/* Lend KPIs */}
      <div className="grid grid-cols-4 gap-2 w-full mx-auto">
        <SrApyKPI value="10%" />
        <BackingTVVKPI value="10.4M" />
        <SusdcBalanceKPI value={balance} />
      </div>

      <Card className="p-4 border-2 border-border/50">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground font-mono">EARN BY LENDING</span>
        </div>

        <form onSubmit={submit} className="w-full">
          {/* Amount input */}
          <CenteredAmountInput value={amount} onChange={setAmount} symbol='¢' showBadge={showBadge && !amount} />

          <div className="mt-1 mb-4 text-xs text-muted-foreground text-center">
            {supplyCapLabel}
          </div>

          {/* Primary action */}
          <Button
            type="submit"
            disabled={isDisabled}
            className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 cursor-pointer text-base font-semibold"
          >
            {!!amount && showBadge && <UserJourneyBadge/>}
            {cta}
          </Button>
        </form>

        {/* Gas/Cost row (placeholder) */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              TX Cost <InfoTip label="Estimated gas for supplying." variant="light" />
            </span>
            <span className="text-xs">-</span>
          </div>
        </div>

        {/* Collapsible info */}
        <div className="border-top border-border pt-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full text-left cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-muted rounded flex items-center justify-center">
                <span className="text-xs">💧</span>
              </div>
              <span className="text-sm font-medium">Liquidity Info</span>
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-3">
              <div className="text-xs font-medium text-muted-foreground">ASSETS</div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs">USDC / sUSDC</span>
                  <Info className="w-3 h-3 text-muted-foreground" />
                </div>
                <span className="text-xs">Pool-backed</span>
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  )
}
