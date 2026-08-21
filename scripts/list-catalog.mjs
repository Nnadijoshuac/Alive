import fs from "node:fs";

const catalog = JSON.parse(fs.readFileSync("./data/rwa-catalog/catalog.demo.json", "utf-8"));
console.log(`Total assets in catalog: ${catalog.assets.length}`);
for (const a of catalog.assets) {
  console.log(`ID: ${a.id.padEnd(20)} | Symbol: ${a.symbol.padEnd(10)} | Name: ${a.name.padEnd(35)} | Class: ${a.assetClass.padEnd(12)} | Deployments: ${(a.deployments || []).map(d => `${d.chainId}:${d.contractAddress}`).join(", ")}`);
}
