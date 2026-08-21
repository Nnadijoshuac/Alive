const XLAYER_RPC = "https://rpc.xlayer.tech";
const CHAIN_ID = 196;

const TOKENS = {
  // Source tokens
  USDC: { address: "0x74b7f16337b8972027f6196a17a631ac6de26d22", decimals: 6, symbol: "USDC" },
  USDT: { address: "0x1e4a5963abfd975d8c9021ce480b42188849d41d", decimals: 6, symbol: "USDT" },
  USDG: { address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8", decimals: 6, symbol: "USDG" },
  
  // Target xStocks
  WMETAX: { address: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56", decimals: 18, symbol: "WMETAX" },
  SPYX: { address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48", decimals: 18, symbol: "SPYX" },
  QQQX: { address: "0xa753a7395cae905cd615da0b82a53e0560f250af", decimals: 18, symbol: "QQQX" },
  ASMLX: { address: "0xc0b417e7f83db438631eb5e096684dd742e5294f", decimals: 18, symbol: "ASMLX" },
  MUX: { address: "0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4", decimals: 18, symbol: "MUX" },
  SNDKX: { address: "0xb63efbc28860c8097e341de1fcf59456161e9d98", decimals: 18, symbol: "SNDKX" },
  WGOOGLX: { address: "0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f", decimals: 18, symbol: "WGOOGLX" },
  WNVDAX: { address: "0xa8ddb5cd96b5222afe198316e9a57caa642850d5", decimals: 18, symbol: "WNVDAX" },
};

async function rpcCall(method, params = []) {
  const res = await fetch(XLAYER_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

console.log("=== 1. PROBING ONCHAIN RPC ===");
const blockRes = await rpcCall("eth_blockNumber");
console.log(`Connected to X Layer (Chain ${CHAIN_ID}) at block: ${parseInt(blockRes.result, 16)}`);

for (const [key, t] of Object.entries(TOKENS)) {
  try {
    // eth_call for name, symbol, decimals, totalSupply
    // totalSupply() = 0x18160ddd
    const supplyRes = await rpcCall("eth_call", [{ to: t.address, data: "0x18160ddd" }, "latest"]);
    const rawSupply = supplyRes.result && supplyRes.result !== "0x" ? BigInt(supplyRes.result).toString() : "0";
    console.log(`✔ ${key} (${t.address}): onchain deployed on X Layer (raw supply=${rawSupply.slice(0, 10)}...)`);
  } catch (e) {
    console.log(`✖ ${key} (${t.address}): ${e.message}`);
  }
}

console.log("\n=== 2. PROBING OKX ONCHAINOS / GECKOTERMINAL POOL LIQUIDITY ===");
for (const [key, t] of Object.entries(TOKENS)) {
  if (["USDC", "USDT", "USDG"].includes(key)) continue;
  try {
    const url = `https://api.geckoterminal.com/api/v2/networks/x-layer/tokens/${t.address}`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (res.ok) {
      const data = await res.json();
      const attr = data?.data?.attributes;
      console.log(`✔ ${key}: Route=YES | Price=$${attr?.price_usd} | 24h=${attr?.price_change_percentage?.h24}% | Vol24h=$${attr?.volume_usd?.h24} | Liquidity=$${attr?.total_reserve_in_usd}`);
    } else {
      console.log(`✖ ${key}: HTTP ${res.status}`);
    }
  } catch (e) {
    console.log(`✖ ${key}: ${e.message}`);
  }
}
