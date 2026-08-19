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
        "User-Agent": "ALIVE-RWA-Intelligence/1.0",
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
  console.log("=== 1. Probing OKX X Layer Token List ===");
  const listRes = await testFetch("https://raw.githubusercontent.com/okx/xlayer-tokenlist/main/xlayer.tokenlist.json");
  if (listRes.data && Array.isArray(listRes.data.tokens)) {
    console.log(`Found ${listRes.data.tokens.length} tokens in official OKX X Layer token list.`);
    const xstocks = listRes.data.tokens.filter(t => t.symbol.endsWith("X") || t.name.toLowerCase().includes("stock") || t.name.toLowerCase().includes("backed"));
    console.log("Matching tokens in tokenlist:", xstocks.map(t => ({ symbol: t.symbol, name: t.name, address: t.address })));
  } else {
    console.log("Token list response:", listRes);
  }

  console.log("\n=== 2. Probing OKX DEX Supported Chains ===");
  const chainsRes = await testFetch("https://www.okx.com/api/v5/dex/aggregator/supported/chain");
  console.log("Supported chains status:", chainsRes.status);
  if (chainsRes.data?.data) {
    const xlayer = chainsRes.data.data.find(c => c.chainId === "196" || c.chainId === 196 || c.chainName?.toLowerCase().includes("layer"));
    console.log("X Layer in supported chains:", xlayer);
  } else {
    console.log("Chains data preview:", typeof chainsRes.data === "object" ? JSON.stringify(chainsRes.data).slice(0, 300) : chainsRes.data);
  }

  console.log("\n=== 3. Probing OKX DEX Market / Price Endpoints for WMETAX ===");
  const endpoints = [
    `https://www.okx.com/api/v5/dex/market/price?chainId=196&tokenContractAddress=${TARGET_CONTRACTS.WMETAX}`,
    `https://www.okx.com/api/v5/dex/market/token/basic-info?chainId=196&tokenContractAddress=${TARGET_CONTRACTS.WMETAX}`,
    `https://www.okx.com/api/v5/dex/market/token/search?chainId=196&keyword=WMETAX`,
    `https://www.okx.com/api/v5/dex/market/token/search?chainId=196&keyword=${TARGET_CONTRACTS.WMETAX}`,
    `https://www.okx.com/api/v5/dex/aggregator/quote?chainId=196&amount=1000000000&fromTokenAddress=0x1e4a5963abfd975d8c9021ce480b42188849d41d&toTokenAddress=${TARGET_CONTRACTS.WMETAX}`,
    `https://web3.okx.com/api/v5/dex/market/price?chainId=196&tokenContractAddress=${TARGET_CONTRACTS.WMETAX}`,
    `https://www.okx.com/api/v5/rubik/stat/tlb/all-token-list`,
  ];

  for (const ep of endpoints) {
    const res = await testFetch(ep);
    console.log(`URL: ${ep}`);
    console.log(`Status: ${res.status}`);
    console.log(`Response:`, JSON.stringify(res.data).slice(0, 400));
    console.log("---");
  }
}

probe();
