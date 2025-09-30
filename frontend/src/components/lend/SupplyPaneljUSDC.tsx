'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { InfoTip } from '@/components/common/InfoTooltip'
import { CenteredAmountInput } from '@/components/common/CenteredAmountInput'
import { JrApyKPI } from '@/components/kpi/JrAPY'
import { BackingTVVKPI } from '@/components/kpi/BackingTVV'
import { JusdcBalanceKPI } from '@/components/kpi/jUSDCBalance'
import UserJourneyBadge from '@/components/common/UserJourneyBadge'
import { useUserJourney } from '@/providers/UserProvider'
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

export function SupplyPanelSUSDC({
  isLoggedIn,
  loadingNetwork,
  onConnect,
  supplyCapLabel = 'SUPPLY CAP $10.000',
}: SupplyPanelProps) {
  const [amount, setAmount] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const { ready, value } = useUserJourney()
  const [submitting, setSubmitting] = useState(false)
  const [jBalance, setJBalance] = useState('0')

  const { account } = useWallet()
  const connectedAddress = account?.address
  const { callView, entry } = useMoveModule()

  // Submit junior supply:
  // 1) controller::mint<Coin>(amount_u64)  → user receives LP<Coin>
  // 2) junior::deposit<Coin>(lp_amount)    → user receives jUSDC (S<Coin>)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) return onConnect()
    if (!amount || !connectedAddress) return

    setSubmitting(true)
    try {
      const amountU64 = parseUnitsAptos(amount, USDC_DECIMALS)

      // (Optional, only once) ensure user registered. Ignore failure if already registered.
      try {
        const name = new TextEncoder().encode('main')
        await entry(fq('controller', 'register_user'), [], [name], { checkSuccess: true })
      } catch (_) {}

      // Step 1: Mint LP from underlying (USDC)
      await entry(
        fq('controller', 'mint'),
        [USDC_TYPE],
        [amountU64.toString()],
        { checkSuccess: true }
      )

      // Compute how many LP were minted for this underlying amount
      const [lpAmountStr] = await callView<[string]>(
        fq('reserve', 'lp_from_underlying'),
        [USDC_TYPE],
        [amountU64.toString()]
      )
      const lpAmount = BigInt(lpAmountStr)

      // Step 2: Deposit those LP into Junior vault → receive jUSDC
      if (lpAmount > 0n) {
        await entry(
          fq('junior', 'deposit'),
          [USDC_TYPE],
          [lpAmount.toString()],
          { checkSuccess: true }
        )
      }

      await refreshJBalance()
    } catch (err) {
      console.error('junior supply error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // Read jUSDC balance via view helper
  const refreshJBalance = async () => {
    if (!connectedAddress) return
    try {
      const [rawStr] = await callView<[string]>(
        fq('reserve', 'junior_balance'),
        [USDC_TYPE],
        [connectedAddress]
      )
      const next = formatUnitsAptos(BigInt(rawStr), USDC_DECIMALS)
      setJBalance(prev => (prev === next ? prev : next))
    } catch (e) {
      console.error('read junior_balance:', e)
    }
  }

  useEffect(() => {
    if (!connectedAddress) return
    refreshJBalance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, submitting])

  const cta = !isLoggedIn && !loadingNetwork ? 'Connect Wallet' : 'Supply Liquidity'

  return (
    <>
      <div className="grid grid-cols-4 gap-2 w-full mx-auto">
        <JrApyKPI value="20%" />
        <BackingTVVKPI value="10.4M" />
        <JusdcBalanceKPI value={jBalance} />
      </div>

      <Card className="p-4 border-2 border-border/50">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground font-mono">EARN BY LENDING (Junior)</span>
        </div>

        <form onSubmit={submit} className="w-full">
          <CenteredAmountInput value={amount} onChange={setAmount} symbol="¢" />
          <div className="mt-1 mb-4 text-xs text-muted-foreground text-center">
            {supplyCapLabel}
          </div>

          <Button
            type="submit"
            disabled={!amount || submitting}
            className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 cursor-pointer text-base font-semibold"
          >
            {ready && value === 'supply_liquidity' && <UserJourneyBadge />}
            {cta}
          </Button>
        </form>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              TX Cost <InfoTip label="Estimated gas for supplying (mint + junior deposit)." variant="light" />
            </span>
            <span className="text-xs">-</span>
          </div>
        </div>

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
                  <span className="text-xs">USDC → LP → jUSDC</span>
                  <Info className="w-3 h-3 text-muted-foreground" />
                </div>
                <span className="text-xs">Junior tranche (first-loss)</span>
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  )
}
