const RPC_URL = "https://rpc.xlayer.tech";

async function rpcCall(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  return data.result;
}

function decodeString(hex) {
  if (!hex || hex === "0x") return "";
  try {
    // Standard ABI encoded string
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (clean.length < 128) {
      // Might be bytes32
      const str = Buffer.from(clean, "hex").toString("utf8").replace(/\0/g, "");
      return str;
    }
    const lengthHex = clean.slice(64, 128);
    const length = parseInt(lengthHex, 16);
    const dataHex = clean.slice(128, 128 + length * 2);
    return Buffer.from(dataHex, "hex").toString("utf8");
  } catch {
    return "";
  }
}

function decodeUint8(hex) {
  if (!hex || hex === "0x") return 18;
  return parseInt(hex, 16);
}

function decodeBigInt(hex) {
  if (!hex || hex === "0x") return 0n;
  return BigInt(hex);
}

const CANDIDATES = [
  // Existing in catalog
  { id: "WMETAX", address: "0xe840946ffebcd66b7c4e95095effafadfa0d0e56" },
  { id: "SPYX", address: "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48" },
  { id: "QQQX", address: "0xa753a7395cae905cd615da0b82a53e0560f250af" },
  { id: "ASMLX", address: "0xc0b417e7f83db438631eb5e096684dd742e5294f" },
  { id: "MUX", address: "0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4" },
  { id: "SNDKX", address: "0xb63efbc28860c8097e341de1fcf59456161e9d98" },
  { id: "WGOOGLX", address: "0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f" },
  // Discovered candidates
  { id: "wNVDAx", address: "0xa8ddb5cd96b5222afe198316e9a57caa642850d5" },
  { id: "wAAPLx", address: "0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f" },
  { id: "wIBMx", address: "0xbf69d85055642a9c6450bdfde3c49baac50f8286" },
  { id: "wMSTRx", address: "0x30987adf0b11dc698438a99ba04ec3a1ab2c7eab" },
  { id: "wCOINx", address: "0x44c7ed7ffdf8465c9d27f60aec845eed3d49d56e" },
  { id: "wHOODx", address: "0x59801175a9b2248f9bf4ba7f82e17045c4672ec8" },
  { id: "wINTCx", address: "0x33aa35b0271fffe2048cc093ab7fe60931786719" },
  { id: "wMRVLx", address: "0xb4ee60b6b817ca7386422ef1a0f45eaddea13275" },
  { id: "wSKHYx", address: "0x6215a58ed045d71f2561aaabe54f4c885c522998" },
  { id: "wCRCLx", address: "0xb11134f14d5b94db60d4599dfdc3bf1bba2150e8" },
  { id: "wSPCXx", address: "0x8e2eed8b8b5e13ea7bf38e50d7821d2c57309072" },
  { id: "wEWYx", address: "0x021b40617982074748c81a19d22046cc2548c3be" },
  // Common Payment tokens on X Layer
  { id: "USDT", address: "0x1e4a5963abfd975d8c9021ce480b42188849d41d" },
  { id: "USDC", address: "0x74b7f16337b8972027f6196a17a631ac6de26d22" },
  { id: "USDC_alt", address: "0xb6ceceab302e2e4948951ee7843fc24e92933061" },
  { id: "USDG", address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8" },
  { id: "USDt0", address: "0x779ded0c9e1022225f8e0630b35a9b54be713736" },
  { id: "WOKB", address: "0xe538905cf8410324e03a5a23c1c177a474d59b2b" },
];

// 0x06fdde03: name()
// 0x95d89b41: symbol()
// 0x313ce567: decimals()
// 0x18160ddd: totalSupply()

async function checkContracts() {
  console.log("Checking X Layer contracts on RPC:", RPC_URL);
  for (const c of CANDIDATES) {
    try {
      const code = await rpcCall("eth_getCode", [c.address, "latest"]);
      if (!code || code === "0x") {
        console.log(`[NOT A CONTRACT] ${c.id} (${c.address})`);
        continue;
      }
      const [nameHex, symbolHex, decimalsHex, supplyHex] = await Promise.all([
        rpcCall("eth_call", [{ to: c.address, data: "0x06fdde03" }, "latest"]).catch(() => "0x"),
        rpcCall("eth_call", [{ to: c.address, data: "0x95d89b41" }, "latest"]).catch(() => "0x"),
        rpcCall("eth_call", [{ to: c.address, data: "0x313ce567" }, "latest"]).catch(() => "0x"),
        rpcCall("eth_call", [{ to: c.address, data: "0x18160ddd" }, "latest"]).catch(() => "0x"),
      ]);
      const name = decodeString(nameHex);
      const symbol = decodeString(symbolHex);
      const decimals = decodeUint8(decimalsHex);
      const supply = decodeBigInt(supplyHex);
      console.log(`[VERIFIED ONCHAIN] ${symbol.padEnd(8)} | "${name}" | ${c.address} | Dec: ${decimals} | Supply: ${(Number(supply) / Math.pow(10, decimals)).toFixed(4)}`);
    } catch (err) {
      console.log(`[ERROR] ${c.id} (${c.address}):`, err.message);
    }
  }
}

checkContracts();
