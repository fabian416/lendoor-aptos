'use client'

import { useEffect, useState } from "react"
import { Wallet } from "lucide-react"
import { DynamicWidget, useIsLoggedIn, useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useRouter, usePathname } from "next/navigation"
import { Lock, Github, Twitter } from "lucide-react"
import { Button } from "./ui/button"
import Image from "next/image"

const Header = () => {
  return (
      <header className="flex items-center justify-between p-2 lg:p-4">
          <div className="flex items-center space-x-3 px-4">
            <Image src="/logo-transparent.png" width={140} height={100} alt="logo" />
          </div>

          <div className="flex items-center space-x-4 px-4">
            <DynamicWidget />
          </div>
        </header>
  )
}

export default Header
