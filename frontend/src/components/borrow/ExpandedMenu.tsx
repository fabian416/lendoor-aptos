"use client";

import { InfoTip } from "@/components/common/InfoTooltip"
import { useUser } from '@/providers/UserProvider'

const ExpandedMenu = () => {
  const { creditScoreDisplay: score} = useUser();


    return <div className="mt-3 space-y-3">
        <div className="text-xs font-medium text-muted-foreground">CREDIT SCORE</div>

        <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-primary rounded-full" />
            <span className="text-xs">Lendoor Score</span>
            <InfoTip
                contentClassName="font-display text-[11px] leading-snug"
                label={"Reputation-based score used to size limits and price risk."}
                side="top"
            />
            </div>
            <span className="text-xs">{score}</span>
        </div>

        <div className="text-xs font-medium text-muted-foreground mt-3">ASSETS</div>
    </div>
}

export default ExpandedMenu