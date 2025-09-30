'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { InfoTip } from '@/components/common/InfoTooltip'
import { CenteredAmountInput } from '@/components/common/CenteredAmountInput'
import { AvailableToWithdrawKPI } from '@/components/kpi/AvailableToWithdraw'
import { SusdcBalanceKPI } from '@/components/kpi/sUSDCBalance'
import { ExchangeRateKPI } from '@/components/kpi/ExchangeRatesUSDC'
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
  availableLabel?: string // e.g. "AVAILABLE: $"
}

export function WithdrawsUSDCPanel({
  isLoggedIn,
  loadingNetwork,
  onConnect,
  availableLabel = 'AVAILABLE: $',
}: WithdrawPanelProps) {
  const [amount, setAmount] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const { ready, value } = useUserJourney()
  const [submitting, setSubmitting] = useState(false)
  const [underlyingBalance, setUnderlyingBalance] = useState("0") // user's deposited underlying (USDC) in profile
  const [poolNotReady, setPoolNotReady] = useState<string | null>(null)

  const { account } = useWallet()
  const connectedAddress = account?.address
  const { callView, entry } = useMoveModule()

  // Submit withdraw:
  // controller::withdraw<Coin>(profile_name: vector<u8>, amount: u64, allow_borrow: bool)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLoggedIn) return onConnect()
    if (!amount || !connectedAddress) return
    if (poolNotReady) return

    setSubmitting(true)
    try {
      // IMPORTANT: do *not* allow borrow for a vanilla withdraw UI
      const allowBorrow = false
      const profileName = new TextEncoder().encode('main') // vector<u8>
      const amountU64 = parseUnitsAptos(amount, USDC_DECIMALS)

      // Optional guard: do not let user withdraw more than available underlying
      const availableU64 = parseUnitsAptos(underlyingBalance || "0", USDC_DECIMALS)
      if (amountU64 > availableU64) {
        throw new Error('Amount exceeds available deposited balance')
      }

      await entry(
        fq('controller', 'withdraw'),
        [USDC_TYPE],
        [
          profileName,               // vector<u8>
          amountU64.toString(),      // u64
          allowBorrow                // bool
        ],
        { checkSuccess: true }
      )

      await refresh()
      setAmount('')
    } catch (err) {
      console.error('withdraw error:', err)
    } finally {
      setSubmitting(false)
    }
  }

  // Read user's deposited underlying using profile::profile_deposit<Coin>(user)
  // Returns (collateral_lp_amount, underlying_amount)
  const refresh = async () => {
    if (!connectedAddress) return
    setPoolNotReady(null)
    try {
      // Soft probe: ensure reserve exists (if not, mark pool not ready)
      try {
        await callView(fq('reserve', 'reserve_state'), [USDC_TYPE], [])
      } catch (e: any) {
        // If reserve not initialized yet, avoid spamming errors in UI
        setPoolNotReady('Pool not initialized on-chain yet.')
        setUnderlyingBalance(prev => (prev === "0" ? prev : "0"))
        return
      }

      // Guard: profile must exist, otherwise profile_deposit will abort
      const [isReg] = await callView<[boolean]>(
        fq('profile', 'is_registered'),
        [],
        [connectedAddress]
      )
      if (!isReg) {
        setUnderlyingBalance(prev => (prev === "0" ? prev : "0"))
        return
      }

      const [lpStr, underlyingStr] = await callView<[string, string]>(
        fq('profile', 'profile_deposit'),
        [USDC_TYPE],
        [connectedAddress]
      )
      const next = formatUnitsAptos(BigInt(underlyingStr), USDC_DECIMALS)
      setUnderlyingBalance(prev => (prev === next ? prev : next))
    } catch (e) {
      console.error('read profile_deposit:', e)
    }
  }

  useEffect(() => {
    if (!connectedAddress) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, submitting])

  const cta = !isLoggedIn && !loadingNetwork ? 'Connect Wallet' : 'Withdraw Liquidity'
  const availableLabelValue = underlyingBalance

  // Disable withdraw if amount empty, submitting, or pool not ready
  const disableBtn = !amount || submitting || !!poolNotReady

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2 w-full mx-auto">
        <SusdcBalanceKPI value={underlyingBalance} />
        <AvailableToWithdrawKPI value={`${availableLabelValue} USDC`} />
        {/* No on-chain exchange-rate view in prod; keep a placeholder or remove */}
        <ExchangeRateKPI value="—" />
      </div>

      <Card className="p-4 border-2 border-border/50">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground font-mono">MANAGE LIQUIDITY</span>
        </div>

        {poolNotReady && (
          <div className="mb-3 rounded-md border p-2 text-xs text-amber-600 bg-amber-50">
            {poolNotReady}
          </div>
        )}

        <form onSubmit={submit} className="w-full">
          <CenteredAmountInput value={amount} onChange={setAmount} symbol='¢' />

          <div className="mt-1 mb-4 text-xs text-muted-foreground text-center">
            {availableLabel}{availableLabelValue}
          </div>

          <Button
            type="submit"
            disabled={disableBtn}
            className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 cursor-pointer text-base font-semibold disabled:opacity-60"
          >
            {ready && (value === "withdraw_susdc") && <UserJourneyBadge/>}
            {cta}
          </Button>
        </form>

        {/* Gas/Cost row (placeholder) */}
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
                Real-time liquidity depends on market reserves; junior tranches may apply specific rules.
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  )
}
