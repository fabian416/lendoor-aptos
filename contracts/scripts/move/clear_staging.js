require("dotenv").config();
const { execSync } = require("node:child_process");
const aptosSDK = require("@aptos-labs/ts-sdk");

function need(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

(function main() {
  const network = need("VITE_APP_NETWORK");
  const privKey = need("VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY");

  const cmd =
    `npx aptos move clear-staging-area ` +
    `--assume-yes --included-artifacts none ` +
    `--url ${aptosSDK.NetworkToNodeAPI[network]} ` +
    `--private-key ${privKey}`;

  try {
    console.log(`> ${cmd}`);
    const out = execSync(cmd, { stdio: "pipe" }).toString();
    console.log(out);
  } catch (e) {
    console.error("❌ Clear staging failed:", e?.stdout?.toString() || e?.message || e);
    process.exit(1);
  }
})();
