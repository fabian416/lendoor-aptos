"use client";
import { PropsWithChildren, useMemo } from "react";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import { APTOS_API_KEY, NETWORK } from "@/constants";

export function WalletProvider({ children }: PropsWithChildren) {
  const dappConfig = useMemo(() => {
    const keys =
      APTOS_API_KEY && NETWORK === Network.MAINNET
        ? { [NETWORK]: APTOS_API_KEY }
        : {};
    return { network: NETWORK, aptosApiKeys: keys };
  }, []);

  return (
    <AptosWalletAdapterProvider
      autoConnect
      dappConfig={dappConfig}
      onError={(error) => {
        const msg = (error as Error)?.message ?? String(error) ?? "Unknown wallet error";
        console.error("Wallet Error:", msg, error);
      }}
    >
      {children}
    </AptosWalletAdapterProvider>
  );
}