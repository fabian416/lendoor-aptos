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
      console.log("ℹ️  Ignorando error esperado/idempotente:", ignoreSubstrings.find(s=>msg.includes(s)));
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
  const juniorBps = parseInt(process.env.VITE_JUNIOR_BPS || "2000", 10); // 20% por defecto

  const TYPE_WUSDC = `${pkgAddr}::wusdc::WUSDC`;

  // ========= 1) ControllerConfig (idempotente) =========
  const cfgExists = viewBool({
    fn: `${pkgAddr}::controller_config::config_present_at`,
    args: [`address:${adminAddr}`],
    url,
  });
  if (!cfgExists) {
    run(`aptos move run --function-id ${pkgAddr}::controller::init --args address:${adminAddr} --assume-yes --url ${url} --private-key ${adminKey}`);
  } else {
    console.log("ℹ️  controller_config ya existía. Saltando init.");
  }

  // ========= 2) FASigner (idempotente con seed única) =========
  const signerExists = viewBool({ fn: `${pkgAddr}::fa_to_coin_wrapper::fa_signer_exists`, url });
  if (!signerExists) {
    const seed = hexFromUtf8(`FASigner_${Date.now()}`);
    run(`aptos move run --function-id ${pkgAddr}::controller::init_wrapper_fa_signer_with_seed --args hex:${seed} --assume-yes --url ${url} --private-key ${adminKey}`);
  } else {
    console.log("ℹ️  FASigner ya existía. Saltando creación del resource account.");
  }

  // ========= 3) Pair FA <-> WUSDC (idempotente) =========
  const wrappedExists = viewBool({
    fn: `${pkgAddr}::fa_to_coin_wrapper::is_fa_wrapped_coin`,
    typeArgs: [TYPE_WUSDC],
    url,
  });
  if (!wrappedExists) {
    run(`aptos move run --function-id ${pkgAddr}::controller::init_wrapper_coin_addr --type-args ${TYPE_WUSDC} --args address:${faMetaObj} --assume-yes --url ${url} --private-key ${adminKey}`);
  } else {
    console.log("ℹ️  WUSDC ya estaba inicializado en el wrapper. Saltando add_fa.");
  }

  // ========= 4) Reserves singleton (una sola vez) =========
  // Asegúrate de que reserve::init sea 'entry' en tu módulo.
  runOk(
    `aptos move run --function-id ${pkgAddr}::reserve::init --assume-yes --url ${url} --private-key ${adminKey}`,
    [
      "ERESERVE_ALREADY_EXIST",
      "Failed to move resource into",                 // recurso ya existe
      "EXECUTE_ENTRY_FUNCTION_CALLED_ON_NON_ENTRY_FUNCTION" // si aún no lo hiciste entry, te avisará
    ]
  );

  // ========= 5) tranche_config (crear mapa una vez) =========
  runOk(
    `aptos move run --function-id ${pkgAddr}::tranche_config::init --assume-yes --url ${url} --private-key ${adminKey}`,
    ["Failed to move resource into"]
  );

  // ========= 6) Set split junior (bps) para WUSDC =========
  // OJO: función se llama set_for (no set_for_coin). Puedes re-ejecutarla: sobreescribe.
  run(`aptos move run --function-id ${pkgAddr}::tranche_config::set_for --type-args ${TYPE_WUSDC} --args address:${adminAddr} u16:${juniorBps} --assume-yes --url ${url} --private-key ${adminKey}`);

  // ========= 7) Crear la Reserve de WUSDC =========
  let reserveExists = false;
  try {
    reserveExists = viewBool({ fn: `${pkgAddr}::reserve::exists_for`, typeArgs: [TYPE_WUSDC], url });
  } catch {}
  if (!reserveExists) {
    run(`aptos move run --function-id ${pkgAddr}::controller::add_reserve --type-args ${TYPE_WUSDC} --assume-yes --url ${url} --private-key ${adminKey}`);
  } else {
    console.log("ℹ️  La reserve de WUSDC ya existe. Saltando creación.");
  }

  // ========= 8) Junior vault para WUSDC (después de add_reserve) =========
  runOk(
    `aptos move run --function-id ${pkgAddr}::junior::init_for --type-args ${TYPE_WUSDC} --assume-yes --url ${url} --private-key ${adminKey}`,
    ["Failed to move resource into"] // si ya existe JVault<Coin0>
  );

  // ========= 9) Verificaciones =========
  run(`aptos move view --function-id ${pkgAddr}::fa_to_coin_wrapper::is_ready --type-args ${TYPE_WUSDC} --url ${url}`);
  try {
    run(`aptos move view --function-id ${pkgAddr}::reserve::reserve_state --type-args ${TYPE_WUSDC} --url ${url}`);
  } catch {
    console.log("⚠️  reserve_state aún no disponible (si aborta, revisa que add_reserve haya pasado).");
  }
})();