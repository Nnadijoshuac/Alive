const { spawnSync } = require("child_process");
const path = require("path");

const patchPath = path.resolve(__dirname, "patch-symlink.cjs").replace(/\\/g, "/");
const existingOptions = process.env.NODE_OPTIONS || "";
const nodeOptions = `${existingOptions} --require "${patchPath}"`.trim();

console.log("[ALIVE] Building Cloudflare Worker with OpenNext...");
const result = spawnSync("npx", ["opennextjs-cloudflare", "build"], {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL || "https://careful-chihuahua-483.convex.cloud",
    NEXT_PRIVATE_MINIMAL_MODE: "1",
    NODE_OPTIONS: nodeOptions,
  },
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}
