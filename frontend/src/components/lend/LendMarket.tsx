'use client'

import { useCallback, useMemo, useState } from "react"
import { useWallet } from "@aptos-labs/wallet-adapter-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import { SupplyPanelUSDC } from "@/components/lend/SupplyPanelUSDC"
import { WithdrawUSDCPanel } from "@/components/lend/WithdrawUSDCPanel"
import { useMockSeniorStats } from "@/hooks/useMockSeniorStats"

// hook real on-chain
import { useSeniorAvailableToWithdraw } from "@/hooks/senior/useSeniorAvailableToWithdraw"

type Mode = "deposit" | "withdraw"

export function LendMarket() {
  const { account, connected, connect, wallets } = useWallet()
  const isLoggedIn = !!account?.address

  const [mode, setMode] = useState<Mode>("deposit")
  const [loadingNetwork, setLoadingNetwork] = useState(false)

  // ✅ IMPORTANTE: address string
  const address = useMemo(() => {
    try {
      return account?.address?.toString()
    } catch {
      return undefined
    }
  }, [account?.address])

  // ✅ mock reactivo
  const {
    shares,
    pps,
    totalAssets,
    userSharesUsd,
    onMockDeposit,
    onMockWithdraw,
  } = useMockSeniorStats(address)

  // ✅ available real
  const handleConnect = useCallback(async () => {
    if (connected) return
    try {
      const first = wallets?.[0]
      if (first) await connect(first.name)
    } catch (e) {
      console.error("Wallet connect error:", e)
    }
  }, [connected, wallets, connect])

  // ✅ Estos handlers son los que hacen vivir el mock
  const handleSupply = useCallback((amt: string) => {
    const n = Number(amt)
    if (Number.isFinite(n)) onMockDeposit(n)
  }, [onMockDeposit])

  const handleWithdraw = useCallback((amt: string) => {
    const n = Number(amt)
    if (Number.isFinite(n)) onMockWithdraw(n)
  }, [onMockWithdraw])

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex justify-center px-4 pb-6">
        <div className="w-full max-w-5xl mx-auto">
          <div className="max-w-md mx-auto space-y-4">

            {/* Cards arriba mock */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="bg-white rounded-3xl shadow-sm p-4 space-y-1">
                <p className="text-xs text-gray-500">Your shares</p>
                <p className="text-2xl font-semibold">
                  ${userSharesUsd.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">
                  {shares.toFixed(4)} shares
                </p>
              </div>

              <div className="bg-white rounded-3xl shadow-sm p-4 space-y-1">
                <p className="text-xs text-gray-500">Total assets</p>
                <p className="text-2xl font-semibold">
                  ${totalAssets.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">
                  ${pps.toFixed(6)} share price
                </p>
              </div>
            </div>

            {/* Manage shares */}
            <section className="bg-white rounded-3xl shadow-sm p-4 space-y-4">
              <h2 className="text-sm font-medium mb-1">Manage shares</h2>

              <div className="inline-flex rounded-full bg-gray-100 p-1 text-xs">
                <button
                  onClick={() => setMode("deposit")}
                  className={`px-3 py-1 rounded-full cursor-pointer ${
                    mode === "deposit"
                      ? "bg-white shadow-sm font-medium"
                      : "text-gray-500"
                  }`}
                >
                  Deposit
                </button>
                <button
                  onClick={() => setMode("withdraw")}
                  className={`px-3 py-1 rounded-full cursor-pointer ${
                    mode === "withdraw"
                      ? "bg-white shadow-sm font-medium"
                      : "text-gray-500"
                  }`}
                >
                  Withdraw
                </button>
              </div>

              {/* ✅ Cuadrito bonito de Available real (solo en withdraw) */}

              {/* Panels reales */}
              {mode === "deposit" ? (
                <SupplyPanelUSDC
                  isLoggedIn={isLoggedIn}
                  loadingNetwork={loadingNetwork}
                  onConnect={async () => {
                    setLoadingNetwork(true)
                    await handleConnect()
                    setLoadingNetwork(false)
                  }}
                  onSupply={handleSupply} // ✅ CLAVE
                />
              ) : (
                <WithdrawUSDCPanel
                  isLoggedIn={isLoggedIn}
                  loadingNetwork={loadingNetwork}
                  onConnect={async () => {
                    setLoadingNetwork(true)
                    await handleConnect()
                    setLoadingNetwork(false)
                  }}
                  onWithdraw={handleWithdraw} // ✅ CLAVE
                />
              )}

              <p className="text-[11px] text-gray-500">
                Supply cap $10,000. Liquidity is withdrawable anytime, subject to
                pool balance.
              </p>
            </section>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}