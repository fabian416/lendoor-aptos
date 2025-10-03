'use client'

import { useState } from 'react'
import { CreditMarket } from '@/components/borrow/BorrowMarket'
import QRCodeView from '@/components/identity/QrCode'

export default function BorrowPage() {
  const [showQR, setShowQR] = useState(false)

  return (
    <div className="container mx-auto w-full max-w-3xl">
      <div className="relative overflow-hidden">
        <div
          className={`flex w-[200%] transform-gpu transition-transform duration-500 ease-in-out ${
            showQR ? '-translate-x-1/2' : 'translate-x-0'
          }`}
        >
          <div className="w-1/2 shrink-0">
            <CreditMarket setShowQR={setShowQR} />
          </div>
          <div className="w-1/2 shrink-0">
          {showQR && <QRCodeView onBack={() => setShowQR(false)} />}
            
          </div>
        </div>
      </div>
    </div>
  )
}
