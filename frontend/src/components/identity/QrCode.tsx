'use client'

import * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { InfoTip } from '@/components/common/InfoTooltip'
import { ArrowLeft, ShieldCheck, CheckCircle } from 'lucide-react'
import { useUser } from '@/providers/UserProvider'
import {
  VITE_ZK_ME_APP_ID as APP_ID,
  VITE_ZK_ME_PROGRAM_NO as PROGRAM_NO,
  BACKEND_URL,
} from '@/lib/constants'

import '@zkmelabs/widget/dist/style.css'
import { ZkMeWidget, type Provider } from '@zkmelabs/widget'
import { triggerCreditRefresh } from '@/lib/creditBus'

type QRCodeViewProps = { onBack: () => void }

const ACCESS_TOKEN_URL = `${BACKEND_URL}/zk-me/access-token`
const VERIFY_URL       = `${BACKEND_URL}/zk-me/verify`

// zkMe suggests Polygon chainId for cross-chain usage; not used for Aptos signing.
const CHAIN_ID = '137'

export default function QRCodeView({ onBack }: QRCodeViewProps) {
  const { setIsVerified } = useUser()

  // UI state
  const [loading, setLoading] = useState(false)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Runtime state/refs
  const tokenRef = useRef<string | null>(null)
  const widgetRef = useRef<ZkMeWidget | null>(null)
  const hasLaunchedRef = useRef(false)

  const [tokenReady, setTokenReady] = useState(false)
  const [aptosAddr, setAptosAddr] = useState<string | null>(null)
  const [petraReady, setPetraReady] = useState(false)

  /* --------------------------------------------------------------------------
   * 1) Short-lived access token from your backend (server holds API key).
   * ------------------------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setError(null)
        const r = await fetch(ACCESS_TOKEN_URL, { method: 'POST' })
        if (!r.ok) throw new Error(`access-token ${r.status}: ${await r.text()}`)
        const j = await r.json()
        if (!j?.accessToken) throw new Error('Malformed token response')
        tokenRef.current = j.accessToken
        if (!cancelled) setTokenReady(true)
        if (j.appId && APP_ID && j.appId !== APP_ID) {
          console.warn('[zkMe] AppId mismatch: backend=', j.appId, ' frontend=', APP_ID)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to get access token')
      }
    })()
    return () => { cancelled = true }
  }, [])

  /* --------------------------------------------------------------------------
   * 2) Petra silent preflight to recover previously authorized address.
   * ------------------------------------------------------------------------ */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const aptos = (window as any)?.aptos
        if (!aptos?.account) return
        const acc = await aptos.account().catch(() => null)
        if (acc?.address && !cancelled) {
          setAptosAddr(String(acc.address).toLowerCase())
          setPetraReady(true)
        }
      } catch {
        // ignore
      }
    })()
    return () => { cancelled = true }
  }, [])

  const connectPetra = async () => {
    try {
      setLoading(true)
      const aptos = (window as any)?.aptos
      if (!aptos?.connect) throw new Error('Petra is not available in this browser')
      const res = await aptos.connect() // user prompt
      const addr = (res?.address ?? (await aptos.account())?.address) as string | undefined
      if (!addr) throw new Error('No address returned by Petra')
      setAptosAddr(addr.toLowerCase())
      setPetraReady(true)
      setError(null)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to connect Petra')
    } finally {
      setLoading(false)
    }
  }

  /* --------------------------------------------------------------------------
   * 3) zkMe provider: must return the Aptos address.
   * ------------------------------------------------------------------------ */
  const provider = useMemo<Provider>(() => ({
    async getAccessToken() {
      if (!tokenRef.current) throw new Error('Token not ready')
      return tokenRef.current
    },
    async getUserAccounts() {
      if (!aptosAddr) {
        const aptos = (window as any)?.aptos
        const acc = await aptos?.account?.().catch(() => null)
        if (acc?.address) return [String(acc.address).toLowerCase()]
        throw new Error('No wallet address available')
      }
      return [aptosAddr]
    },
  }), [aptosAddr])

  /* --------------------------------------------------------------------------
   * 4) Build once ready; handle kycFinished → call backend → emit refresh.
   * ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!tokenReady || !petraReady) return
    if (!APP_ID?.trim())  { setError('Missing VITE_ZK_ME_APP_ID (mchNo)'); return }
    if (!PROGRAM_NO?.trim()) { setError('Missing VITE_ZK_ME_PROGRAM_NO'); return }

    if (!widgetRef.current) {
      widgetRef.current = new ZkMeWidget(
        APP_ID,
        'Lendoor',
        CHAIN_ID,
        provider,
        { lv: 'zkKYC', programNo: PROGRAM_NO }
      )
    } else {
      (widgetRef.current as any).setOptions?.({ lv: 'zkKYC', programNo: PROGRAM_NO })
    }

    const widget = widgetRef.current!
    const onFinish = async (payload: any) => {
      try {
        const isGrant = !!payload?.isGrant

        // Always trust the Petra Aptos address as the canonical wallet.
        const walletToUse = (aptosAddr ?? '').toLowerCase()
        if (!walletToUse) throw new Error('No Aptos wallet address from Petra')

        // Backend: persist + set on-chain score/limit (waitForTransaction).
        const r = await fetch(VERIFY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            walletAddress: walletToUse,
            isGrant,
            programNo: PROGRAM_NO,
            widgetPayload: payload ?? null,
            zkAssociatedAccount: payload?.associatedAccount ?? null,
          }),
        })
        if (!r.ok) throw new Error(`verify ${r.status}: ${await r.text()}`)

        // UX flags
        setVerified(isGrant)
        if (isGrant) {
          setIsVerified(true)
          // Optional tiny settle; backend already waited for tx, so this is usually not needed.
          // await new Promise(r => setTimeout(r, 300))
          // Tell the rest of the app (hooks/components) to re-read on-chain data now.
          triggerCreditRefresh('zkme-finished', { owner: walletToUse })
        }

        // Close modal slightly after success
        setTimeout(() => onBack(), 900)
      } catch (e: any) {
        setError(e?.message ?? 'Failed to finalize verification')
      } finally {
        setLoading(false)
      }
    }

    ;(widget as any).on?.('kycFinished', onFinish)
    return () => {
      ;(widget as any).off?.('kycFinished', onFinish)
        ?? (widget as any).removeListener?.('kycFinished', onFinish)
    }
  }, [tokenReady, petraReady, APP_ID, PROGRAM_NO, provider, setIsVerified, onBack, aptosAddr])

  /* --------------------------------------------------------------------------
   * 5) Launch widget once.
   * ------------------------------------------------------------------------ */
  useEffect(() => {
    if (!tokenReady || !petraReady || !widgetRef.current || hasLaunchedRef.current) return
    hasLaunchedRef.current = true
    setLoading(true)
    ;(async () => {
      try { await (widgetRef.current as any).launch?.() }
      catch (e: any) { setError(e?.message ?? 'Failed to launch verification') }
      finally { setLoading(false) }
    })()
  }, [tokenReady, petraReady])

  const relaunch = async () => {
    if (!widgetRef.current) return
    try { setError(null); setLoading(true); await (widgetRef.current as any).launch?.() }
    catch (e: any) { setError(e?.message ?? 'Failed to open modal') }
    finally { setLoading(false) }
  }

  const needsConnect = !petraReady

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="p-2">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" />
          <h2 className="text-lg font-semibold">zkMe Verification</h2>
          <InfoTip
            label={
              <div className="max-w-xs text-[11px] leading-snug">
                This program binds your zkMe KYC to your Petra address. We only receive the grant status and non-PII flags.
              </div>
            }
            contentClassName="font-display text-[11px] leading-snug"
          />
        </div>
      </div>

      {/* Card */}
      <Card className="relative p-6 border-2 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
            <div className="h-6 w-6 rounded-full border-2 border-foreground/40 border-t-transparent animate-spin" />
            <div className="text-xs text-muted-foreground">Working…</div>
          </div>
        )}

        {needsConnect ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-sm text-muted-foreground">Connect Petra to continue</div>
            <Button onClick={connectPetra}>Connect Petra</Button>
          </div>
        ) : verified === true ? (
          <div className="flex flex-col items-center gap-2">
            <CheckCircle className="w-16 h-16" />
            <span className="text-sm font-medium">Verified!</span>
          </div>
        ) : (
          <div className="mx-auto mb-4 w-full flex items-center justify-center">
            <Button onClick={relaunch}>Open verification modal</Button>
          </div>
        )}

        {!loading && error && (
          <div className="text-sm text-amber-600 text-center">{error}</div>
        )}
      </Card>
    </div>
  )
}
