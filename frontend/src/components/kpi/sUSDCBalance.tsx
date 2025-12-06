'use client'

import * as React from 'react'
import { InfoTip } from '@/components/common/InfoTooltip'
import { useUser } from '@/providers/UserProvider'

type Props = {
  label?: string
  tokenSymbol?: string
  tooltipContent?: React.ReactNode
  containerClassName?: string
  valueClassName?: string
  pollMs?: number
}

export function SusdcBalanceKPI({
  label = 'sUSDC',
  tokenSymbol = 'sUSDC',
  tooltipContent,
  containerClassName = 'col-span-1',
  valueClassName = 'text-green-600',
}: Props) {
  const { susdcDisplay } = useUser();

  const defaultTooltip = (
    <div>
      <div className="font-semibold">{tokenSymbol} Balance</div>
      <ul className="mt-2 list-none pl-0 space-y-2 text-[11px] leading-snug">
        <li>Amount of {tokenSymbol} you currently hold (senior tranche).</li>
        <li>Lower risk; senior claim on interest repayments from the pool.</li>
        <li>Permissionless deposits: USDC → {tokenSymbol} (ERC-4626 vault).</li>
        <li>Real-time liquidity subject to market reserves and conditions.</li>
      </ul>
    </div>
  )

  return (
    <div>
    </div>
  )
}

