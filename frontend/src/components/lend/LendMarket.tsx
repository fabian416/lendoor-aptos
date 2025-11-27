'use client'

import { useCallback, useState, type ChangeEvent } from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import UserJourneyBadge from '@/components/common/UserJourneyBadge'
import { useUserJourney } from '@/providers/UserJourneyProvider'

type Mode = 'deposit' | 'withdraw'

export function LendMarket() {
  const { ready } = useUserJourney()
  const { account, connected, connect, wallets } = useWallet()

  const isLoggedIn = !!account?.address
  const [loadingNetwork, setLoadingNetwork] = useState(false)
  const [mode, setMode] = useState<Mode>('deposit')

  // ---- Mock data (luego lo reemplazás con datos reales) ----
  const userShares = 0
  const userSharesUsd = 0
  const sharePrice = 1.03
  const totalAssets = 1_988_744
  const supplyCap = 10_000

  const activity = [
    { type: 'Deposit', timeAgo: '4 hours ago', hash: '0x5f2d...04c8', amount: 124.88 },
    { type: 'Deposit', timeAgo: '1 hour ago', hash: '0x2f37...08d3', amount: 10.0 },
  ]
  // ----------------------------------------------------------

  const [amount, setAmount] = useState<number>(0)
  const [amountInput, setAmountInput] = useState<string>('0.00')

  const handleConnect = useCallback(async () => {
    if (connected) return
    try {
      const first = wallets?.[0]
      if (first) {
        await connect(first.name)
      }
    } catch (e) {
      console.error('Wallet connect error:', e)
    }
  }, [connected, wallets, connect])

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAmountInput(value)

    if (value === '') return
    const num = Number(value)
    if (Number.isNaN(num) || num < 0) return

    setAmount(num)
  }

  const handleAmountBlur = () => {
    const num = Number(amountInput)
    if (Number.isNaN(num) || num < 0) {
      setAmount(0)
      setAmountInput('0.00')
    } else {
      setAmount(num)
      setAmountInput(num.toString())
    }
  }

  const handleAction = async () => {
    if (!isLoggedIn) {
      setLoadingNetwork(true)
      await handleConnect()
      setLoadingNetwork(false)
      return
    }
    if (amount <= 0) return

    if (mode === 'deposit') {
      console.log('Deposit amount:', amount, 'USDC')
      // TODO: deposit en el contrato
    } else {
      console.log('Withdraw amount:', amount, 'USDC')
      // TODO: withdraw en el contrato
    }
  }

  const primaryLabel = mode === 'deposit' ? 'Deposit USDC' : 'Withdraw USDC'

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex justify-center px-4 pb-6">
        <div className="w-full max-w-5xl mx-auto">
          {/* === COLUMNA CENTRAL, MISMO ANCHO QUE BORROW === */}
          <div className="max-w-md mx-auto space-y-4">
            {/* Header (igual que en Borrow) */}
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">Lendoor</span>
                {ready && <UserJourneyBadge />}
              </div>

              <button
                onClick={!isLoggedIn ? handleConnect : undefined}
                className="flex items-center gap-2 border rounded-full px-3 py-1 text-sm bg-white shadow-sm cursor-pointer"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span>{isLoggedIn ? '0.00 USDC' : 'Connect wallet'}</span>
              </button>
            </header>

            {/* Stats arriba: 2 cards en grid dentro del mismo ancho */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Your shares */}
              <div className="bg-white rounded-3xl shadow-sm p-4 space-y-1">
                <p className="text-xs text-gray-500">Your shares</p>
                <p className="text-2xl font-semibold">
                  ${userSharesUsd.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">{userShares} shares</p>
              </div>

              {/* Total assets */}
              <div className="bg-white rounded-3xl shadow-sm p-4 space-y-1">
                <p className="text-xs text-gray-500">Total assets</p>
                <p className="text-2xl font-semibold">
                  ${totalAssets.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">
                  ${sharePrice.toFixed(3)} share price
                </p>
              </div>
            </div>

            {/* Manage shares */}
            <section className="bg-white rounded-3xl shadow-sm p-4 space-y-4">
              <h2 className="text-sm font-medium mb-1">Manage shares</h2>

              {/* Tabs */}
              <div className="inline-flex rounded-full bg-gray-100 p-1 text-xs">
                <button
                  onClick={() => setMode('deposit')}
                  className={`px-3 py-1 rounded-full cursor-pointer ${
                    mode === 'deposit'
                      ? 'bg-white shadow-sm font-medium'
                      : 'text-gray-500'
                  }`}
                >
                  Deposit
                </button>
                <button
                  onClick={() => setMode('withdraw')}
                  className={`px-3 py-1 rounded-full cursor-pointer ${
                    mode === 'withdraw'
                      ? 'bg-white shadow-sm font-medium'
                      : 'text-gray-500'
                  }`}
                >
                  Withdraw
                </button>
              </div>

              {/* Amount input */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Amount</span>
                  <span>Balance: 0 USDC</span>
                </div>
                <div className="flex items-center gap-2 border border-gray-200 rounded-2xl px-3 py-2 bg-gray-50">
                  <input
                    type="number"
                    className="flex-1 bg-transparent outline-none text-base"
                    value={amountInput}
                    onChange={handleAmountChange}
                    onBlur={handleAmountBlur}
                    min={0}
                    placeholder="0.00"
                  />
                  <span className="text-xs font-medium text-gray-600">
                    USDC
                  </span>
                </div>
              </div>

              {/* Button */}
              <button
                onClick={handleAction}
                disabled={loadingNetwork}
                className="w-full bg-[#F46A06] hover:bg-[#e35f02] disabled:opacity-60 text-white font-semibold py-3 rounded-2xl transition cursor-pointer"
              >
                {loadingNetwork ? 'Processing…' : primaryLabel}
              </button>

              <p className="text-[11px] text-gray-500">
                Supply cap ${supplyCap.toLocaleString()}. Liquidity is
                withdrawable anytime, subject to pool balance.
              </p>
            </section>

            {/* Vault activity (mismo ancho, debajo) */}
            <section className="bg-white rounded-3xl shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Vault activity</h3>
                <div className="flex gap-2 text-xs text-gray-500">
                  <button className="font-medium text-gray-900">
                    All activity
                  </button>
                  <button>Your activity</button>
                </div>
              </div>

              <div className="divide-y divide-gray-100">
                {activity.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.type}</p>
                      <p className="text-xs text-gray-500">
                        {item.timeAgo} · {item.hash}
                      </p>
                    </div>
                    <div className="font-semibold">
                      ${item.amount.toFixed(2)}{' '}
                      <span className="text-xs">USDC</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
