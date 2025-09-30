'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { InfoTip } from '@/components/common/InfoTooltip'
import { CenteredAmountInput } from '@/components/common/CenteredAmountInput'
import { BackingTVVKPI } from '@/components/kpi/BackingTVV'
import { SrApyKPI } from '@/components/kpi/SrAPY'
import UserJourneyBadge from '../common/UserJourneyBadge'
import { useUserJourney } from '../providers/UserProvider'
import { SusdcBalanceKPI } from '../kpi/sUSDCBalance'
import { useMoveModule } from '@/components/providers/MoveModuleProvider'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { LENDOOR_CONTRACT } from '@/lib/constants' // <-- package addr to build fully-qualified names

// Coin type & decimals (UI)
const USDC_TYPE = (import.meta.env.VITE_USDC_TYPE as string) || '0x1::aptos_coin::AptosCoin'
const USDC_DECIMALS = Number(import.meta.env.VITE_USDC_DECIMALS ?? 6)

// Simple unit helpers for Aptos (u64-compatible)
function parseUnitsAptos(amountStr: string, decimals: number): bigint {
  const [int, frac = ""] = amountStr.split(".");
  const base = (10n ** BigInt(decimals));
  const cleanFrac = (frac + "0".repeat(decimals)).slice(0, decimals);
  return (BigInt(int || "0") * base) + BigInt(cleanFrac || "0");
}
function formatUnitsAptos(v: bigint | string, decimals: number): string {
  const n = BigInt(typeof v === "string" ? v : v)
  const base = BigInt(10 ** decimals)
  const i = n / base
  const f = (n % base).toString().padStart(decimals, "0").replace(/0+$/, "")
  return f.length ? `${i}.${f}` : i.toString()
}

type SupplyPanelProps = {
  isLoggedIn: boolean
  loadingNetwork: boolean
  onConnect: () => void
  onSupply: (amount: string) => void
  supplyCapLabel?: string
}

export function SupplyPanel({
  isLoggedIn,
  loadingNetwork,
  onConnect,
  onSupply,
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

  // --- Helpers for fully-qualified view/entry calls ---
  // We build the function string as `${addr}::module::fn` to match the Aptos SDK template type.
  const fq = (moduleName: string, fn: string) =>
    `${LENDOOR_CONTRACT}::${moduleName}::${fn}`

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
      // 1) If user isn't registered, register with a default profile name (e.g. "main")
      const [isReg] = await callView<[boolean]>(
        fq('profile', 'is_registered'),
        [],
        [connectedAddress]
      );
      if (!isReg) {
        const profileName = new TextEncoder().encode('main'); // vector<u8>
        await entry(
          fq('controller', 'register_user'),
          [],
          [profileName]
        );
      }

      // 2) Deposit to the user's default profile ("main")
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

      onSupply(amount);
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
          <CenteredAmountInput value={amount} onChange={setAmount} symbol='¢' />

          <div className="mt-1 mb-4 text-xs text-muted-foreground text-center">
            {supplyCapLabel}
          </div>

          {/* Primary action */}
          <Button
            type="submit"
            disabled={!amount || submitting}
            className="mt-3 w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 cursor-pointer text-base font-semibold"
          >
            {ready && (value === "supply_liquidity") && <UserJourneyBadge/>}
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
