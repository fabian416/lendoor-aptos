'use client'

import * as React from 'react'

import { useCreditLine } from '@/hooks/borrow/useCreditLine'
import { useBorrow } from '@/hooks/borrow/useBorrow'
import { useSeniorExchangeRate } from '@/hooks/senior/useSeniorExchangeRate'
import { useJuniorExchangeRate } from '@/hooks/junior/useJuniorExchangeRate'
import { useSeniorYield } from '@/hooks/senior/useSeniorYield'
import { useJuniorYield } from '@/hooks/junior/useJuniorYield'
import { useSusdcBalance } from '@/hooks/senior/useSusdcBalance'
import { useJusdcBalance } from '@/hooks/junior/useJusdcBalance'
import { useSeniorAvailableToWithdraw } from '@/hooks/senior/useSeniorAvailableToWithdraw'
import { useJuniorAvailableToWithdraw } from '@/hooks/junior/useJuniorAvailableToWithdraw'
import { BACKEND_URL } from '@/lib/constants'
import { useWallet } from '@aptos-labs/wallet-adapter-react'

type UserContextValue = {
  creditScoreDisplay: string
  creditLimitDisplay: string
  borrowedDisplay: string

  seniorExchangeRateDisplay: string
  juniorExchangeRateDisplay: string

  seniorApyDisplay: string
  juniorApyDisplay: string

  susdcDisplay: string
  jusdcDisplay: string

  seniorWithdrawAvailableDisplay: string
  juniorWithdrawAvailableDisplay: string

  maxBorrowDisplay: string
  borrowSubmit: (amountInput: string) => Promise<boolean>
  borrowSubmitting: boolean

  isVerified: boolean
  setIsVerified: (on: boolean) => void
}

const UserContext = React.createContext<UserContextValue | null>(null)

type UserProviderProps = { children: React.ReactNode }

// Normalize any AccountAddress|string into a lowercased hex string
const normalizeWallet = (addr: unknown) => {
  if (!addr) return ''
  try {
    const s = typeof addr === 'string' ? addr : (addr as any)?.toString?.() ?? String(addr)
    return s.trim().toLowerCase()
  } catch {
    return ''
  }
}

export function UserProvider({ children }: UserProviderProps) {
  // Credit line
  const {
    scoreDisplay: creditScoreDisplay,
    limitDisplay: creditLimitDisplay,
    borrowedDisplay,
  } = useCreditLine({ pollMs: 15_000 })

  // Exchange rates
  const { display: seniorExchangeRateDisplay } = useSeniorExchangeRate()
  const { display: juniorExchangeRateDisplay } = useJuniorExchangeRate()

  // APY
  const { displayAPY: seniorApyDisplay } = useSeniorYield()
  const { displayAPY: juniorApyDisplay } = useJuniorYield()

  // Balances
  const { display: susdcDisplay } = useSusdcBalance()
  const { display: jusdcDisplay } = useJusdcBalance()

  // Withdrawable
  const { display: seniorWithdrawAvailableDisplay } = useSeniorAvailableToWithdraw()
  const { display: juniorWithdrawAvailableDisplay } = useJuniorAvailableToWithdraw()

  // Borrow
  const {
    maxBorrowDisplay,
    submit: borrowSubmit,
    submitting: borrowSubmitting,
  } = useBorrow({ requireController: true })

  // Wallet (Aptos)
  const { account, connected } = useWallet()
  const wallet = React.useMemo(() => normalizeWallet(account?.address), [account?.address])

  // Backend verification flag
  const [isVerified, setIsVerified] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    const run = async () => {
      try {
        // Treat "not connected" as unverified
        if (!connected || !wallet) {
          if (alive) setIsVerified(false)
          return
        }
        const res = await fetch(`${BACKEND_URL}/user/${wallet}`)
        if (!res.ok) {
          if (alive) setIsVerified(false)
          return
        }
        const data: { isVerified?: boolean } = await res.json()
        if (alive) setIsVerified(Boolean(data?.isVerified))
      } catch {
        if (alive) setIsVerified(false)
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [connected, wallet])

  const value = React.useMemo<UserContextValue>(
    () => ({
      creditScoreDisplay,
      creditLimitDisplay,
      borrowedDisplay,

      seniorExchangeRateDisplay,
      juniorExchangeRateDisplay,

      seniorApyDisplay,
      juniorApyDisplay,

      susdcDisplay,
      jusdcDisplay,

      seniorWithdrawAvailableDisplay,
      juniorWithdrawAvailableDisplay,

      maxBorrowDisplay,
      borrowSubmit,
      borrowSubmitting,

      isVerified,
      setIsVerified,
    }),
    [
      creditScoreDisplay,
      creditLimitDisplay,
      borrowedDisplay,
      seniorExchangeRateDisplay,
      juniorExchangeRateDisplay,
      seniorApyDisplay,
      juniorApyDisplay,
      susdcDisplay,
      jusdcDisplay,
      seniorWithdrawAvailableDisplay,
      juniorWithdrawAvailableDisplay,
      maxBorrowDisplay,
      borrowSubmit,
      borrowSubmitting,
      isVerified,
    ]
  )

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser() {
  const ctx = React.useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within <UserProvider>.')
  return ctx
}
