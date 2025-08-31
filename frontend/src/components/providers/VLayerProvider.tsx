'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BrowserProvider, Contract, ethers } from 'ethers';
import type { Eip1193Provider } from 'ethers';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import type { WalletClient } from 'viem';

import AverageBalanceArtifact from '@/contracts/AverageBalance.json';

const AVERAGE_BALANCE_ADDRESS = import.meta.env.VITE_VLAYER_AVERAGE_BALANCE_ADDRESS as `0x${string}`;

type Proof = any;

type AverageBalanceResult = {
  proof: Proof;
  owner: string;
  avgBalance: bigint;
};

type VLayerContextType = {
  isReady: boolean;
  address?: string;
  signerAddress?: string;
  averageBalanceContract?: Contract;
  disconnect: () => Promise<void>;
  getAverageBalance: (owner: string) => Promise<AverageBalanceResult>;
};

const VLayerContext = createContext<VLayerContextType | null>(null);

async function walletToEip1193(wallet: any): Promise<Eip1193Provider | undefined> {
  if (!wallet) return undefined;

  // 1) Dynamic wallets suelen exponer getWalletClient()
  if (typeof wallet.getWalletClient === 'function') {
    const wc = (await wallet.getWalletClient()) as WalletClient | undefined;
    if (wc?.transport) return wc.transport as Eip1193Provider;
  }

  // 2) A veces a través del connector
  const connector = wallet.connector as any;
  if (connector?.getWalletClient) {
    const wc = await connector.getWalletClient();
    if (wc?.transport) return wc.transport as Eip1193Provider;
  }
  if (connector?.provider) {
    return connector.provider as Eip1193Provider;
  }

  // 3) Fallback: window.ethereum
  if (typeof window !== 'undefined' && (window as any).ethereum) {
    return (window as any).ethereum as Eip1193Provider;
  }

  return undefined;
}

export const VLayerProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { primaryWallet, handleLogOut } = useDynamicContext();

  const [isReady, setIsReady] = useState(false);
  const [signerAddress, setSignerAddress] = useState<string>();
  const [averageBalanceContract, setAverageBalanceContract] = useState<Contract>();
  const [connectedProvider, setConnectedProvider] = useState<Eip1193Provider>();

  const disconnect = useCallback(async () => {
    try {
      await handleLogOut();
    } catch {}
    setAverageBalanceContract(undefined);
    setConnectedProvider(undefined);
    setSignerAddress(undefined);
    setIsReady(false);
  }, [handleLogOut]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const eip1193 = await walletToEip1193(primaryWallet);
        if (!eip1193 || cancelled) {
          if (!cancelled) setIsReady(false);
          return;
        }

        const ethersProvider = new BrowserProvider(eip1193);
        const signer = await ethersProvider.getSigner();
        const addr = await signer.getAddress();

        if (!AVERAGE_BALANCE_ADDRESS) {
          throw new Error('Falta NEXT_PUBLIC_AVG_BALANCE_ADDRESS en el .env');
        }

        const abi = (AverageBalanceArtifact as any).abi ?? AverageBalanceArtifact;
        const avgBalance = new Contract(AVERAGE_BALANCE_ADDRESS, abi, signer);

        if (!cancelled) {
          setConnectedProvider(eip1193);
          setAverageBalanceContract(avgBalance);
          setSignerAddress(addr);
          setIsReady(true);
        }
      } catch (err) {
        console.error('VLayerProvider init error:', err);
        if (!cancelled) setIsReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [primaryWallet, disconnect]);

const getAverageBalance = useCallback(async (owner: string): Promise<AverageBalanceResult> => {
  if (!averageBalanceContract) throw new Error('Contrato AverageBalance no inicializado aún');
  if (!owner || !ethers.isAddress(owner)) throw new Error('Owner inválido');

  try {
    // ❌ Esto va a revertir en RPCs normales porque llama cheatcodes
    const fn = averageBalanceContract.getFunction('averageBalanceOf');
    const [proof, returnedOwner, avg] = await fn.staticCall(owner);
    return { proof, owner: returnedOwner, avgBalance: avg };
  } catch (err: any) {
    // code=BAD_DATA con value="0x" => revert/empty return (cheatcode no disponible)
    console.error('averageBalanceOf falló en RPC normal:', err);
    throw new Error('Este método requiere ejecutarse vía vLayer Prover (no disponible por RPC). Usá el Prover endpoint.');
  }
}, [averageBalanceContract]);


  const value = useMemo<VLayerContextType>(
    () => ({
      isReady,
      address: AVERAGE_BALANCE_ADDRESS,
      signerAddress,
      averageBalanceContract,
      disconnect,
      getAverageBalance,
    }),
    [isReady, signerAddress, averageBalanceContract, getAverageBalance, disconnect],
  );

  return <VLayerContext.Provider value={value}>{children}</VLayerContext.Provider>;
};

export const useVLayer = () => {
  const ctx = useContext(VLayerContext);
  if (!ctx) throw new Error('useVLayer debe usarse dentro de <VLayerProvider>');
  return ctx;
};
