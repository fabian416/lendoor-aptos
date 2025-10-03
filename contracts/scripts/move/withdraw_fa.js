require("dotenv").config();
const { execSync } = require("node:child_process");
const aptosSDK = require("@aptos-labs/ts-sdk");

// ===== helpers =====
function need(k){ const v=process.env[k]; if(!v) throw new Error(`Missing ${k}`); return v.replace(/^"|"$/g,""); }
function run(cmd){ console.log(`\n$ ${cmd}\n`); execSync(cmd, { stdio: "inherit" }); }
function runCapture(cmd){ return execSync(cmd, { stdio: ["ignore","pipe","pipe"] }).toString("utf8"); }
function viewJSON(cmd){ return JSON.parse(runCapture(cmd)); }

function toU64(amountStr, decimals){
  // supports "12.34" -> u64 with 'decimals'
  if (!/^\d+(\.\d+)?$/.test(amountStr)) throw new Error(`Invalid amount: ${amountStr}`);
  const [i, f=""] = amountStr.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const big = BigInt(i + frac);
  if (big > BigInt("18446744073709551615")) throw new Error("Overflow u64");
  return big.toString();
}
const hexFromUtf8 = (s) => "0x" + Buffer.from(String(s), "utf8").toString("hex");

(function main(){
  const url       = aptosSDK.NetworkToNodeAPI[need("VITE_APP_NETWORK")];
  const pkgAddr   = need("VITE_LENDOOR_ADDRESS");
  const faMetaObj = need("VITE_FA_METADATA_OBJECT");

  // Signer: defaults to the publisher; you can override with WALLET_*
  const signerAddr = (process.env.WALLET_ADDRESS || need("VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS")).replace(/^"|"$/g,"");
  const signerKey  = (process.env.WALLET_PRIVATE_KEY || need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY")).replace(/^"|"$/g,"");

  // Decimals of the underlying asset (USDC ~ 6). Allows override via env
  const DECIMALS = parseInt(process.env.VITE_WUSDC_DECIMALS || "6", 10);

  const TYPE_WUSDC     = `${pkgAddr}::wusdc::WUSDC`;
  const TYPE_LP_WUSDC  = `${pkgAddr}::reserve::LP<${TYPE_WUSDC}>`;
  const faObj = need("VITE_FA_METADATA_OBJECT");

  // ===== CLI =====
  // node scripts/move/withdraw_fa.js AMOUNT allowBorrow profile
  // ex: node scripts/move/withdraw_fa.js 1 false main
  const [,, amountHuman="1", allowBorrowStr="false", profile="main"] = process.argv;
  const allowBorrow = /^(true|1|yes)$/i.test(allowBorrowStr);
  const amountU64   = toU64(String(amountHuman), DECIMALS);
  const profileHex  = hexFromUtf8(profile);

  console.log(`Signer: ${signerAddr}`);
  console.log(`Withdraw FA: ${amountHuman} (u64=${amountU64})  allowBorrow=${allowBorrow}  profile="${profile}"`);

  // ===== PRE =====
  console.log("\n=== PRE-STATE ===");
  try {
    const faBal = viewJSON(
      `aptos move view --function-id 0x1::fungible_asset::balance ` +
      `--args address:${signerAddr} object:${faObj} --url ${url}`
    );
    console.log("FA balance (raw):", faBal?.Result?.[0] ?? faBal);
    // Optional: show human-readable with 6 decimals
    const dec = parseInt(process.env.VITE_WUSDC_DECIMALS || "6", 10);
    const v = BigInt(faBal?.Result?.[0] || "0");
    console.log("FA balance (human):", Number(v) / 10**dec);
  } catch (e) {
    console.log("Could not read FA balance:", e?.message || e);
  }
  try {
    const balLP = viewJSON(
      `aptos move view --function-id 0x1::coin::balance ` +
      `--type-args '${TYPE_LP_WUSDC}' --args address:${signerAddr} --url ${url}`
    );
    console.log("LP<WUSDC> balance:", balLP?.Result?.[0] ?? balLP);
  } catch(e){ console.log("Could not read LP balance (do you have any yet?)."); }

  try {
    const state = viewJSON(
      `aptos move view --function-id ${pkgAddr}::reserve::reserve_state --type-args ${TYPE_WUSDC} --url ${url}`
    );
    console.log("reserve_state:", JSON.stringify(state?.Result?.[0], null, 2));
  } catch(e){ console.log("Could not read reserve_state."); }

  // ===== WITHDRAW to FA =====
  // Requires that controller::withdraw_fa<Coin>(profile, amount, allowBorrow) exists
  run(
    `aptos move run --function-id ${pkgAddr}::controller::withdraw_fa ` +
    `--type-args ${TYPE_WUSDC} ` +
    `--args hex:${profileHex} u64:${amountU64} bool:${allowBorrow} ` +
    `--assume-yes --url ${url} --private-key ${signerKey}`
  );

  // ===== POST =====
  console.log("\n=== POST-STATE ===");
  try {
    const balFA2 = viewJSON(
      `aptos move view --function-id 0x1::fungible_asset::balance ` +
      `--args address:${signerAddr} address:${faMetaObj} --url ${url}`
    );
    console.log("FA balance:", balFA2?.Result?.[0] ?? balFA2);
  } catch(e){}

  try {
    const balLP2 = viewJSON(
      `aptos move view --function-id 0x1::coin::balance ` +
      `--type-args '${TYPE_LP_WUSDC}' --args address:${signerAddr} --url ${url}`
    );
    console.log("LP<WUSDC> balance:", balLP2?.Result?.[0] ?? balLP2);
  } catch(e){}

  try {
    const state2 = viewJSON(
      `aptos move view --function-id ${pkgAddr}::reserve::reserve_state --type-args ${TYPE_WUSDC} --url ${url}`
    );
    console.log("reserve_state:", JSON.stringify(state2?.Result?.[0], null, 2));
  } catch(e){}
})();