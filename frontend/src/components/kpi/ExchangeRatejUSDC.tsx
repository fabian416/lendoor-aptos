'use client'

import * as React from 'react'
import { InfoTip } from '@/components/common/InfoTooltip'
import { useUser } from '@/providers/UserProvider'

type Props = {
  label?: string
  baseSymbol?: string
  quoteSymbol?: string
  tooltipContent?: React.ReactNode
  containerClassName?: string
  valueClassName?: string
  pollMs?: number
  value?: string
}

export function JusdcExchangeRateKPI({
  label = 'jUSDC/sUSDC',
  baseSymbol = 'jUSDC',
  quoteSymbol = 'sUSDC',
  tooltipContent,
  containerClassName = 'col-span-1',
  valueClassName = 'text-green-600',
}: Props) {
  const { juniorExchangeRateDisplay } = useUser();

  const defaultTooltip = (
    <div>
      <div className="font-semibold">{label}</div>
      <ul className="mt-2 list-none pl-0 space-y-2 text-[11px] leading-snug">
        <li>Conversion derived from tranche share prices in the EVault.</li>
        <li>Shows how many {quoteSymbol} equal 1 {baseSymbol}.</li>
        <li>Excludes fees/slippage and redemption rules.</li>
      </ul>
    </div>
  )

  return (
    <div >
    </div>
  )
}