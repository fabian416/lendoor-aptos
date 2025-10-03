require("dotenv").config();
const { execSync } = require("node:child_process");
const aptosSDK = require("@aptos-labs/ts-sdk");

// === utils ===
function need(k){ const v=process.env[k]; if(!v) throw new Error(`Missing ${k}`); return v.replace(/^"|"$/g,""); }
function run(cmd){ console.log(`\n$ ${cmd}\n`); execSync(cmd, { stdio: "inherit" }); }
function hexFromUtf8(s){ return "0x" + Buffer.from(s, "utf8").toString("hex"); }

// === parameters ===
// NOTE: To deposit from ANOTHER account (not the admin's), use the DEPOSITOR_* variables.
const url           = aptosSDK.NetworkToNodeAPI[need("VITE_APP_NETWORK")];
const pkgAddr       = need("VITE_LENDOOR_ADDRESS");
const depositorAddr = process.env.DEPOSITOR_ADDRESS || need("VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS");
const depositorKey  = process.env.DEPOSITOR_PRIVATE_KEY || need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY");

// Type of the Coin (WUSDC) that you have already paired
const TYPE_WUSDC = `${pkgAddr}::wusdc::WUSDC`;

// ---- CONFIGURE YOUR DEPOSIT HERE ----
const PROFILE_NAME = process.env.DEPOSIT_PROFILE || "main";
// Amount in minimum units of the FA (if your FA has 6 decimals and you want 25 USDC => 25_000_000)
const AMOUNT_BASE_UNITS = process.env.DEPOSIT_AMOUNT || "100000000"; // 1,000,000 = 1.0 if 6 decimals

(async function main(){
  // 1) (Optional) check if wrapper is ready
  run(`aptos move view --function-id ${pkgAddr}::fa_to_coin_wrapper::is_ready --type-args ${TYPE_WUSDC} --url ${url}`);

  // 2) Execute deposit with FA (profile_name in hex)
  const profileHex = hexFromUtf8(PROFILE_NAME);
  run(
    `aptos move run --function-id ${pkgAddr}::controller::deposit_fa ` +
    `--type-args ${TYPE_WUSDC} ` +
    `--args hex:${profileHex} u64:${AMOUNT_BASE_UNITS} ` +
    `--assume-yes --url ${url} --private-key ${depositorKey}`
  );

  // 3) Verify the state of the reserve
  run(`aptos move view --function-id ${pkgAddr}::reserve::reserve_state --type-args ${TYPE_WUSDC} --url ${url}`);
})();