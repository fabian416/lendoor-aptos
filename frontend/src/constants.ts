import { Network } from "@aptos-labs/ts-sdk";

export const NETWORK: Network =
  (import.meta.env.VITE_APTOS_NETWORK as Network) ?? Network.TESTNET;

export const APTOS_API_KEY =
  (import.meta.env.VITE_APTOS_API_KEY as string) ?? "";