'use client'

import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import UserJourneyBadge from '@/components/common/UserJourneyBadge'
import { useUserJourney } from '@/providers/UserJourneyProvider'

interface CreditMarketProps {
  setShowQR: (value: boolean) => void;
}

export function CreditMarket({ setShowQR }: CreditMarketProps) {
  const { ready } = useUserJourney()

  // TODO: replace with real auth / wallet logic
  const isLoggedIn = true
  const [loadingNetwork, setLoadingNetwork] = useState(false)

  // TODO: replace with real limits from your contract / backend
  const minLimit = 1
  const maxLimit = 3

  // amount used by the contract / slider
  const [amount, setAmount] = useState<number>(maxLimit)
  // raw string the user is typing
  const [amountInput, setAmountInput] = useState<string>(maxLimit.toString())

  // TODO: replace with real score data
  const score = 1
  const maxScore = 1000
  const progressToNextLevel = (score / maxScore) * 100

  // This is your on-chain "pull" handler
  const handlePull = (amt: string) => {
    console.log('Pull amount:', amt)
    // TODO: call your Aptos contract here
  }

  const handleRequestLoan = () => {
    if (!isLoggedIn) {
      // TODO: open auth / wallet connect flow
      setLoadingNetwork(true)
      return
    }

    handlePull(amount.toString())
    setShowQR(true) // if you want to show the QR after requesting
  }

  const handleSliderChange = (value: number) => {
    setAmount(value)
    setAmountInput(value.toString())
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAmountInput(value)

    const num = Number(value)
    if (Number.isNaN(num)) return

    if (num < minLimit) setAmount(minLimit)
    else if (num > maxLimit) setAmount(maxLimit)
    else setAmount(num)
  }

  const handleAmountBlur = () => {
    const num = Number(amountInput)
    if (Number.isNaN(num) || num < minLimit) {
      setAmount(minLimit)
      setAmountInput(minLimit.toString())
    } else if (num > maxLimit) {
      setAmount(maxLimit)
      setAmountInput(maxLimit.toString())
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex justify-center px-4 pb-6">
        <div className="w-full max-w-5xl mx-auto">
          {/* Top: header + main borrow card */}
          <div className="max-w-md mx-auto space-y-4">
            {/* Header */}
            <header className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">Lendoor</span>
                {ready && <UserJourneyBadge />}
              </div>

              {/* Podés reemplazar esto por estado real de wallet */}
              <button
                className="flex items-center gap-2 border rounded-full px-3 py-1 text-sm bg-white shadow-sm"
              >
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span>0.00 USDC</span>
              </button>
            </header>

            {/* MAIN CARD: How much do you want to borrow? */}
            <section className="bg-white rounded-3xl shadow-sm p-4 space-y-4">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>SCORE {score}/{maxScore}</span>
                <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-[11px]">
                  Aptos beta
                </span>
              </div>

              <div>
                <h1 className="text-xl font-semibold mb-1">
                  How much do you want to borrow?
                </h1>
                <p className="text-sm text-gray-500">
                  Your limit increases with every on-time payment. Choose the amount
                  with the slider or by typing it, then continue to see the rates.
                </p>
              </div>

              {/* Yellow card with centered, editable amount */}
              <div className="rounded-2xl bg-gradient-to-br from-[#FFF4D6] to-[#FFE9B5] p-4 flex flex-col items-center text-center">
                <p className="text-[11px] tracking-wide text-gray-600 mb-1">
                  AMOUNT TO BORROW
                </p>
                <div className="flex items-baseline gap-2">
                  <input
                    type="number"
                    className="bg-transparent text-3xl font-semibold text-[#6B3B00] w-24 text-center outline-none appearance-none"
                    value={amountInput}
                    onChange={handleAmountChange}
                    onBlur={handleAmountBlur}
                    min={minLimit}
                    max={maxLimit}
                  />
                  <span className="text-base font-medium text-[#6B3B00]">
                    USDC
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Available now according to your credit line.
                </p>
              </div>

              {/* Slider */}
              <div>
                <input
                  type="range"
                  min={minLimit}
                  max={maxLimit}
                  value={amount}
                  onChange={(e) => handleSliderChange(Number(e.target.value))}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>{minLimit} USDC</span>
                  <span>Current limit: {maxLimit.toFixed(2)} USDC</span>
                </div>
              </div>

              <button
              onClick={handleRequestLoan}
              className="w-full bg-[#F46A06] hover:bg-[#e35f02] text-white font-semibold py-3 rounded-2xl transition cursor-pointer"
            >
              Request Loan
            </button>
            </section>
          </div>

          {/* Bottom: only Lendoor Score card */}
          <div className="mt-4 max-w-md mx-auto">
            <section className="bg-white rounded-3xl shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs tracking-[0.25em] text-gray-500">
                  LENDOOR SCORE
                </h2>
                <span className="text-xs text-green-600 font-medium">Growing</span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold">{score}</span>
                <span className="text-sm text-gray-500">/ {maxScore}</span>
              </div>

              <p className="text-xs text-gray-500">
                Every positive action gives you points and improves your reputation.
              </p>

              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-2 rounded-full bg-orange-400"
                  style={{ width: `${progressToNextLevel}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs mt-2">
                <div className="py-2 rounded-2xl bg-gray-50">
                  <p className="text-[11px] text-gray-500 mb-1">Loans</p>
                  <p className="text-base font-semibold">0</p>
                </div>
                <div className="py-2 rounded-2xl bg-gray-50">
                  <p className="text-[11px] text-gray-500 mb-1">On time</p>
                  <p className="text-base font-semibold">0%</p>
                </div>
                <div className="py-2 rounded-2xl bg-gray-50">
                  <p className="text-[11px] text-gray-500 mb-1">Achievements</p>
                  <p className="text-base font-semibold">0</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
