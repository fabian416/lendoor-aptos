require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const cli = require("@aptos-labs/ts-sdk/dist/common/cli/index.js");
const aptosSDK = require("@aptos-labs/ts-sdk");

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// Update or insert an env var in .env (value quoted)
function upsertEnvVar(filePath, key, value) {
  const quoted = `"${value}"`;
  const line = `${key}=${quoted}`;
  let env = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(env)) {
    env = env.replace(regex, line);
  } else {
    if (env.length && !env.endsWith("\n")) env += "\n";
    env += line + "\n";
  }
  fs.writeFileSync(filePath, env, "utf8");
}

(async function main() {
  // Network + publisher identity
  const network = need("VITE_APP_NETWORK");
  const publisher = need("VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS");
  const privKey = need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY");

  // Dependency already deployed (comes from previous step)
  const utilTypesAddr = need("VITE_UTIL_TYPES_ADDRESS");

  const move = new cli.Move();

  const extraArgs = [
    "--included-artifacts", "none",
    "--assume-yes",
    `--private-key=${privKey}`,
    `--url=${aptosSDK.NetworkToNodeAPI[network]}`,
    "--connection-timeout-secs", process.env.APTOS_TIMEOUT_SECS || "120",
  ];

  // If you run this from contracts/, the package lives at packages/lendoor_config
  const pkgDir = path.resolve(process.cwd(), "packages/lendoor_config");

  try {
    const { objectAddress } = await move.createObjectAndPublishPackage({
      packageDirectoryPath: pkgDir,
      addressName: "lendoor_config",
      // Resolve named addresses so this package links to util_types
      namedAddresses: {
        // where to publish this package
        lendoor_config: publisher,
        // link to already-published util_types
        util_types: utilTypesAddr,
      },
      extraArguments: extraArgs,
    });

    console.log(`✅ lendoor_config published at object address: ${objectAddress}`);

    // Persist for next step
    upsertEnvVar(path.resolve(process.cwd(), ".env"), "VITE_CONFIG_ADDRESS", objectAddress);
    console.log(`🔧 .env updated: VITE_CONFIG_ADDRESS="${objectAddress}"`);
  } catch (e) {
    console.error("❌ Publish lendoor_config failed:", e?.message || e);
    console.error(
      "\nIf chunked publish failed mid-way, clear the StagingArea and retry:\n" +
      `npx aptos move clear-staging-area --assume-yes --included-artifacts none ` +
      `--url ${aptosSDK.NetworkToNodeAPI[network]} ` +
      `--private-key ${privKey}\n`
    );
    process.exit(1);
  }
})();
