require("dotenv").config();
const { execSync } = require("node:child_process");
const aptosSDK = require("@aptos-labs/ts-sdk");

// === utils ===
function need(k){ const v=process.env[k]; if(!v) throw new Error(`Missing ${k}`); return v.replace(/^"|"$/g,""); }
function run(cmd){ console.log(`\n$ ${cmd}\n`); execSync(cmd, { stdio: "inherit" }); }
function hexFromUtf8(s){ return "0x" + Buffer.from(s, "utf8").toString("hex"); }

// === parámetros ===
// NOTA: Para depositar desde OTRA cuenta (no la del admin), usa las variables DEPOSITOR_*.
const url           = aptosSDK.NetworkToNodeAPI[need("VITE_APP_NETWORK")];
const pkgAddr       = need("VITE_LENDOOR_ADDRESS");
const depositorAddr = process.env.DEPOSITOR_ADDRESS || need("VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS");
const depositorKey  = process.env.DEPOSITOR_PRIVATE_KEY || need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY");

// Tipo del Coin (WUSDC) que ya emparejaste
const TYPE_WUSDC = `${pkgAddr}::wusdc::WUSDC`;

// ---- CONFIGURA AQUÍ TU DEPÓSITO ----
const PROFILE_NAME = process.env.DEPOSIT_PROFILE || "main";
// Cantidad en unidades mínimas del FA (si tu FA tiene 6 decimales y quieres 25 USDC => 25_000_000)
const AMOUNT_BASE_UNITS = process.env.DEPOSIT_AMOUNT || "1000000"; // 1.000.000 = 1.0 si 6 decimales

(async function main(){
  // 1) (Opcional) chequear wrapper listo
  run(`aptos move view --function-id ${pkgAddr}::fa_to_coin_wrapper::is_ready --type-args ${TYPE_WUSDC} --url ${url}`);

  // 2) Ejecutar depósito con FA (profile_name en hex)
  const profileHex = hexFromUtf8(PROFILE_NAME);
  run(
    `aptos move run --function-id ${pkgAddr}::controller::deposit_fa ` +
    `--type-args ${TYPE_WUSDC} ` +
    `--args hex:${profileHex} u64:${AMOUNT_BASE_UNITS} ` +
    `--assume-yes --url ${url} --private-key ${depositorKey}`
  );

  // 3) Verificar estado de la reserve
  run(`aptos move view --function-id ${pkgAddr}::reserve::reserve_state --type-args ${TYPE_WUSDC} --url ${url}`);
})();