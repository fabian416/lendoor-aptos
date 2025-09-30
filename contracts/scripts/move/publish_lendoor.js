require("dotenv").config();
const fs = require("node:fs");
const cli = require("@aptos-labs/ts-sdk/dist/common/cli/index.js");
const aptosSDK = require("@aptos-labs/ts-sdk");

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

(async function main() {
  // Network + publisher identity
  const network = need("VITE_APP_NETWORK");
  const publisher = need("VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS");
  const privKey = need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY");

  // Dependencies already deployed (read from .env)
  const utilTypesAddr = need("VITE_UTIL_TYPES_ADDRESS");
  const lendoorConfigAddr = need("VITE_CONFIG_ADDRESS");

  const move = new cli.Move();

  // CLI flags:
  // - no artifacts to minimize payload
  // - assume-yes for non-interactive
  // - use provided private key and node URL
  // - increase timeout for slow RPCs
  const extraArgs = [
    "--included-artifacts", "none",
    "--assume-yes",
    `--private-key=${privKey}`,
    `--url=${aptosSDK.NetworkToNodeAPI[network]}`,
    "--connection-timeout-secs", process.env.APTOS_TIMEOUT_SECS || "120",
  ];

  try {
    const { objectAddress } = await move.createObjectAndPublishPackage({
      // Publish ONLY the core lendoor package
      packageDirectoryPath: "contracts",
      addressName: "lendoor",
      // Resolve named addresses to the already-published packages
      namedAddresses: {
        // where to publish the core package
        lendoor: publisher,
        // link deps (already deployed)
        util_types: utilTypesAddr,
        lendoor_config: lendoorConfigAddr,
      },
      extraArguments: extraArgs,
    });

    console.log(`✅ lendoor published at object address: ${objectAddress}`);

    // Persist published object address to .env as VITE_LENDOOR_ADDRESS
    const envPath = ".env";
    let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
    const line = `VITE_LENDOOR_ADDRESS=${objectAddress}`;
    env = env.match(/^VITE_LENDOOR_ADDRESS=.*$/m)
      ? env.replace(/^VITE_LENDOOR_ADDRESS=.*$/m, line)
      : `${env}\n${line}`;
    fs.writeFileSync(envPath, env, "utf8");

    console.log("Saved to .env:");
    console.log(line);
  } catch (e) {
    console.error("❌ Publish lendoor failed:", e?.message || e);
    console.error(
      "\nIf chunked publish failed mid-way, clear the StagingArea and retry:\n" +
      `npx aptos move clear-staging-area --assume-yes --included-artifacts none ` +
      `--url ${aptosSDK.NetworkToNodeAPI[network]} ` +
      `--private-key ${privKey}\n`
    );
    process.exit(1);
  }
})();
