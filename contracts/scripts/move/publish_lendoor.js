// scripts/move/publish_lendoor.js
require("dotenv").config();
const { execSync } = require("node:child_process");
const aptosSDK = require("@aptos-labs/ts-sdk");
const fs = require("node:fs");

function need(k){
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v.replace(/^"|"$/g, "");
}

function run(cmd){
  console.log(`\n$ ${cmd}\n`);
  execSync(cmd, { stdio: "inherit" });
}

(async function main(){
  const network   = need("VITE_APP_NETWORK");
  const url       = aptosSDK.NetworkToNodeAPI[network];
  const publisher = need("VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS");
  const privKey   = need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY");

  // deps ya publicados previamente
  const utilTypesAddr    = need("VITE_UTIL_TYPES_ADDRESS");
  const lendoorConfigAddr= need("VITE_CONFIG_ADDRESS");

  // Publica **bajo tu cuenta** usando el CLI:
  // Nota: algunas versiones del CLI no aceptan --included-artifacts; no lo uses.
  const named = [
    `lendoor=${publisher}`,
    `util_types=${utilTypesAddr}`,
    `lendoor_config=${lendoorConfigAddr}`,
  ].join(",");

  run(
    `aptos move publish ` +
    `--assume-yes ` +
    `--named-addresses ${named} ` +
    `--url ${url} ` +
    `--private-key ${privKey}`
  );

  // Como publicaste bajo TU cuenta, @lendoor = publisher.
  // Graba eso en el .env para que init.js y el front usen ese address.
  const line = `VITE_LENDOOR_ADDRESS=${publisher}\n`;
  const envPath = ".env";
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  env = env.match(/^VITE_LENDOOR_ADDRESS=.*$/m)
    ? env.replace(/^VITE_LENDOOR_ADDRESS=.*$/m, line.trim())
    : (env.endsWith("\n") ? env + line : env + "\n" + line);
  fs.writeFileSync(envPath, env, "utf8");

  console.log(`\n✅ lendoor publicado bajo tu cuenta: ${publisher}`);
  console.log(`🔧 .env actualizado: VITE_LENDOOR_ADDRESS=${publisher}`);
})();