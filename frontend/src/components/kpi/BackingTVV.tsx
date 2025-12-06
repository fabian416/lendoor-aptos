'use client'

import * as React from 'react'
import { InfoTip } from '@/components/common/InfoTooltip'

type BackingTVVKPIProps = {
  /** Valor a mostrar, ej: "10.4M" */
  value: string
  /** Label del KPI (por defecto "Backing TVV") */
  label?: string
  /** Contenido custom del tooltip (si no pasás, usa el default) */
  tooltipContent?: React.ReactNode
  /** Clases extra para el contenedor (ej: col-span) */
  containerClassName?: string
  /** Clases extra para el valor (color/tipografía) */
  valueClassName?: string
}

export function BackingTVVKPI({
  value,
  label = 'Backing TVV',
  tooltipContent,
  containerClassName = 'col-span-2',
  valueClassName = '',
}: BackingTVVKPIProps) {
  const defaultTooltip = (
    <div>
      <div className="font-semibold">Backing TVV</div>
      <ul className="mt-2 list-none pl-0 space-y-2">
        <li>Total Verified Value backing the Lendoor credit lines.</li>
        <li>Includes verified DeFi on-chain assets and off-chain bank assets.</li>
        <li>Represents backing capacity and overall market health.</li>
      </ul>
    </div>
  )

  return (
    <div>
    </div>
  )
}
