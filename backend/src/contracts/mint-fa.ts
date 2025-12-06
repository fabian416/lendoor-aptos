// src/contracts/mint-fa.ts
import { AccountAddress } from "@aptos-labs/ts-sdk";
import {
  getAptos,
  getAdmin,
  signSubmitWait,
  parseUnitsAptos,
  toU64,
  asArg,
  DECIMALS,
} from "./config";

type FQName = `${string}::${string}::${string}`;

/* ENV — publisher address with `module launchpad`, and FA object address */
function getModuleAddress(): string {
  const addr =
    process.env.USDC_MODULE_ADDRESS?.trim() ||
    process.env.VITE_MODULE_ADDRESS?.trim() ||
    "";
  if (!addr) throw new Error("USDC_MODULE_ADDRESS (or VITE_MODULE_ADDRESS) is required.");
  return addr;
}
function getFaObject(): string {
  const addr =
    process.env.VITE_FA_ADDRESS?.trim() ||
    process.env.USDC_ADDRESS?.trim() ||
    process.env.VITE_USDC_ADDRESS?.trim() ||
    "";
  if (!addr) throw new Error("FA object address is required (VITE_FA_ADDRESS / USDC_ADDRESS).");
  return addr;
}

/* Helpers */
function normalizeTriple(out: unknown): [string, string, number] | null {
  if (Array.isArray(out) && out.length === 3) {
    const [sym, name, dec] = out as any[];
    return [String(sym), String(name), Number(dec)];
  }
  if (Array.isArray(out) && Array.isArray(out[0]) && (out[0] as any[]).length === 3) {
    const [sym, name, dec] = out[0] as any[];
    return [String(sym), String(name), Number(dec)];
  }
  return null;
}

/* Views (no generics) */
export async function getFaMetadataTriple(params?: {
  moduleAddress?: string;
  faObject?: string;
}) {
  const aptos = getAptos();
  const moduleAddress = params?.moduleAddress || getModuleAddress();
  const faObject = params?.faObject || getFaObject();

  // Intento leer del view, pero si falla, caigo a fallback con DECIMALS
  try {
    const out = await aptos.view({
      payload: {
        function: `${moduleAddress}::launchpad::get_fa_object_metadata`,
        // For views, string address is fine
        functionArguments: [faObject],
      },
    });

    const triple = normalizeTriple(out);
    if (triple) {
      const [symbol, name, decimals] = triple;
      if (Number.isFinite(decimals) && decimals >= 0 && decimals <= 38) {
        return { symbol, name, decimals, moduleAddress, faObject };
      }
    }
  } catch {
    // ignore y sigo al fallback
  }

  const symbol = "WUSDC";
  const name = "Wrapped USDC";
  const decimals = DECIMALS;
  return { symbol, name, decimals, moduleAddress, faObject };
}

export async function getFaDecimals(params?: { moduleAddress?: string; faObject?: string }) {
  const meta = await getFaMetadataTriple(params);
  return meta.decimals;
}

export async function getMintFeeSmallest(params: {
  amountSmallest: bigint;
  moduleAddress?: string;
  faObject?: string;
}): Promise<bigint | null> {
  const aptos = getAptos();
  const moduleAddress = params.moduleAddress || getModuleAddress();
  const faObject = params.faObject || getFaObject();

  try {
    const res = await aptos.view({
      payload: {
        function: `${moduleAddress}::launchpad::get_mint_fee`,
        // no typeArguments
        functionArguments: [faObject, BigInt(params.amountSmallest)],
      },
    });
    if (Array.isArray(res)) {
      if (
        res.length === 1 &&
        (typeof res[0] === "string" ||
          typeof res[0] === "number" ||
          typeof res[0] === "bigint")
      ) {
        return BigInt(res[0] as any);
      }
      if (Array.isArray(res[0]) && (res[0] as any[]).length === 1) {
        return BigInt((res[0] as any[])[0]);
      }
    }
  } catch {
    // optional view: si falla, devuelvo null y sigo
  }
  return null;
}

/* Mint (no generics) */
/**
 * OJO: ahora `mintFA` **no** manda ninguna tx on-chain.
 * Solo:
 *  - resuelve moduleAddress / faObject
 *  - calcula amountSmallest (usando DECIMALS por defecto)
 * Y devuelve esos datos para que el que realmente "paga" sea `transferFA`
 * desde la private key del admin hacia `to`.
 */
export async function mintFA(opts: {
  amountHuman?: string;
  amountSmallest?: bigint;
  decimals?: number;
  moduleAddress?: string;
  faObject?: string;
}) {
  const moduleAddress = opts.moduleAddress || getModuleAddress();
  const faObject = opts.faObject || getFaObject();

  const decimals =
    typeof opts.decimals === "number"
      ? opts.decimals
      : DECIMALS;

  let amountSmallest: bigint;
  if (opts.amountSmallest != null) {
    amountSmallest = BigInt(opts.amountSmallest);
  } else if (opts.amountHuman) {
    amountSmallest = parseUnitsAptos(String(opts.amountHuman), decimals);
  } else {
    throw new Error("Provide amountHuman or amountSmallest");
  }

  // Mantengo la shape original del return, pero ya no hay mint on-chain
  const hash: string | null = null;

  return { hash, moduleAddress, faObject, decimals, amountSmallest };
}

/* Transfer (no generics) */
/**
 * Este sí es el que hace el trabajo real:
 * firma con el admin (APTOS_PRIVATE_KEY) y transfiere FA al `to`.
 */
export async function transferFA(opts: {
  to: string;
  amountSmallest: bigint;
  faObject?: string;
}) {
  const admin = getAdmin();
  const faObject = opts.faObject || getFaObject();

  const hash = await signSubmitWait({
    signer: admin,
    func: `0x1::primary_fungible_store::transfer` as FQName,
    typeArguments: ["0x1::fungible_asset::Metadata"],
    functionArguments: [
      asArg(faObject),
      asArg(opts.to),
      asArg(toU64(BigInt(opts.amountSmallest))),
    ],
  });

  return { hash };
}
