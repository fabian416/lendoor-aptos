"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChevronDown, ChevronUp, Info, X } from "lucide-react"

export function CreditMarket() {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState("Pull")

  return (
    <div className="w-full max-w-md mx-auto space-y-3 p-4">
      {/* Header Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {["Pull", "Pay"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground cursor-pointer"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm px-4 py-2">
          Connect Wallet
        </Button>
      </div>
      
      <div className="grid grid-cols-4 gap-2 w-full mx-auto">
        {/* Cash */}
        <div className="col-span-1 h-14 px-3 py-1 rounded-lg border border-border/50 bg-card shadow-sm
                        flex flex-col items-center justify-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
            <div className="w-2 h-2 bg-primary rounded-full" />
            <span className="text-xs text-muted-foreground">Limit</span>
            <Info className="w-3 h-3 text-muted-foreground" />
            </div>
            <div className="text-sm font-bold leading-none text-green-600">0/1000</div>
        </div>

        {/* Implied APY */}
        <div className="col-span-2 h-14 px-3 py-1 rounded-lg border border-border/50 bg-card shadow-sm
                        flex flex-col items-center justify-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
            <span className="text-xs text-muted-foreground">Base APY</span>
            <Info className="w-3 h-3 text-muted-foreground" />
            </div>
            <div className="text-sm font-bold leading-none">6.82%</div>
        </div>

        {/* Rewards */}
        <div className="col-span-1 h-14 px-3 py-1 rounded-lg border border-border/50 bg-card shadow-sm
                        flex flex-col items-center justify-center">
            <div className="flex items-center justify-center gap-1 mb-0.5">
            <div className="w-2 h-2 bg-primary rounded-full" />
            <span className="text-xs text-muted-foreground">Score</span>
            </div>
            <div className="text-sm font-bold leading-none">120/255</div>
        </div>
      </div>

      <Card className="p-4 border-2 border-border/50">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-muted-foreground font-mono">BORROW BANK-FREE</span>
        </div>

        <div className="text-center mb-4">
          <div className="text-4xl font-bold text-primary mb-1">$0</div>
          <div className="text-xs text-muted-foreground">MAX PULL 0</div>
        </div>

        <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-3 cursor-pointer text-base font-semibold mb-4">
          Pull Credit Line
        </Button>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">TX Cost</span>
            <span className="text-xs">-</span>
          </div>
        </div>

        {/* Collapsible Credit Info */}
        <div className="border-t border-border pt-3">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-muted rounded flex items-center justify-center">
                <span className="text-xs">💳</span>
              </div>
              <span className="text-sm font-medium">Credit Info</span>
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-3">
              <div className="text-xs font-medium text-muted-foreground">CREDIT SCORE</div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-primary rounded-full"></div>
                  <span className="text-xs">Lendoor Score</span>
                  <Info className="w-3 h-3 text-muted-foreground" />
                </div>
                <span className="text-xs">0/1000</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span className="text-xs">Credit Karma</span>
                  <Info className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">1x-3x Boost</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-xs text-green-500">CONNECT</span>
                </div>
              </div>

              <div className="text-xs font-medium text-muted-foreground mt-3">ASSETS</div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs">🔗</span>
                  <span className="text-xs">Onchain</span>
                  <Info className="w-3 h-3 text-muted-foreground" />
                </div>
                <span className="text-xs">$0</span>
              </div>
            </div>
          )}
        </div>
      </Card>

    </div>
  )
}
