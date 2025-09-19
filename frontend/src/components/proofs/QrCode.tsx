'use client'

import * as React from 'react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { InfoTip } from '@/components/common/InfoTooltip'
import { ArrowLeft, ShieldCheck, CheckCircle } from 'lucide-react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { useUserJourney } from '../providers/UserProvider'

// zkMe Widget (Compliance Suite)
import '@zkmelabs/widget/dist/style.css'
import { ZkMeWidget, verifyKycWithZkMeServices, type Provider } from '@zkmelabs/widget'

type QRCodeViewProps = {
  onBack: () => void
}

const APP_ID = process.env.NEXT_PUBLIC_ZKME_APP_ID!          // (= mchNo)
const PROGRAM_NO = process.env.NEXT_PUBLIC_ZKME_PROGRAM_NO!  // citizenship/personhood habilitado en tu Dashboard
const CHAIN_ID = '137'                                       // cross-chain (doc sugiere 137 por defecto)

export function QRCodeView({ onBack }: QRCodeViewProps) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const { setIsVerified } = useUserJourney()

  const [loading, setLoading] = useState(false)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ---- wallet actual (en minúsculas) ----
  const walletRef = useRef<string>('')     // address para el widget
  const [wallet, setWallet] = useState('') // opcional, para UI

  useEffect(() => {
    let alive = true
    const w: any = primaryWallet
    ;(async () => {
      try {
        if (!w) { if (alive) { walletRef.current=''; setWallet('') } ; return }
        let addr: any = w.address ?? w.account?.address ?? null
        if (!addr && typeof w.address === 'function') addr = w.address()
        if (addr && typeof addr?.then === 'function') addr = await addr
        if (!addr && typeof w.getPublicAddress === 'function') {
          addr = w.getPublicAddress()
          if (addr && typeof addr?.then === 'function') addr = await addr
        }
        const norm = (typeof addr === 'string' ? addr : '').toLowerCase()
        if (alive) { walletRef.current = norm; setWallet(norm) }
      } catch {
        if (alive) { walletRef.current=''; setWallet('') }
      }
    })()
    return () => { alive = false }
  }, [primaryWallet])

  // cerrar auto si quedó verificado
  useEffect(() => {
    if (verified === true) {
      const t = setTimeout(() => onBack(), 1000)
      return () => clearTimeout(t)
    }
  }, [verified, onBack])

  // ----- Provider para el widget -----
  const provider: Provider = {
    async getAccessToken() {
      // tu backend debe devolver { accessToken }
      const r = await fetch('/api/zkme/access-token', { method: 'POST' })
      if (!r.ok) throw new Error('Failed to get access token')
      const { accessToken } = await r.json()
      return accessToken
    },
    async getUserAccounts() {
      if (!walletRef.current) {
        setShowAuthFlow?.(true)
        throw new Error('Connect wallet first')
      }
      return [walletRef.current]
    },
  }

  // ----- Instancia única del widget -----
  const widgetRef = useRef<ZkMeWidget | null>(null)
  if (!widgetRef.current) {
    widgetRef.current = new ZkMeWidget(
      APP_ID,
      'LendoorAptos',
      CHAIN_ID,
      provider,
      { lv: 'zkKYC', programNo: PROGRAM_NO } // << elegís el programa aquí
    )
  }

  // evento: KYC terminado
  useEffect(() => {
    const widget = widgetRef.current!
    const onFinish = ({ isGrant, associatedAccount }: any) => {
      if (isGrant && associatedAccount === walletRef.current.toLowerCase()) {
        setVerified(true)
        setIsVerified(true)
      } else {
        setVerified(false)
      }
      setLoading(false)
    }
    widget.on('kycFinished', onFinish)
    return () => { widget.off?.('kycFinished', onFinish) }
  }, [setIsVerified])

  // acción principal
  const startVerification = async () => {
    try {
      setError(null)
      if (!walletRef.current) { setShowAuthFlow?.(true); return }
      setLoading(true)

      // 1) pre-check: si ya está verificado, no abrimos modal
      const { isGrant } = await verifyKycWithZkMeServices(APP_ID, walletRef.current, { programNo: PROGRAM_NO })
      if (isGrant) {
        setVerified(true); setIsVerified(true); setLoading(false)
        return
      }

      // 2) lanzar widget → en desktop mostrará QR automáticamente
      widgetRef.current!.launch()
    } catch (e: any) {
      setError(e?.message ?? 'Failed to start verification')
      setVerified(false)
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="p-2 cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold">zkMe Verification</h2>
          <InfoTip
            label={
              <div className="max-w-xs">
                <div className="font-semibold mb-1">Privacy</div>
                <div className="text-[11px] leading-snug">
                  Zero-knowledge verification. We only check your wallet satisfies the selected program
                  (e.g., citizenship/personhood). No PII is shared with us.
                </div>
              </div>
            }
            contentClassName="font-display text-[11px] leading-snug"
          />
        </div>
      </div>

      {/* Card */}
      <Card className="relative p-6 border-2 border-border/50 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
            <div className="h-6 w-6 rounded-full border-2 border-foreground/40 border-t-transparent animate-spin" />
            <div className="text-xs text-muted-foreground">Processing…</div>
          </div>
        )}

        <div className="mb-2 text-center">
          <h3 className="text-xl font-bold mb-2">Verify with zkMe</h3>
          <p className="text-sm text-muted-foreground">
            Click “Start verification”. On desktop, a modal with a QR will open so you can continue on your phone.
          </p>
        </div>

        {/* Botón en lugar del QR manual */}
        <div className="mx-auto mb-4 w-full flex items-center justify-center">
          {verified === true ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle className="w-16 h-16 text-green-600" />
              <span className="text-sm text-green-600 font-medium">Verified!</span>
            </div>
          ) : (
            <Button onClick={startVerification} disabled={!wallet}>
              {wallet ? 'Start verification' : 'Connect wallet to verify'}
            </Button>
          )}
        </div>

        {!loading && error && (
          <div className="text-sm text-amber-600 text-center">{error}</div>
        )}
      </Card>
    </div>
  )
}