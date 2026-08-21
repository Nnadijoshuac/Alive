import crypto from "node:crypto";

const TARGET_CONTRACTS = {
  WMETAX: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
  SPYX: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
  QQQX: "0x4b7ec829390234a9f993d0cf39a3ff954ab8cfcb",
  ASMLX: "0x89db7fa4d4abfbdf43fc46270ee25fd445a6c11d",
  MUX: "0x11be76fbfe75c9bb0d5db6ecb214df9ad02df595",
  SNDKX: "0x5396658097b679461d31df86e580e66ea589d816",
  WGOOGLX: "0x4fe65bb57baae8eaebdf7d678be7612f00a583e7",
};

async function testFetch(url, headers = {}) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ALIVE-Intelligence/1.0",
        "Accept": "application/json",
        ...headers,
      },
    });
    const status = res.status;
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text.slice(0, 300);
    }
    return { status, data };
  } catch (err) {
    return { error: err.message };
  }
}

async function probe() {
  console.log("=== 1. Probing DexScreener on X Layer ===");
  const dexscreenerRes = await testFetch(`https://api.dexscreener.com/latest/dex/tokens/${TARGET_CONTRACTS.WMETAX}`);
  console.log("Dexscreener WMETAX status:", dexscreenerRes.status);
  console.log("Dexscreener pairs:", JSON.stringify(dexscreenerRes.data?.pairs || []).slice(0, 500));

  console.log("\n=== 2. Probing GeckoTerminal on X Layer ===");
  const geckoRes = await testFetch(`https://api.geckoterminal.com/api/v2/networks/x-layer/tokens/${TARGET_CONTRACTS.WMETAX}`);
  console.log("GeckoTerminal WMETAX status:", geckoRes.status);
  console.log("GeckoTerminal data:", JSON.stringify(geckoRes.data).slice(0, 500));

  console.log("\n=== 3. Probing GeckoTerminal X Layer Pools / Tokens ===");
  const geckoPools = await testFetch(`https://api.geckoterminal.com/api/v2/networks/x-layer/pools?page=1`);
  console.log("GeckoTerminal X Layer Pools status:", geckoPools.status);
  if (geckoPools.data?.data) {
    console.log(`Found ${geckoPools.data.data.length} top pools on X Layer`);
    console.log("Top 5 pools:", geckoPools.data.data.slice(0, 5).map(p => ({ name: p.attributes.name, address: p.attributes.address, base_token_price_usd: p.attributes.base_token_price_usd })));
  }

  console.log("\n=== 4. Probing OKX Web3 Explorer for WMETAX ===");
  const okxExplorerRes = await testFetch(`https://www.okx.com/api/v5/explorer/token/token-info?chainId=196&tokenContractAddress=${TARGET_CONTRACTS.WMETAX}`);
  console.log("OKX Explorer status:", okxExplorerRes.status, JSON.stringify(okxExplorerRes.data).slice(0, 300));
}

probe();
