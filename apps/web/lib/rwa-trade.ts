export const XLAYER_MAINNET_CONFIG = {
  chainIdHex: "0xc4",
  chainIdDec: 196,
  chainName: "X Layer Mainnet",
  nativeCurrency: {
    name: "OKB",
    symbol: "OKB",
    decimals: 18,
  },
  rpcUrls: ["https://rpc.xlayer.tech"],
  blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"],
};

export type EIP1193Provider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (eventName: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (eventName: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

export function isWalletAvailable(): boolean {
  return typeof window !== "undefined" && Boolean(window.ethereum);
}

export async function connectWallet(): Promise<string> {
  if (!isWalletAvailable() || !window.ethereum) {
    throw new Error("No Web3 wallet (MetaMask, OKX Wallet, Rabby) detected. Please install a wallet extension.");
  }

  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts || accounts.length === 0 || !accounts[0]) {
    throw new Error("No accounts found. Please unlock your wallet and approve the connection.");
  }

  return accounts[0].toLowerCase();
}

export async function getConnectedAccount(): Promise<string | undefined> {
  if (!isWalletAvailable() || !window.ethereum) return undefined;
  try {
    const accounts = (await window.ethereum.request({
      method: "eth_accounts",
    })) as string[];
    return accounts?.[0]?.toLowerCase();
  } catch {
    return undefined;
  }
}

export async function getWalletChainId(): Promise<number | undefined> {
  if (!isWalletAvailable() || !window.ethereum) return undefined;
  try {
    const chainIdHex = (await window.ethereum.request({
      method: "eth_chainId",
    })) as string;
    return parseInt(chainIdHex, 16);
  } catch {
    return undefined;
  }
}

export async function switchNetworkToXLayer(): Promise<void> {
  if (!isWalletAvailable() || !window.ethereum) {
    throw new Error("No Web3 wallet detected.");
  }

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: XLAYER_MAINNET_CONFIG.chainIdHex }],
    });
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
    // Error code 4902 means the chain has not been added to MetaMask
    if (err?.code === 4902 || err?.message?.includes("4902") || err?.data?.originalError?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: XLAYER_MAINNET_CONFIG.chainIdHex,
            chainName: XLAYER_MAINNET_CONFIG.chainName,
            nativeCurrency: XLAYER_MAINNET_CONFIG.nativeCurrency,
            rpcUrls: XLAYER_MAINNET_CONFIG.rpcUrls,
            blockExplorerUrls: XLAYER_MAINNET_CONFIG.blockExplorerUrls,
          },
        ],
      });
    } else {
      throw error;
    }
  }
}

// ABI Selectors
// balanceOf(address) -> 0x70a08231 + 32-byte padded address
// allowance(address,address) -> 0xdd62ed3e + 32-byte owner + 32-byte spender
// approve(address,uint256) -> 0x095ea7b3 + 32-byte spender + 32-byte amount

function padAddress(address: string): string {
  return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

export async function getTokenBalance(
  tokenAddress: string,
  walletAddress: string,
  decimals = 6,
): Promise<{ human: string; raw: bigint }> {
  if (!isWalletAvailable() || !window.ethereum) {
    return { human: "0", raw: 0n };
  }

  const data = `0x70a08231${padAddress(walletAddress)}`;
  try {
    const result = (await window.ethereum.request({
      method: "eth_call",
      params: [{ to: tokenAddress, data }, "latest"],
    })) as string;

    if (!result || result === "0x") return { human: "0", raw: 0n };
    const raw = BigInt(result);
    const divisor = 10n ** BigInt(decimals);
    const whole = raw / divisor;
    const fraction = (raw % divisor).toString().padStart(decimals, "0").slice(0, 4);
    return { human: `${whole}.${fraction}`, raw };
  } catch {
    return { human: "0", raw: 0n };
  }
}

export async function getTokenAllowance(
  tokenAddress: string,
  walletAddress: string,
  spenderAddress: string,
): Promise<bigint> {
  if (!isWalletAvailable() || !window.ethereum) return 0n;

  const data = `0xdd62ed3e${padAddress(walletAddress)}${padAddress(spenderAddress)}`;
  try {
    const result = (await window.ethereum.request({
      method: "eth_call",
      params: [{ to: tokenAddress, data }, "latest"],
    })) as string;

    if (!result || result === "0x") return 0n;
    return BigInt(result);
  } catch {
    return 0n;
  }
}

export async function requestTokenApproval(
  tokenAddress: string,
  spenderAddress: string,
  walletAddress: string,
  amountRaw: bigint,
): Promise<string> {
  if (!isWalletAvailable() || !window.ethereum) {
    throw new Error("No Web3 wallet detected.");
  }

  if (amountRaw <= 0n) {
    throw new Error("Approval amount must be greater than zero.");
  }

  // Approve only the amount required by the current quote. The user can
  // review a new approval if a later quote needs a different amount.
  const encodedAmount = amountRaw.toString(16).padStart(64, "0");
  const data = `0x095ea7b3${padAddress(spenderAddress)}${encodedAmount}`;

  const txHash = (await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: walletAddress,
        to: tokenAddress,
        data,
      },
    ],
  })) as string;

  return txHash;
}

export async function sendSwapTransaction(
  txPayload: {
    to: string;
    data: string;
    value?: string;
    gasLimit?: string;
  },
  walletAddress: string,
): Promise<string> {
  if (!isWalletAvailable() || !window.ethereum) {
    throw new Error("No Web3 wallet detected.");
  }

  const txHash = (await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: walletAddress,
        to: txPayload.to,
        data: txPayload.data,
        value: txPayload.value ?? "0x0",
        ...(txPayload.gasLimit ? { gas: txPayload.gasLimit } : {}),
      },
    ],
  })) as string;

  return txHash;
}

export async function waitForTransactionReceipt(
  txHash: string,
  maxAttempts = 30,
  intervalMs = 2000,
): Promise<{ status: boolean; blockNumber: number }> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch("https://rpc.xlayer.tech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getTransactionReceipt",
          params: [txHash],
        }),
      });

      const json = await res.json();
      if (json?.result) {
        const status = json.result.status === "0x1" || json.result.status === 1;
        const blockNumber = parseInt(json.result.blockNumber, 16);
        return { status, blockNumber };
      }
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("Transaction confirmation timeout. Check transaction status on X Layer Explorer.");
}
