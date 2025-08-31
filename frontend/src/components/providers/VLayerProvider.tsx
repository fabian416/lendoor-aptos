'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Abi, Address, Hash } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { vlayerClient } from '@/lib/vlayerTeleporterClient';

// ─────────────────────────────────────────────────────────────────────────────
// Config (ENV + defaults)
const PROVER_ADDRESS = (import.meta.env.VITE_VLAYER_AVERAGE_BALANCE_ADDRESS ?? '') as Address;

const CHAIN_ID = Number('1');
const GAS_LIMIT = Number(import.meta.env.VITE_PUBLIC_TIMETRAVEL_CHAIN_ID ?? '1000000'); // 1e6

// ABIs
import proverSpec from '@/contracts/AverageBalance.json';
// Cortamos inferencia del ABI (evita TS2589)
const AVERAGE_BALANCE_ABI = (proverSpec as any).abi as unknown as Abi;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
type Proof = any;

export type AverageBalanceResult = {
  proof: Proof;
  owner: Address;
  avgBalance: bigint;
};

type GenericProveArgs = {
  address?: Address;               // address del caller (si no, usa el del user)
  proverAddress?: Address;         // override del prover (default: env)
  proverAbi: Abi;                  // ABI del prover
  functionName: string;            // nombre de la función
  args?: ReadonlyArray<unknown>;   // args readonly (evita inferencia variádica)
  chainId?: number;                // default: CHAIN_ID
  gasLimit?: number;               // default: GAS_LIMIT (si el SDK lo usa)
};

type VLayerContextType = {
  isReady: boolean;
  userAddress?: Address;
  loading: boolean;
  error?: string;

  // resultados en memoria (último)
  lastProof?: Proof;
  lastResult?: unknown;

  // acciones
  disconnect: () => Promise<void>;

  // helpers genéricos
  prove: (params: GenericProveArgs) => Promise<unknown>;
  waitForResult: (hash: Hash | string) => Promise<unknown>;

  // caso de uso concreto
  proveAverageBalance: (owner?: Address) => Promise<AverageBalanceResult>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Context
const VLayerContext = createContext<VLayerContextType | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
export const VLayerProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { user, handleLogOut } = useDynamicContext();

  const [isReady, setIsReady] = useState(false);
  const [userAddress, setUserAddress] = useState<Address | undefined>();
  const [loading, setLoading] = useState(false);
  const [lastProof, setLastProof] = useState<Proof | undefined>();
  const [lastResult, setLastResult] = useState<unknown | undefined>();
  const [error, setError] = useState<string | undefined>();

  const mounted = useRef(true);

  // detectar dirección del usuario desde Dynamic (ajustá a tu shape real)
  useEffect(() => {
    mounted.current = true;
    const addr = user?.verifiedCredentials?.[0]?.address as Address | undefined;
    setUserAddress(addr);

    // el provider queda ready si tengo un PROVER_ADDRESS y algún chainId definido
    setIsReady(Boolean(PROVER_ADDRESS) && Number.isFinite(CHAIN_ID));

    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.verifiedCredentials]);

  const disconnect = useCallback(async () => {
    try {
      await handleLogOut();
    } catch {
      // noop
    } finally {
      if (!mounted.current) return;
      setUserAddress(undefined);
      setIsReady(Boolean(PROVER_ADDRESS) && Number.isFinite(CHAIN_ID));
      setLastProof(undefined);
      setLastResult(undefined);
      setError(undefined);
      setLoading(false);
    }
  }, [handleLogOut]);

  // helper genérico: hace prove y devuelve el hash
  const prove = useCallback(
    async (params: GenericProveArgs): Promise<unknown> => {
      const {
        address,
        proverAddress = PROVER_ADDRESS,
        proverAbi,
        functionName,
        args = [],
        chainId = CHAIN_ID,
        gasLimit = GAS_LIMIT, // por si el SDK lo usa
      } = params;

      if (!proverAddress) throw new Error('Falta VITE_VLAYER_AVERAGE_BALANCE_ADDRESS');
      if (!functionName) throw new Error('functionName requerido');
      if (!proverAbi) throw new Error('proverAbi requerido');

      const caller = (address ?? userAddress) as Address | undefined;
      if (!caller) throw new Error('No hay address (ni del usuario ni por parámetro)');

      setLoading(true);
      setError(undefined);

      try {
        // IMPORTANTE:
        //  - No usar spread [...args] (dispara inferencia variádica)
        //  - Castear args a unknown para evitar uniones readonly infinitas del SDK
        const proofHash = await vlayerClient.prove({
          address: proverAddress,
          proverAbi: proverAbi as unknown as Abi,
          functionName: functionName as string,
          args: args as unknown, // ← corte de inferencia
          chainId,
          // gasLimit, // si tu SDK lo admite
        } as any); // ← red final para branded generics

        setLastProof(proofHash);
        return proofHash;
      } catch (e: any) {
        const msg = e?.message ?? 'Error desconocido en vlayerClient.prove';
        setError(msg);
        throw e;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [userAddress],
  );

  // helper: espera resultado
  const waitForResult = useCallback(async (hash: Hash | string): Promise<unknown> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await vlayerClient.waitForProvingResult({ hash: hash as Hash });
      setLastResult(result);
      return result;
    } catch (e: any) {
      const msg = e?.message ?? 'Error esperando el resultado de la prueba';
      setError(msg);
      throw e;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // caso concreto: averageBalanceOf(address)
  const proveAverageBalance = useCallback(
    async (owner?: Address): Promise<AverageBalanceResult> => {
      const target = (owner ?? userAddress) as Address | undefined;
      if (!target) throw new Error('No hay owner/address para calcular el average balance');

      // 1) PROVE
      const proofHash = (await prove({
        address: target,
        proverAbi: AVERAGE_BALANCE_ABI,
        functionName: 'averageBalanceOf',
        // Tu función parece ser (address) → args de 1 elemento
        args: [target] as const, // readonly y concreto (evita inferencia rara)
      })) as string;

      // 2) Esperar resultado
      const result: any = await waitForResult(proofHash as Hash);

      // Ajustá el layout según tu backend: acá asumo result[2] = avgBalance
      const avg = BigInt(result?.[2] ?? 0n);

      return {
        proof: result,
        owner: target,
        avgBalance: avg,
      };
    },
    [prove, waitForResult, userAddress],
  );

  const value = useMemo<VLayerContextType>(
    () => ({
      isReady,
      userAddress,
      loading,
      error,
      lastProof,
      lastResult,
      disconnect,
      prove,
      waitForResult,
      proveAverageBalance,
    }),
    [
      isReady,
      userAddress,
      loading,
      error,
      lastProof,
      lastResult,
      disconnect,
      prove,
      waitForResult,
      proveAverageBalance,
    ],
  );

  return <VLayerContext.Provider value={value}>{children}</VLayerContext.Provider>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
export const useVLayer = () => {
  const ctx = useContext(VLayerContext);
  if (!ctx) throw new Error('useVLayer debe usarse dentro de <VLayerProvider>');
  return ctx;
};
