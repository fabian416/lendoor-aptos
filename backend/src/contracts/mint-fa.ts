// src/contracts/mint-fa.ts
import { AccountAddress } from "@aptos-labs/ts-sdk";
import {
  getAptos,
  getAdmin,
  signSubmitWait,
  parseUnitsAptos,
  toU64,
  asArg,
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

  const out = await aptos.view({
    payload: {
      function: `${moduleAddress}::launchpad::get_fa_object_metadata`,
      // For views, string address is fine
      functionArguments: [faObject],
    },
  });

  const triple = normalizeTriple(out);
  if (!triple) throw new Error(`Invalid FA metadata view response: ${JSON.stringify(out)}`);

  const [symbol, name, decimals] = triple;
  if (!Number.isFinite(decimals) || decimals < 0 || decimals > 38) {
    throw new Error(`Invalid decimals: ${decimals}`);
  }
  return { symbol, name, decimals, moduleAddress, faObject };
}

export async function getFaDecimals(params?: { moduleAddress?: string; faObject?: string }) {
  const { decimals } = await getFaMetadataTriple(params);
  return decimals;
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
      if (res.length === 1 && (typeof res[0] === "string" || typeof res[0] === "number" || typeof res[0] === "bigint")) {
        return BigInt(res[0] as any);
      }
      if (Array.isArray(res[0]) && (res[0] as any[]).length === 1) {
        return BigInt((res[0] as any[])[0]);
      }
    }
  } catch {
    // optional view
  }
  return null;
}

/* Mint (no generics) */
export async function mintFA(opts: {
  amountHuman?: string;
  amountSmallest?: bigint;
  decimals?: number;
  moduleAddress?: string;
  faObject?: string;
}) {
  const admin = getAdmin();
  const moduleAddress = opts.moduleAddress || getModuleAddress();
  const faObject = opts.faObject || getFaObject();

  const decimals =
    typeof opts.decimals === "number"
      ? opts.decimals
      : await getFaDecimals({ moduleAddress, faObject });

  let amountSmallest: bigint;
  if (opts.amountSmallest != null) {
    amountSmallest = BigInt(opts.amountSmallest);
  } else if (opts.amountHuman) {
    amountSmallest = parseUnitsAptos(String(opts.amountHuman), decimals);
  } else {
    throw new Error("Provide amountHuman or amountSmallest");
  }

  await getMintFeeSmallest({ amountSmallest, moduleAddress, faObject }).catch(() => null);

  const hash = await signSubmitWait({
    signer: admin,
    func: `${moduleAddress}::launchpad::mint_fa` as FQName,
    // For entry functions, cast to EntryFunctionArgumentTypes
    functionArguments: [asArg(faObject), asArg(toU64(amountSmallest))],
  });

  return { hash, moduleAddress, faObject, decimals, amountSmallest };
}

/* Transfer (no generics) */
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
