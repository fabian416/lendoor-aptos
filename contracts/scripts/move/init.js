require("dotenv").config();
const { execSync } = require("node:child_process");
const aptosSDK = require("@aptos-labs/ts-sdk");

// ==== utils ====
function need(k) {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v.replace(/^"|"$/g, "");
}
function run(cmd) {
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit" });
}
function runCapture(cmd) {
  const out = execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] });
  return out.toString("utf8");
}
function viewBool({ fn, typeArgs = [], args = [], url }) {
  let cmd = `aptos move view --function-id ${fn}`;
  if (typeArgs.length) cmd += ` --type-args ${typeArgs.join(" ")}`;
  if (args.length) cmd += ` --args ${args.join(" ")}`;
  cmd += ` --url ${url}`;
  const raw = runCapture(cmd);
  const json = JSON.parse(raw);
  return json?.Result?.[0] === true;
}
function hexFromUtf8(s) {
  return "0x" + Buffer.from(s, "utf8").toString("hex");
}

(async function main() {
  const url       = aptosSDK.NetworkToNodeAPI[need("VITE_APP_NETWORK")];
  const adminAddr = need("VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS");
  const adminKey  = need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY");
  const pkgAddr   = need("VITE_LENDOOR_ADDRESS");
  const faMetaObj = need("VITE_FA_METADATA_OBJECT");

  const TYPE_WUSDC = `${pkgAddr}::wusdc::WUSDC`;

  // ========= 1) ControllerConfig (idempotente) =========
  // ¿ya existe config bajo la dirección del admin?
  const cfgExists = viewBool({
    fn: `${pkgAddr}::controller_config::config_present_at`,
    args: [`address:${adminAddr}`],
    url,
  });

  if (!cfgExists) {
    run(
      `aptos move run --function-id ${pkgAddr}::controller::init ` +
      `--args address:${adminAddr} --assume-yes --url ${url} --private-key ${adminKey}`
    );
  } else {
    console.log("ℹ️  controller_config ya existía. Saltando init.");
  }

  // ========= 2) Resource account del wrapper (idempotente) =========
  // Si ya existe, lo saltamos. Si no, lo creamos con una seed única.
  const signerExists = viewBool({
    fn: `${pkgAddr}::fa_to_coin_wrapper::fa_signer_exists`,
    url,
  });

  if (!signerExists) {
    // usa seed nueva para evitar ERESOURCE_ACCCOUNT_EXISTS
    const seed = hexFromUtf8(`FASigner_${Date.now()}`);
    run(
      `aptos move run --function-id ${pkgAddr}::controller::init_wrapper_fa_signer_with_seed ` +
      `--args hex:${seed} --assume-yes --url ${url} --private-key ${adminKey}`
    );
  } else {
    console.log("ℹ️  FASigner ya existía. Saltando creación del resource account.");
  }

  // ========= 3) Emparejar FA <-> WUSDC (idempotente) =========
  const wrappedExists = viewBool({
    fn: `${pkgAddr}::fa_to_coin_wrapper::is_fa_wrapped_coin`,
    typeArgs: [TYPE_WUSDC],
    url,
  });

  if (!wrappedExists) {
    run(
      `aptos move run --function-id ${pkgAddr}::controller::init_wrapper_coin_addr ` +
      `--type-args ${TYPE_WUSDC} ` +
      `--args address:${faMetaObj} ` +
      `--assume-yes --url ${url} --private-key ${adminKey}`
    );
  } else {
    console.log("ℹ️  WUSDC ya estaba inicializado en el wrapper. Saltando add_fa.");
  }

  // ========= 4) Crear la Reserve (idempotente si tu módulo reserve tiene exists_for) =========
  // Si tu módulo reserve expone exists_for<Coin0>(), úsalo:
  let reserveExists = false;
  try {
    reserveExists = viewBool({
      fn: `${pkgAddr}::reserve::exists_for`,
      typeArgs: [TYPE_WUSDC],
      url,
    });
  } catch (e) {
    // si no existe la view, lo dejamos en false y se intentará crear
  }

  if (!reserveExists) {
    run(
      `aptos move run --function-id ${pkgAddr}::controller::add_reserve ` +
      `--type-args ${TYPE_WUSDC} --assume-yes --url ${url} --private-key ${adminKey}`
    );
  } else {
    console.log("ℹ️  La reserve de WUSDC ya existe. Saltando creación.");
  }

  // ========= 5) Verificaciones =========
  run(
    `aptos move view --function-id ${pkgAddr}::fa_to_coin_wrapper::is_ready ` +
    `--type-args ${TYPE_WUSDC} --url ${url}`
  );
  // si reserve_state aborta cuando no existe, esta llamada te ayuda a confirmarlo
  try {
    run(
      `aptos move view --function-id ${pkgAddr}::reserve::reserve_state ` +
      `--type-args ${TYPE_WUSDC} --url ${url}`
    );
  } catch (e) {
    console.log("⚠️  reserve_state aún no disponible (probablemente no existe la reserve o la view aborta).");
  }
})();