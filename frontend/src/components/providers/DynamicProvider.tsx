'use client';

import { DynamicContextProvider, mergeNetworks } from '@dynamic-labs/sdk-react-core';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';
import { evmNetworks as customNetworks } from '@/lib/utils';

export function DynamicProvider({ children }: { children: React.ReactNode }) {
  const mergedNetworks = mergeNetworks(customNetworks, []);

  return (
    <DynamicContextProvider
      settings={{
        environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENV_ID!,
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          evmNetworks: mergedNetworks,
        },
        recommendedWallets: [
         { walletKey: "metamask", label: "Recommended" },
         { walletKey: "defiant", label: "Popular" }
      ],

      }}
    >
      {children}
    </DynamicContextProvider>
  );
}