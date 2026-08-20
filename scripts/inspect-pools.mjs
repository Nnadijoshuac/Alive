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

async function inspectPools() {
  const pools = [
    { name: "wAAPLx", pool: "0x2899478f7e2a967c3b28b7eecbe60897f2619001" },
    { name: "wMETAx", pool: "0x9c3d491f0c2cf596289d0473a21855a828945417" },
    { name: "wNVDAx", pool: "0x2a2b11730c2b6d99a58034a869dd810d7300a7b2" },
    { name: "wTSLAx", pool: "0xe1071db4691b325c709854dc3d5ccd5d77e62ed1" },
    { name: "wMSTRx", pool: "0x30987adf0b11dc698438a99ba04ec3a1ab2c7eab" },
    { name: "wCOINx", pool: "0x44c7ed7ffdf8465c9d27f60aec845eed3d49d56e" },
    { name: "wHOODx", pool: "0x59801175a9b2248f9bf4ba7f82e17045c4672ec8" },
    { name: "wINTCx", pool: "0x33aa35b0271fffe2048cc093ab7fe60931786719" },
    { name: "wIBMx", pool: "0xbf69d85055642a9c6450bdfde3c49baac50f8286" },
    { name: "wSNDKx", pool: "0x75e82e2884ea10f72fca777449b73377f4646219" },
    { name: "wMUx", pool: "0xe2047ee3bddb5c99ae428ab83df63f8730698e30" },
    { name: "wGOOGLx", pool: "0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f" },
  ];

  for (const item of pools) {
    const res = await testFetch(`https://api.geckoterminal.com/api/v2/networks/x-layer/pools/${item.pool}`);
    if (res.data?.data) {
      const p = res.data.data.attributes;
      const baseTokenAddr = res.data.data.relationships?.base_token?.data?.id?.replace("x-layer_", "");
      const quoteTokenAddr = res.data.data.relationships?.quote_token?.data?.id?.replace("x-layer_", "");
      console.log(`[${item.name}] Pool: ${p.name} | Base Token: ${baseTokenAddr} | Price: $${p.base_token_price_usd} | 24h: ${p.price_change_percentage?.h24}% | Reserve: $${p.reserve_in_usd} | Vol24h: $${p.volume_usd?.h24}`);
    }
  }
}

inspectPools();
