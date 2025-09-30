"use client";
import { PropsWithChildren, createContext, useContext, useMemo, useCallback, useEffect } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { MoveValue, EntryFunctionArgumentTypes, SimpleEntryFunctionArgumentTypes } from "@aptos-labs/ts-sdk";
import { useAptos } from "@/providers/WalletProvider";
import { LENDOOR_CONTRACT, LENDOOR_MODULE } from "@/lib/constants";
import { FQName, toFQName } from "@/types/aptos";

type ViewArgs = (EntryFunctionArgumentTypes | SimpleEntryFunctionArgumentTypes)[];
type EntryArgs = unknown[];

type CallView = <T extends MoveValue[] = MoveValue[]>(
  fn: string,
  typeArgs?: string[],
  args?: ViewArgs
) => Promise<T>;

type EntryFn = (
  fn: string,
  typeArgs?: string[],
  args?: EntryArgs,
  opts?: { checkSuccess?: boolean }
) => Promise<string>;

type Ctx = {
  moduleAddress: `0x${string}`;
  moduleName: string;
  callView: CallView;
  entry: EntryFn;
};

const MoveModuleCtx = createContext<Ctx | null>(null);

export function MoveModuleProvider({ children, moduleAddress, moduleName }: PropsWithChildren<{
  moduleAddress?: `0x${string}`;
  moduleName?: string;
}>) {
  const { aptos } = useAptos();
  const { account, signAndSubmitTransaction } = useWallet();

  const addr: `0x${string}` = moduleAddress ?? LENDOOR_CONTRACT;
  const name = moduleName ?? LENDOOR_MODULE;

  useEffect(() => {
    (async () => {
      try {
        await aptos.getAccountModule({ accountAddress: addr, moduleName: name });
      } catch (e) {
        console.warn(`Module not found at ${addr}::${name}. Check VITE_LENDOOR_ADDRESS / VITE_LENDOOR_MODULE.`, e);
      }
    })();
  }, [aptos, addr, name]);

  const callView: CallView = useCallback(
    async <T extends MoveValue[] = MoveValue[]>(
      fn: string,
      typeArguments: string[] = [],
      functionArguments: ViewArgs = []
    ) => {
      // Ensure the function is fully-qualified and typed as FQName
      const fq: FQName = toFQName(addr, name, fn);
      return aptos.view<T>({
        payload: {
          function: fq,                 // ← satisfies `${string}::${string}::${string}`
          typeArguments,
          functionArguments,
        },
      });
    },
    [aptos, addr, name]
  );

  const entry: EntryFn = useCallback(
    async (fn, typeArguments = [], functionArguments: EntryArgs = [], opts) => {
      if (!account) throw new Error("Connect a wallet first");
      const fq: FQName = toFQName(addr, name, fn);

      const pending = await signAndSubmitTransaction({
        data: {
          function: fq,                 // ← same fix here
          typeArguments,
          functionArguments: functionArguments as EntryFunctionArgumentTypes[],
        },
      });

      if (opts?.checkSuccess !== false) {
        await aptos.waitForTransaction({ transactionHash: pending.hash });
      }
      return pending.hash;
    },
    [account, signAndSubmitTransaction, aptos, addr, name]
  );

  const value: Ctx = useMemo(
    () => ({ moduleAddress: addr, moduleName: name, callView, entry }),
    [addr, name, callView, entry]
  );

  return <MoveModuleCtx.Provider value={value}>{children}</MoveModuleCtx.Provider>;
}

export function useMoveModule() {
  const ctx = useContext(MoveModuleCtx);
  if (!ctx) throw new Error("useMoveModule must be used within <MoveModuleProvider>");
  return ctx;
}