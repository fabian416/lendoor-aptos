'use client'

import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ZKPassport } from '@zkpassport/sdk'
import QRCode from 'react-qr-code'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { InfoTip } from '@/components/common/InfoTooltip'
import { ArrowLeft, ShieldCheck, Link as LinkIcon, Clock, Copy, RefreshCw } from 'lucide-react'
import { backendUri } from '@/lib/constants'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'

type QRCodeViewProps = {
  onBack: () => void
  appName?: string
  logoUrl?: string
  purpose?: string
  scope?: string
  devMode?: boolean
}

type BackendVerifyResponse = {
  verified: boolean
  user: {
    creditLimit?: number | string | null
  }
}

export function QRCodeView({
  onBack,
  appName = 'Lendoor',
  logoUrl = '/logo-black.png',
  purpose = 'Verify your identity using zkPassport',
  scope = 'identity-verification',
  devMode = true,
}: QRCodeViewProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const [submitting, setSubmitting] = useState(false)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [creditLimit, setCreditLimit] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { primaryWallet } = useDynamicContext()
  const wallet = useMemo(
    () => (primaryWallet as any)?.address?.toLowerCase?.() ?? '',
    [primaryWallet],
  )

  const zkpassportRef = useRef<ZKPassport | null>(null)
  const proofRef = useRef<any | null>(null)

  // Init + (Re)generate QR
  const generateQR = React.useCallback(async () => {
    setLoading(true)
    setUrl(null)
    setRequestId(null)
    setError(null)
    setVerified(null)
    setCreditLimit(null)
    proofRef.current = null

    try {
      if (!zkpassportRef.current) {
        zkpassportRef.current = new ZKPassport()
      }

      const qb = await zkpassportRef.current.request({
        name: appName,
        logo: logoUrl,
        purpose,
        scope,
        devMode,
      })

      const {
        url,
        requestId,
        onRequestReceived,
        onGeneratingProof,
        onProofGenerated,
        onResult,
        onReject,
        onError,
      } = qb
        // Example disclosures / checks; adjust to your real flow
        .disclose('firstname')
        .disclose('lastname')
        .disclose('birthdate')
        .disclose('nationality')
        .disclose('document_type')
        .disclose('document_number')
        .gte('age', 18)
        .done()

      setUrl(url)
      setRequestId(requestId)
      setLoading(false)

      onRequestReceived(() => {
        // optional: request received
      })
      onGeneratingProof(() => {
        setLoading(true)
      })
      onProofGenerated((proof) => {
        proofRef.current = proof
      })
      onResult(async ({ verified, result }) => {
        // Keep waiting for backend verification; do not navigate away
        if (!proofRef.current) {
          setLoading(false)
          setVerified(false)
          setError('Missing proof. Please try again.')
          return
        }

        if (!wallet) {
          setLoading(false)
          setVerified(false)
          setError('Connect your wallet to continue.')
          return
        }

        try {
          setSubmitting(true)
          setError(null)

          const res = await fetch(`${backendUri}/zkpassport/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress: wallet,
              requestId,
              proof: proofRef.current,
              result,
            }),
          })

          if (!res.ok) {
            const text = await res.text().catch(() => '')
            throw new Error(text || `Backend verify failed (${res.status})`)
          }

          const data: BackendVerifyResponse = await res.json()
          setVerified(Boolean(data.verified))

          const clRaw = data?.user?.creditLimit
          const cl =
            typeof clRaw === 'number'
              ? clRaw
              : clRaw != null
              ? Number(clRaw as any)
              : null
          setCreditLimit(Number.isFinite(cl as number) ? (cl as number) : null)
        } catch (e: any) {
          setVerified(false)
          setError(e?.message ?? 'Error submitting proof to backend.')
        } finally {
          setSubmitting(false)
          setLoading(false)
        }
      })
      onReject(() => {
        setLoading(false)
        setVerified(false)
        setError('Request rejected in the app. Try again.')
      })
      onError((_err) => {
        setLoading(false)
        setVerified(false)
        setError('An error occurred during proof generation.')
      })
    } catch (_e) {
      setLoading(false)
      setVerified(false)
      setError('Failed to initialize zkPassport.')
    }
  }, [appName, logoUrl, purpose, scope, devMode, wallet])

  useEffect(() => {
    generateQR()
  }, [generateQR])

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="p-2 cursor-pointer">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold">zkPassport</h2>
          <InfoTip
            label={
              <div className="max-w-xs">
                <div className="font-semibold mb-1">What is this?</div>
                <div className="text-[11px] leading-snug">
                  Scan with your zkPassport app to generate a zero-knowledge proof. We link selected
                  passport attributes to your wallet to assess eligibility and build a reputation-based
                  credit score. Personal data stays off-chain; only minimal attestations are written
                  on-chain.
                </div>
              </div>
            }
            contentClassName="font-display text-[11px] leading-snug"
          />
        </div>
      </div>

      {/* Card */}
      <Card className="p-6 border-2 border-border/50 overflow-hidden">
        <div className="mb-2 text-center">
          <h3 className="text-xl font-bold mb-2">Verify with zkPassport</h3>
          <p className="text-sm text-muted-foreground">
            Open the zkPassport mobile app and scan this code to create your proof and link it to
            your wallet. This helps unlock a reputation-based credit experience.
          </p>
        </div>

        {/* QR */}
        <div className="mx-auto mb-4 w-[232px] flex items-center justify-center">
          {loading ? (
            <div className="w-[224px] h-[224px] qr-skeleton">
              <div className="qr-skeleton-band" />
            </div>
          ) : url ? (
            <div className="rounded-md border border-border/70 bg-background p-2">
              <QRCode value={url} size={208} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Preparing request…</div>
          )}
        </div>
      </Card>

     
    </div>
  )
}
