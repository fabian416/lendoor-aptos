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
import type { Abi } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { vlayerClient } from '@/lib/vlayerTeleporterClient';

// ─────────────────────────────────────────────────────────────────────────────
// Config (ENV + defaults)
const PROVER_ADDRESS = (import.meta.env.VITE_VLAYER_AVERAGE_BALANCE_ADDRESS ??
  '') as `0x${string}`;

const CHAIN_ID = Number('1');
const GAS_LIMIT = Number(import.meta.env.VITE_PUBLIC_TIMETRAVEL_CHAIN_ID ?? '1000000'); // 1e6

// ABIs
import proverSpec from '@/contracts/AverageBalance.json';
const AVERAGE_BALANCE_ABI = (proverSpec as any).abi as Abi;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
type Proof = any;

export type AverageBalanceResult = {
  proof: Proof;
  owner: `0x${string}`;
  avgBalance: bigint;
};

type GenericProveArgs = {
  address?: `0x${string}`;        // address target de la llamada (si no, usa el del user)
  proverAddress?: `0x${string}`;   // si querés sobreescribir el prover (default: env)
  proverAbi: Abi;                  // ABI del prover
  functionName: string;            // nombre de la función
  args?: unknown[];                // args para la función
  chainId?: number;                // default: CHAIN_ID
  gasLimit?: number;               // default: GAS_LIMIT
};

type VLayerContextType = {
  isReady: boolean;
  userAddress?: `0x${string}`;
  loading: boolean;
  error?: string;

  // resultados en memoria (último)
  lastProof?: Proof;
  lastResult?: unknown;

  // acciones
  disconnect: () => Promise<void>;

  // helpers genéricos
  prove: (params: GenericProveArgs) => Promise<unknown>;
  waitForResult: (hash: string) => Promise<unknown>;

  // caso de uso concreto
  proveAverageBalance: (owner?: `0x${string}`) => Promise<AverageBalanceResult>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Context
const VLayerContext = createContext<VLayerContextType | null>(null);

// ─────────────────────────────────────────────────────────────────────────────
// Provider
export const VLayerProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { user, handleLogOut } = useDynamicContext();

  const [isReady, setIsReady] = useState(false);
  const [userAddress, setUserAddress] = useState<`0x${string}` | undefined>();
  const [loading, setLoading] = useState(false);
  const [lastProof, setLastProof] = useState<Proof | undefined>();
  const [lastResult, setLastResult] = useState<unknown | undefined>();
  const [error, setError] = useState<string | undefined>();

  const mounted = useRef(true);

  // detectar dirección del usuario desde Dynamic (según tu shape actual)
  useEffect(() => {
    mounted.current = true;
    const addr = user?.verifiedCredentials?.[0]?.address as `0x${string}` | undefined;
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
    } catch (_) {
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
        gasLimit = GAS_LIMIT,
      } = params;

      if (!proverAddress) throw new Error('Falta NEXT_PUBLIC_TIMETRAVEL_PROVER_ADDRESS');
      if (!functionName) throw new Error('functionName requerido');
      if (!proverAbi) throw new Error('proverAbi requerido');

      const caller = (address ?? userAddress) as `0x${string}` | undefined;
      if (!caller) throw new Error('No hay address (ni del usuario ni por parámetro)');

      setLoading(true);
      setError(undefined);
      
      try {
        const proofHash = await vlayerClient.prove({
          address: proverAddress,
          proverAbi,
          functionName,
          args: [...args],
          chainId,
        });

        // Podés devolver el hash directamente o esperar acá el resultado:
        // yo devuelvo el hash y dejo que el consumidor llame a waitForResult.
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
  const waitForResult = useCallback(async (hash: string): Promise<unknown> => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await vlayerClient.waitForProvingResult({ hash });
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
    async (owner?: `0x${string}`): Promise<AverageBalanceResult> => {
      const target = (owner ?? userAddress) as `0x${string}` | undefined;
      if (!target) throw new Error('No hay owner/address para calcular el average balance');

      // 1) Pedimos el PROVE
      const proofHash = (await prove({
        address: target,
        proverAbi: AVERAGE_BALANCE_ABI,
        functionName: 'averageBalanceOf',
        args: [target],
      })) as string;

      // 2) Esperamos el resultado
      const result: any = await waitForResult(proofHash);

      // basándome en tu ejemplo: result[2] = avgBalance
      // si cambia el layout, ajustá este parseo
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
