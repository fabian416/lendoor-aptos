import { useEffect, useMemo, useState } from "react"

type MockState = {
  shares: number
  pps: number
  totalAssets: number
}

export function useMockSeniorStats(address?: string) {
  const key = useMemo(
    () => (address ? `lendoor:mock:${address}` : ""),
    [address]
  )

  const [shares, setShares] = useState(0)
  const [pps, setPps] = useState(1) // mock price per share
  const [totalAssets, setTotalAssets] = useState(0)

  // load
  useEffect(() => {
    if (!key) return
    const raw = localStorage.getItem(key)
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as Partial<MockState>
      setShares(parsed.shares ?? 0)
      setPps(parsed.pps ?? 1)
      setTotalAssets(parsed.totalAssets ?? 0)
    } catch {
      // ignore corrupted storage
    }
  }, [key])

  // save
  useEffect(() => {
    if (!key) return
    const payload: MockState = { shares, pps, totalAssets }
    localStorage.setItem(key, JSON.stringify(payload))
  }, [key, shares, pps, totalAssets])

  const userSharesUsd = shares * pps

  const onMockDeposit = (amount: number) => {
    if (!amount || amount <= 0) return
    const mintedShares = amount / pps

    setShares((s) => s + mintedShares)
    setTotalAssets((t) => t + amount)

    // opcional: micro-yield fake
    setPps((p) => Number((p * 1.0005).toFixed(6)))
  }

  const onMockWithdraw = (amount: number) => {
    if (!amount || amount <= 0) return
    const burnedShares = amount / pps

    setShares((s) => Math.max(0, s - burnedShares))
    setTotalAssets((t) => Math.max(0, t - amount))
  }

  return {
    shares,
    pps,
    totalAssets,
    userSharesUsd,
    onMockDeposit,
    onMockWithdraw,
  }
}