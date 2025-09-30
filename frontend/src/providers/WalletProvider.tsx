"use client";
import { PropsWithChildren, createContext, useContext, useMemo } from "react";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { APTOS_API_KEY, NETWORK } from "@/lib/constants";

type AptosCtxType = { aptos: Aptos; network: Network };
const AptosCtx = createContext<AptosCtxType | null>(null);

export function WalletProvider({ children }: PropsWithChildren) {
  // dappConfig for wallet adapter (same style you had)
  const dappConfig = useMemo(() => {
    const keys = APTOS_API_KEY && NETWORK === Network.MAINNET ? { [NETWORK]: APTOS_API_KEY } : {};
    return { network: NETWORK, aptosApiKeys: keys };
  }, []);

  // SDK client
  const value = useMemo<AptosCtxType>(() => {
    const cfg = new AptosConfig({ network: NETWORK });
    const aptos = new Aptos(cfg);
    return { aptos, network: NETWORK };
  }, []);

  return (
    <AptosWalletAdapterProvider
      autoConnect
      dappConfig={dappConfig}
      onError={err => console.error("Wallet Error:", (err as Error)?.message ?? String(err), err)}
    >
      <AptosCtx.Provider value={value}>{children}</AptosCtx.Provider>
    </AptosWalletAdapterProvider>
  );
}

export function useAptos() {
  const ctx = useContext(AptosCtx);
  if (!ctx) throw new Error("useAptos must be used within <WalletProvider>");
  return ctx;
}