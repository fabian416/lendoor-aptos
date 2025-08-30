'use client'

import { DynamicWidget, useIsLoggedIn, useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import Image from "next/image"

export function Header() {
  return (
     <header className="border-b border-primary/20 bg-background/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <Link href="/" className="group focus:outline-none flex justify-center align-center gap-3">
            <Image src="/favicon.png" alt="favicon" width={15} height={15} className="h-7 w-7 shrink-0 object-contain" />
            <div className="text-2xl font-bold text-primary mono-text terminal-cursor">LENDOOR</div>
          </Link>
          <nav className="hidden md:flex space-x-8 mono-text">
          <Link href="/borrow" className="text-muted-foreground hover:text-primary terminal-hover px-2 py-1 text-sm">
              BORROW
            </Link>
            <Link href="/lend" className="text-muted-foreground hover:text-primary terminal-hover px-2 py-1 text-sm">
              LEND
            </Link>
          </nav>
          <DynamicWidget />
        </div>
      </header>
  )
}
