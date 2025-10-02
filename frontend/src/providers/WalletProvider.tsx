'use client';
import { PropsWithChildren, createContext, useContext, useMemo } from 'react';
import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';
import { AptosWalletAdapterProvider } from '@aptos-labs/wallet-adapter-react';
import { APTOS_API_KEY, NETWORK } from '@/lib/constants';

// Same context as before
type AptosCtxType = { aptos: Aptos; network: Network };
const AptosCtx = createContext<AptosCtxType | null>(null);

export function WalletProvider({ children }: PropsWithChildren) {
  // Pin fullnode to avoid implicit defaults
  const FULLNODE =
    import.meta.env.VITE_APTOS_NODE_URL ||
    (NETWORK === Network.TESTNET
      ? 'https://api.testnet.aptoslabs.com/v1'
      : NETWORK === Network.DEVNET
      ? 'https://api.devnet.aptoslabs.com/v1'
      : 'http://localhost:8080/v1');

  // Wallet adapter config
  const dappConfig = useMemo(() => {
    const keys =
      APTOS_API_KEY && NETWORK === Network.MAINNET ? { [NETWORK]: APTOS_API_KEY } : {};
    return { network: NETWORK, aptosApiKeys: keys };
  }, []);

  // SDK client (pinned to FULLNODE)
  const value = useMemo<AptosCtxType>(() => {
    const cfg = new AptosConfig({ network: NETWORK, fullnode: FULLNODE });
    const aptos = new Aptos(cfg);
    console.info('[Aptos] network:', NETWORK, 'fullnode:', FULLNODE);
    return { aptos, network: NETWORK };
  }, []);

  return (
    <AptosWalletAdapterProvider
      // Keep or remove autoConnect as you prefer. It does not break the bridge.
      autoConnect
      dappConfig={dappConfig}
      onError={(err) =>
        console.error('Wallet Error:', (err as Error)?.message ?? String(err), err)
      }
    >
      {/* This bridge subscribes to adapter events and refreshes state on change */}
      <AptosCtx.Provider value={value}>{children}</AptosCtx.Provider>
    </AptosWalletAdapterProvider>
  );
}

export function useAptos() {
  const ctx = useContext(AptosCtx);
  if (!ctx) throw new Error('useAptos must be used within <WalletProvider>');
  return ctx;
}

