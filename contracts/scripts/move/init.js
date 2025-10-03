require("dotenv").config();
const { execSync } = require("node:child_process");
const aptosSDK = require("@aptos-labs/ts-sdk");

// ==== utils ====
function need(k){ const v=process.env[k]; if(!v) throw new Error(`Missing ${k}`); return v.replace(/^"|"$/g,""); }
function run(cmd){ console.log(`\n$ ${cmd}\n`); execSync(cmd, { stdio: "inherit" }); }
function runOk(cmd, ignoreSubstrings = []) {
  try { run(cmd); return true; }
  catch (e) {
    const msg = String((e.stderr || e.stdout || e.message || e) ?? "");
    if (ignoreSubstrings.some(s => msg.includes(s))) {
      console.log("ℹ️  Ignoring expected/idempotent error:", ignoreSubstrings.find(s=>msg.includes(s)));
      return false;
    }
    throw e;
  }
}
function runCapture(cmd){ const out = execSync(cmd, { stdio: ["ignore","pipe","pipe"] }); return out.toString("utf8"); }
function viewBool({ fn, typeArgs=[], args=[], url }){
  let cmd = `aptos move view --function-id ${fn}`;
  if (typeArgs.length) cmd += ` --type-args ${typeArgs.join(" ")}`;
  if (args.length) cmd += ` --args ${args.join(" ")}`;
  cmd += ` --url ${url}`;
  const raw = runCapture(cmd);
  const json = JSON.parse(raw);
  return json?.Result?.[0] === true;
}
function hexFromUtf8(s){ return "0x" + Buffer.from(s, "utf8").toString("hex"); }

(async function main(){
  const url       = aptosSDK.NetworkToNodeAPI[need("VITE_APP_NETWORK")];
  const adminAddr = need("VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS");
  const adminKey  = need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY");
  const pkgAddr   = need("VITE_LENDOOR_ADDRESS");
  const faMetaObj = need("VITE_FA_METADATA_OBJECT");
  const juniorBps = parseInt(process.env.VITE_JUNIOR_BPS || "2000", 10); // 20% by default

  const TYPE_WUSDC = `${pkgAddr}::wusdc::WUSDC`;

  // ========= 1) ControllerConfig (idempotent) =========
  const cfgExists = viewBool({
    fn: `${pkgAddr}::controller_config::config_present_at`,
    args: [`address:${adminAddr}`],
    url,
  });
  if (!cfgExists) {
    run(`aptos move run --function-id ${pkgAddr}::controller::init --args address:${adminAddr} --assume-yes --url ${url} --private-key ${adminKey}`);
  } else {
    console.log("ℹ️  controller_config already existed. Skipping init.");
  }

  // ========= 2) FASigner (idempotent with unique seed) =========
  const signerExists = viewBool({ fn: `${pkgAddr}::fa_to_coin_wrapper::fa_signer_exists`, url });
  if (!signerExists) {
    const seed = hexFromUtf8(`FASigner_${Date.now()}`);
    run(`aptos move run --function-id ${pkgAddr}::controller::init_wrapper_fa_signer_with_seed --args hex:${seed} --assume-yes --url ${url} --private-key ${adminKey}`);
  } else {
    console.log("ℹ️  FASigner already existed. Skipping resource account creation.");
  }

  // ========= 3) Pair FA <-> WUSDC (idempotent) =========
  const wrappedExists = viewBool({
    fn: `${pkgAddr}::fa_to_coin_wrapper::is_fa_wrapped_coin`,
    typeArgs: [TYPE_WUSDC],
    url,
  });
  if (!wrappedExists) {
    run(`aptos move run --function-id ${pkgAddr}::controller::init_wrapper_coin_addr --type-args ${TYPE_WUSDC} --args address:${faMetaObj} --assume-yes --url ${url} --private-key ${adminKey}`);
  } else {
    console.log("ℹ️  WUSDC was already initialized in the wrapper. Skipping add_fa.");
  }

  // ========= 4) Reserves singleton (once) =========
  // Make sure reserve::init is an 'entry' in your module.
  runOk(
    `aptos move run --function-id ${pkgAddr}::reserve::init --assume-yes --url ${url} --private-key ${adminKey}`,
    [
      "ERESERVE_ALREADY_EXIST",
      "Failed to move resource into",                 // resource already exists
      "EXECUTE_ENTRY_FUNCTION_CALLED_ON_NON_ENTRY_FUNCTION" // if you haven't made it an entry function yet, it will notify you
    ]
  );

  // ========= 5) tranche_config (create map once) =========
  runOk(
    `aptos move run --function-id ${pkgAddr}::tranche_config::init --assume-yes --url ${url} --private-key ${adminKey}`,
    ["Failed to move resource into"]
  );

  // ========= 6) Set junior split (bps) for WUSDC =========
  // NOTE: the function is called set_for (not set_for_coin). You can re-run it: it overwrites.
  run(`aptos move run --function-id ${pkgAddr}::tranche_config::set_for --type-args ${TYPE_WUSDC} --args address:${adminAddr} u16:${juniorBps} --assume-yes --url ${url} --private-key ${adminKey}`);

  // ========= 7) Create the WUSDC Reserve =========
  let reserveExists = false;
  try {
    reserveExists = viewBool({ fn: `${pkgAddr}::reserve::exists_for`, typeArgs: [TYPE_WUSDC], url });
  } catch {}
  if (!reserveExists) {
    run(`aptos move run --function-id ${pkgAddr}::controller::add_reserve --type-args ${TYPE_WUSDC} --assume-yes --url ${url} --private-key ${adminKey}`);
  } else {
    console.log("ℹ️  The WUSDC reserve already exists. Skipping creation.");
  }

  // ========= 8) Junior vault for WUSDC (after add_reserve) =========
  runOk(
    `aptos move run --function-id ${pkgAddr}::junior::init_for --type-args ${TYPE_WUSDC} --assume-yes --url ${url} --private-key ${adminKey}`,
    ["Failed to move resource into"] // if JVault<Coin0> already exists
  );

  // ========= 9) Verifications =========
  run(`aptos move view --function-id ${pkgAddr}::fa_to_coin_wrapper::is_ready --type-args ${TYPE_WUSDC} --url ${url}`);
  try {
    run(`aptos move view --function-id ${pkgAddr}::reserve::reserve_state --type-args ${TYPE_WUSDC} --url ${url}`);
  } catch {
    console.log("⚠️  reserve_state not yet available (if it aborts, check that add_reserve has passed).");
  }
})();