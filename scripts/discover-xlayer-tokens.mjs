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

async function discover() {
  console.log("=== Fetching all pools on X Layer from GeckoTerminal ===");
  let page = 1;
  const discoveredTokens = new Map();

  while (page <= 5) {
    const res = await testFetch(`https://api.geckoterminal.com/api/v2/networks/x-layer/pools?page=${page}`);
    if (!res.data?.data || res.data.data.length === 0) break;

    for (const pool of res.data.data) {
      const rel = pool.relationships;
      const baseToken = rel?.base_token?.data?.id?.replace("x-layer_", "");
      const quoteToken = rel?.quote_token?.data?.id?.replace("x-layer_", "");
      const name = pool.attributes.name;
      const price = pool.attributes.base_token_price_usd;
      const reserve = pool.attributes.reserve_in_usd;
      const vol24 = pool.attributes.volume_usd?.h24;

      console.log(`[Page ${page}] Pool: ${name} | Base: ${baseToken} | Price: $${price} | Reserve: $${reserve} | Vol24: $${vol24}`);

      // Inspect included tokens
      if (res.data.included) {
        for (const inc of res.data.included) {
          if (inc.type === "token") {
            const addr = inc.attributes.address?.toLowerCase();
            if (addr && !discoveredTokens.has(addr)) {
              discoveredTokens.set(addr, inc.attributes);
            }
          }
        }
      }
    }
    page++;
  }

  console.log(`\n=== Total unique tokens discovered on X Layer: ${discoveredTokens.size} ===`);
  for (const [addr, token] of discoveredTokens.entries()) {
    console.log(`- ${token.symbol} (${token.name}) [${addr}] Price: $${token.price_usd}`);
  }
}

discover();
