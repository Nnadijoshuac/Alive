import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ethers";
import "dotenv/config";
import type { HardhatUserConfig } from "hardhat/config";

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = deployerPrivateKey ? [deployerPrivateKey] : [];

// Mainnet deliberately does not fall back to DEPLOYER_PRIVATE_KEY. A testnet
// key that has been used for demo deployments must not silently become the
// key controlling mainnet contracts; mainnet requires its own.
const mainnetDeployerPrivateKey = process.env.MAINNET_DEPLOYER_PRIVATE_KEY;
const mainnetAccounts = mainnetDeployerPrivateKey
  ? [mainnetDeployerPrivateKey]
  : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
      evmVersion: "paris",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: process.env.LOCAL_RPC_URL ?? "http://127.0.0.1:8545",
      chainId: 31337,
    },
    xlayerTestnet: {
      url:
        process.env.X_LAYER_TESTNET_RPC_URL ??
        "https://testrpc.xlayer.tech/terigon",
      chainId: 1952,
      accounts,
    },
    xlayerMainnet: {
      url: process.env.X_LAYER_MAINNET_RPC_URL ?? "https://rpc.xlayer.tech",
      chainId: 196,
      accounts: mainnetAccounts,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40_000,
  },
};

export default config;
