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

// Update or insert an env var in .env (keeps quotes around the value)
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
  const network = need("VITE_APP_NETWORK");
  const publisherAddr = need("VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS");
  const publisherKey = need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY");

  const pkgDir = path.resolve(process.cwd(), "packages/util_types");
  console.log("Publishing package at:", pkgDir);

  const move = new cli.Move();

  const namedAddresses = { util_types: publisherAddr };

  const extraArguments = [
    "--included-artifacts", "none",
    "--assume-yes",
    `--private-key=${publisherKey}`,
    `--url=${aptosSDK.NetworkToNodeAPI[network]}`,
    "--connection-timeout-secs", process.env.APTOS_TIMEOUT_SECS || "120",
  ];

  try {
    const { objectAddress } = await move.createObjectAndPublishPackage({
      packageDirectoryPath: pkgDir,
      addressName: "util_types",
      namedAddresses,
      extraArguments,
    });

    console.log(`✅ util_types published at object address: ${objectAddress}`);

    // Write VITE_UTIL_TYPES_ADDRESS="<objectAddress>" to .env
    upsertEnvVar(path.resolve(process.cwd(), ".env"), "VITE_UTIL_TYPES_ADDRESS", objectAddress);
    console.log(`🔧 .env updated: VITE_UTIL_TYPES_ADDRESS="${objectAddress}"`);
  } catch (e) {
    console.error("❌ Publish util_types failed:", e?.message || e);
    process.exit(1);
  }
})();
