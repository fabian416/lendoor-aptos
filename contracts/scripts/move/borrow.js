require("dotenv").config();
const { execSync } = require("node:child_process");
const aptosSDK = require("@aptos-labs/ts-sdk");

// ===== helpers =====
function need(k){ const v=process.env[k]; if(!v) throw new Error(`Missing ${k}`); return v.replace(/^"|"$/g,""); }
function run(cmd){ console.log(`\n$ ${cmd}\n`); execSync(cmd, { stdio: "inherit" }); }
function runCapture(cmd){ return execSync(cmd, { stdio: ["ignore","pipe","pipe"] }).toString("utf8"); }
function viewJSON(cmd){
  try { return JSON.parse(runCapture(cmd)); }
  catch(e){ return { Error: String(e?.stderr || e?.stdout || e?.message || e) }; }
}
function runOk(cmd, ignoreSubstrings = []) {
  try { run(cmd); return true; }
  catch (e) {
    const msg = String(e?.stderr || e?.stdout || e?.message || e);
    if (ignoreSubstrings.some(s => msg.includes(s))) {
      console.log("ℹ️  Ignorando error esperado/idempotente:", ignoreSubstrings.find(s=>msg.includes(s)));
      return false;
    }
    throw e;
  }
}
function toU64(amountStr, decimals){
  if (!/^\d+(\.\d+)?$/.test(amountStr)) throw new Error(`Monto inválido: ${amountStr}`);
  const [i, f=""] = amountStr.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const big = BigInt(i + frac);
  if (big > BigInt("18446744073709551615")) throw new Error("Overflow u64");
  return big.toString();
}
function hexFromUtf8(s){ return "0x" + Buffer.from(s, "utf8").toString("hex"); }

(function main(){
  const url          = aptosSDK.NetworkToNodeAPI[need("VITE_APP_NETWORK")];
  const pkgAddr      = need("VITE_LENDOOR_ADDRESS");
  const adminAddr    = need("VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS");
  const adminKey     = need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY");
  const faObj        = need("VITE_FA_METADATA_OBJECT");

  // Prestatario: por defecto el publisher (podés override con WALLET_*)
  const borrowerAddr = (process.env.WALLET_ADDRESS || adminAddr).replace(/^"|"$/g,"");
  const borrowerKey  = (process.env.WALLET_PRIVATE_KEY || adminKey).replace(/^"|"$/g,"");

  // Decimales del subyacente (WUSDC); override con VITE_WUSDC_DECIMALS si hace falta
  const DECIMALS = parseInt(process.env.VITE_WUSDC_DECIMALS || "6", 10);

  // Tipo del activo que usa la reserve
  const TYPE_WUSDC = `${pkgAddr}::wusdc::WUSDC`;

  // ===== CLI =====
  // node scripts/move/set_line_and_borrow_fa.js  amount  [score]  [limitHuman]  [profile]
  // ej: node scripts/move/set_line_and_borrow_fa.js 1.25 180 2.50 main
  const [,, amountHuman="1", scoreStr="180", limitHuman="", profileName="main"] = process.argv;
  const amountU64 = toU64(String(amountHuman), DECIMALS);
  const scoreU8   = Math.max(0, Math.min(255, parseInt(scoreStr, 10) || 0));
  const limitHumanEff = limitHuman ? String(limitHuman) : String(Number(amountHuman) * 2); // margen 2×
  const limitU64 = toU64(limitHumanEff, DECIMALS);
  const profileHex = hexFromUtf8(profileName); // "main" -> 0x6d61696e

  console.log(`Borrower: ${borrowerAddr}`);
  console.log(`Borrow FA: ${amountHuman} (u64=${amountU64})  score=${scoreU8}  limit=${limitHumanEff}  profile="${profileName}"`);

  // ===== 0) Sanity: wrapper FA listo para WUSDC
  const ready = viewJSON(
    `aptos move view --function-id ${pkgAddr}::fa_to_coin_wrapper::is_ready --type-args ${TYPE_WUSDC} --url ${url}`
  );
  if (!ready?.Result?.[0]) {
    console.error("✗ Wrapper FA no está listo para WUSDC. Corre init_wrapper_* + init_wrapper_coin_addr primero.");
    process.exit(1);
  }

  // ===== 1) Idempotente: init credit_manager + init_scores
  runOk(
    `aptos move run --function-id ${pkgAddr}::credit_manager::init ` +
    `--assume-yes --url ${url} --private-key ${adminKey}`,
    [
      "Failed to move resource into", // ya existe GlobalCredit
    ]
  );
  runOk(
    `aptos move run --function-id ${pkgAddr}::credit_manager::init_scores ` +
    `--assume-yes --url ${url} --private-key ${adminKey}`,
    [
      "Failed to move resource into", // ya existe ScoreBook
    ]
  );

  // ===== 2) Setea (o actualiza) score + límite del borrower
  run(
    `aptos move run --function-id ${pkgAddr}::credit_manager::admin_set_line ` +
    `--type-args ${TYPE_WUSDC} ` +
    `--args address:${borrowerAddr} u8:${scoreU8} u64:${limitU64} ` +
    `--assume-yes --url ${url} --private-key ${adminKey}`
  );

  // ===== 3) Chequea liquidez en la reserve
  const state = viewJSON(
    `aptos move view --function-id ${pkgAddr}::reserve::reserve_state ` +
    `--type-args ${TYPE_WUSDC} --url ${url}`
  );
  const cash = BigInt(state?.Result?.[0]?.total_cash_available ?? "0");
  if (cash < BigInt(amountU64)) {
    console.error(`✗ Liquidez insuficiente en la reserve. total_cash_available=${cash} < amount=${amountU64}`);
    process.exit(1);
  }

  // ===== 4) PRE: balance FA del borrower
  console.log("\n=== PRE-ESTADO ===");
  const faBalBefore = viewJSON(
    `aptos move view --json --function-id 0x1::fungible_asset::balance ` +
    `--args address:${borrowerAddr} object:${faObj} --url ${url}`
  );
  console.log("FA balance (antes):", faBalBefore?.Result?.[0] ?? faBalBefore);

  // ===== 5) BORROW FA
  run(
    `aptos move run --function-id ${pkgAddr}::controller::borrow_fa ` +
    `--type-args ${TYPE_WUSDC} ` +
    `--args ${profileHex} u64:${amountU64} ` +
    `--assume-yes --url ${url} --private-key ${borrowerKey}`
  );

  // ===== 6) POST: balance FA + estado
  console.log("\n=== POST-ESTADO ===");
  const faBalAfter = viewJSON(
    `aptos move view --json --function-id 0x1::fungible_asset::balance ` +
    `--args address:${borrowerAddr} object:${faObj} --url ${url}`
  );
  console.log("FA balance (después):", faBalAfter?.Result?.[0] ?? faBalAfter);

  const state2 = viewJSON(
    `aptos move view --function-id ${pkgAddr}::reserve::reserve_state ` +
    `--type-args ${TYPE_WUSDC} --url ${url}`
  );
  console.log("reserve_state:", JSON.stringify(state2?.Result?.[0], null, 2));
})();