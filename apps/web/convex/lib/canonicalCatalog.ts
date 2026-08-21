export const CANONICAL_CATALOG = {
  "schemaVersion": 1,
  "catalogId": "alive-rwa-demo-2026-08-14",
  "label": "ALIVE RWA catalog",
  "dataMode": "SNAPSHOT",
  "asOf": "2026-08-14T12:00:00.000Z",
  "disclaimer": "MIXED CATALOG. ttbill-b and the other real tokenized RWAs (ousg, usdy, benji-fobxx, buidl, openeden-tbill, backed-bib01, backed-bcspx, jtrsy, acred, uscc, wisdomtree-wtgxx, usyc) carry real, sourced canonical identities -- most have not yet been analyzed by ALIVE (no risk/liquidity score, no AI extraction) until a user runs Analyze on them; ttbill-b alone also has live Chainlink data. Every other asset in this catalog (tusdc, ttbill-a, ttbill-c, tgold, tsp500, tnvda, taapl) is DEMO DATA -- NOT LIVE MARKET DATA, synthetic products/issuers/yields/risk scores/liquidity scores/prices that exist only to exercise ALIVE locally and on testnet (ttbill-a backs the Attack Lab harness specifically). Check each asset's own dataMode and sources before treating any figure as real.",
  "assets": [
    {
      "id": "tusdc",
      "symbol": "tUSDC",
      "name": "Test USD Cash",
      "assetClass": "CASH",
      "issuer": "demo-cash-issuer",
      "issuerName": "ALIVE Demo Cash Issuer",
      "underlying": "Synthetic USD cash reference",
      "liquidity": {
        "score": 100,
        "redemptionWindow": "Immediate in MockRwaRouter"
      },
      "risk": {
        "score": 8,
        "issuerRisk": 8,
        "liquidityRisk": 2,
        "marketRisk": 4,
        "oracleRisk": 10,
        "redemptionRisk": 3,
        "productComplexityRisk": 2,
        "methodology": "ALIVE_DEMO_RISK_V1"
      },
      "marketHours": {
        "type": "ALWAYS_OPEN"
      },
      "restrictions": [
        "Demo token only",
        "No claim on real USDC"
      ],
      "sources": [
        {
          "id": "demo-source-tusdc",
          "title": "ALIVE synthetic demo fixture",
          "sourceType": "DEMO_FIXTURE",
          "fixtureId": "alive-rwa-demo-2026-08-14",
          "retrievedAt": "2026-08-14T12:00:00.000Z",
          "supportedFields": [
            "assetClass",
            "issuer",
            "issuerName",
            "lastUpdatedAt",
            "liquidity.redemptionWindow",
            "liquidity.score",
            "marketHours.type",
            "name",
            "restrictions",
            "risk.issuerRisk",
            "risk.liquidityRisk",
            "risk.marketRisk",
            "risk.methodology",
            "risk.oracleRisk",
            "risk.productComplexityRisk",
            "risk.redemptionRisk",
            "risk.score",
            "symbol",
            "underlying"
          ],
          "disclaimer": "Synthetic fixture; not live market data."
        }
      ],
      "lastUpdatedAt": "2026-08-14T12:00:00.000Z",
      "dataMode": "DEMO"
    },
    {
      "id": "ttbill-a",
      "symbol": "tTBILL-A",
      "name": "Test Treasury Fund A",
      "assetClass": "TREASURY",
      "issuer": "demo-treasury-issuer-a",
      "issuerName": "ALIVE Demo Treasury Issuer A",
      "underlying": "Synthetic short-duration US Treasury reference basket",
      "yield": {
        "type": "Synthetic snapshot estimate",
        "estimatedAprBps": 480
      },
      "liquidity": {
        "score": 94,
        "redemptionWindow": "Immediate in MockRwaRouter"
      },
      "risk": {
        "score": 18,
        "issuerRisk": 18,
        "liquidityRisk": 8,
        "marketRisk": 14,
        "oracleRisk": 20,
        "redemptionRisk": 12,
        "productComplexityRisk": 10,
        "methodology": "ALIVE_DEMO_RISK_V1"
      },
      "marketHours": {
        "type": "ALWAYS_OPEN"
      },
      "restrictions": [
        "Demo token only",
        "No claim on US Treasuries"
      ],
      "sources": [
        {
          "id": "demo-source-ttbill-a",
          "title": "ALIVE synthetic demo fixture",
          "sourceType": "DEMO_FIXTURE",
          "fixtureId": "alive-rwa-demo-2026-08-14",
          "retrievedAt": "2026-08-14T12:00:00.000Z",
          "supportedFields": [
            "assetClass",
            "issuer",
            "issuerName",
            "lastUpdatedAt",
            "liquidity.redemptionWindow",
            "liquidity.score",
            "marketHours.type",
            "name",
            "restrictions",
            "risk.issuerRisk",
            "risk.liquidityRisk",
            "risk.marketRisk",
            "risk.methodology",
            "risk.oracleRisk",
            "risk.productComplexityRisk",
            "risk.redemptionRisk",
            "risk.score",
            "symbol",
            "underlying",
            "yield.estimatedAprBps",
            "yield.type"
          ],
          "disclaimer": "Synthetic fixture; not live market data."
        }
      ],
      "lastUpdatedAt": "2026-08-14T12:00:00.000Z",
      "dataMode": "DEMO"
    },
    {
      "id": "ttbill-b",
      "symbol": "tTBILL-B",
      "name": "Invesco Short Duration US Government Securities Fund",
      "assetClass": "TREASURY",
      "issuer": "invesco-advisers",
      "issuerName": "Invesco Advisers, Inc.",
      "underlying": "Short-duration U.S. Treasury Bills",
      "liquidity": {
        "score": 97
      },
      "risk": {
        "score": 16,
        "issuerRisk": 15,
        "liquidityRisk": 6,
        "marketRisk": 12,
        "oracleRisk": 18,
        "redemptionRisk": 10,
        "productComplexityRisk": 11,
        "methodology": "ALIVE_RISK_V1"
      },
      "restrictions": [
        "Transfers of Shares are subject to consent requirements and, for Tokenized Shares, automated smart contract controls.",
        "Tokenized Shares are not listed on any exchange or trading system and may only be transferred through limited peer-to-peer transactions, subject to restrictions."
      ],
      "sources": [
        {
          "id": "superstate-catalog-seed-issuer-doc",
          "title": "Invesco USTB | Superstate (docs.superstate.com)",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://docs.superstate.com/investors/tokenized-funds/available-funds/invesco-ustb",
          "retrievedAt": "2026-08-17T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "restrictions",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "alive-methodology-ttbill-b",
          "title": "ALIVE risk & liquidity methodology",
          "sourceType": "ALIVE_METHODOLOGY",
          "methodology": "ALIVE_RISK_V1",
          "retrievedAt": "2026-08-17T00:00:00.000Z",
          "supportedFields": [
            "liquidity.score",
            "risk.issuerRisk",
            "risk.liquidityRisk",
            "risk.marketRisk",
            "risk.methodology",
            "risk.oracleRisk",
            "risk.productComplexityRisk",
            "risk.redemptionRisk",
            "risk.score"
          ],
          "disclaimer": "ALIVE's own computed risk and liquidity methodology output -- not a claim from any third-party document."
        },
        {
          "id": "etherscan-token-identity-ttbill-b",
          "title": "Superstate Short Duration US Government Securities Fund (USTB) | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x43415eb6ff9db7e26a15b704e7a3edce97d31c4e",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-14T12:00:00.000Z",
      "dataMode": "LIVE",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/35012/large/Invesco_icon_lg.png?1780816895",
        "logoSource": "COINGECKO",
        "logoSourceId": "superstate-short-duration-us-government-securities-fund-ustb",
        "logoContractAddress": "0x43415eb6ff9db7e26a15b704e7a3edce97d31c4e",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:17:28.384Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x43415eb6ff9db7e26a15b704e7a3edce97d31c4e",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x43415eb6ff9db7e26a15b704e7a3edce97d31c4e",
          "sourceIds": [
            "etherscan-token-identity-ttbill-b"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "READY",
      "enforcementCapability": "X_LAYER",
      "extraction": {
        "pipelineVersion": "v2.1",
        "extractedAt": "2026-08-20T00:00:00.000Z",
        "model": "llama-3.3-70b-versatile",
        "promptVersion": "passport-v2.1",
        "mode": "DETERMINISTIC_FALLBACK"
      },
      "backing": {
        "backingType": "FUND_SHARE",
        "underlyingAssets": "Short-duration U.S. Treasury Bills held by the fund",
        "directLegalClaim": true,
        "redemptionIntoUnderlying": false,
        "custodian": "The Bank of New York Mellon",
        "sourceIds": [
          "superstate-catalog-seed-issuer-doc"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "ousg",
      "symbol": "OUSG",
      "name": "Ondo Short-Term US Government Bond Fund",
      "assetClass": "TREASURY",
      "issuer": "ondo-finance",
      "issuerName": "Ondo Finance",
      "underlying": "Short-term US Treasury bonds, held via BlackRock's BUIDL fund",
      "sources": [
        {
          "id": "ondo-docs-ousg-overview",
          "title": "OUSG Overview | Ondo Finance",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://docs.ondo.finance/qualified-access-products/ousg/overview",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-ousg",
          "title": "Ondo Short-Term U.S. Government Bond Fund (OUSG) | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x1b19c19393e2d034d8ff31ff34c81252fcbbee92",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/29023/large/OUSG.png?1696527993",
        "logoSource": "COINGECKO",
        "logoSourceId": "ousg",
        "logoContractAddress": "0x1b19c19393e2d034d8ff31ff34c81252fcbbee92",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:17:37.706Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x1b19c19393e2d034d8ff31ff34c81252fcbbee92",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x1b19c19393e2d034d8ff31ff34c81252fcbbee92",
          "sourceIds": [
            "etherscan-token-identity-ousg"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "FUND_SHARE",
        "underlyingAssets": "Short-term US Treasury bonds, held via BlackRock's BUIDL fund",
        "directLegalClaim": true,
        "sourceIds": [
          "ondo-docs-ousg-overview"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "usdy",
      "symbol": "USDY",
      "name": "Ondo US Dollar Yield",
      "assetClass": "TREASURY",
      "issuer": "ondo-finance",
      "issuerName": "Ondo Finance",
      "underlying": "Short-term US Treasuries and bank demand deposits",
      "sources": [
        {
          "id": "ondo-usdy-product-page",
          "title": "USDY | Ondo Finance",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://ondo.finance/usdy",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-usdy",
          "title": "Ondo U.S. Dollar Yield (USDY) | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x96f6ef951840721adbf46ac996b59e0235cb985c",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/31700/large/usdy_%281%29.png?1696530524",
        "logoSource": "COINGECKO",
        "logoSourceId": "ondo-us-dollar-yield",
        "logoContractAddress": "0x96f6ef951840721adbf46ac996b59e0235cb985c",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:17:46.422Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x96f6ef951840721adbf46ac996b59e0235cb985c",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x96f6ef951840721adbf46ac996b59e0235cb985c",
          "sourceIds": [
            "etherscan-token-identity-usdy"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "DEBT_CLAIM",
        "underlyingAssets": "Short-term US Treasuries and bank demand deposits",
        "collateralDescription": "USDY is issued as a tokenized note (a debt instrument) secured by short-term US Treasuries and bank demand deposits, not a direct fund share.",
        "sourceIds": [
          "ondo-usdy-product-page"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "benji-fobxx",
      "symbol": "BENJI",
      "name": "Franklin OnChain US Government Money Fund (FOBXX)",
      "assetClass": "FUND",
      "issuer": "franklin-templeton",
      "issuerName": "Franklin Templeton",
      "underlying": "US Treasury securities, repurchase agreements, and cash",
      "sources": [
        {
          "id": "franklin-templeton-benji-page",
          "title": "Invest with Benji | Franklin Templeton Digital Assets",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://digitalassets.franklintempleton.com/benji/",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-benji",
          "title": "Franklin Templeton BENJI | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x3ddc84940ab509c11b20b76b466933f40b750dc9",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/66409/large/Benji_Logo.png?1749371083",
        "logoSource": "COINGECKO",
        "logoSourceId": "franklin-templeton-benji",
        "logoContractAddress": "0x3ddc84940ab509c11b20b76b466933f40b750dc9",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:17:55.105Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x3ddc84940ab509c11b20b76b466933f40b750dc9",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x3ddc84940ab509c11b20b76b466933f40b750dc9",
          "sourceIds": [
            "etherscan-token-identity-benji"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "FUND_SHARE",
        "underlyingAssets": "US Treasury securities, repurchase agreements, and cash",
        "directLegalClaim": true,
        "sourceIds": [
          "franklin-templeton-benji-page"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "buidl",
      "symbol": "BUIDL",
      "name": "BlackRock USD Institutional Digital Liquidity Fund",
      "assetClass": "FUND",
      "issuer": "blackrock",
      "issuerName": "BlackRock Financial Management, Inc. (tokenized by Securitize)",
      "underlying": "Cash, US Treasury bills, and repurchase agreements",
      "sources": [
        {
          "id": "securitize-buidl-page",
          "title": "Introducing the BlackRock BUIDL Fund | Securitize",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://securitize.io/blackrock/buidl",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-buidl",
          "title": "BlackRock USD Institutional Digital Liquidity Fund (BUIDL) | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x7712c34205737192402172409a8f7ccef8aa2aec",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/36291/large/blackrock.png?1711013223",
        "logoSource": "COINGECKO",
        "logoSourceId": "blackrock-usd-institutional-digital-liquidity-fund",
        "logoContractAddress": "0x7712c34205737192402172409a8f7ccef8aa2aec",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:18:03.868Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x7712c34205737192402172409a8f7ccef8aa2aec",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x7712c34205737192402172409a8f7ccef8aa2aec",
          "sourceIds": [
            "etherscan-token-identity-buidl"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "FUND_SHARE",
        "underlyingAssets": "Cash, US Treasury bills, and repurchase agreements",
        "directLegalClaim": true,
        "sourceIds": [
          "securitize-buidl-page"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "openeden-tbill",
      "symbol": "TBILL",
      "name": "OpenEden TBILL Vault",
      "assetClass": "TREASURY",
      "issuer": "openeden",
      "issuerName": "OpenEden",
      "underlying": "Short-dated US Treasury Bills, managed and custodied by BNY",
      "sources": [
        {
          "id": "openeden-tbill-docs",
          "title": "Introduction | OpenEden TBILL",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://docs.openeden.com/tbill/introduction",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-tbill",
          "title": "OpenEden TBILL | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0xdd50c053c096cb04a3e3362e2b622529ec5f2e8a",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/30576/large/OE_Logo_200x200_Transparent.png?1696529441",
        "logoSource": "COINGECKO",
        "logoSourceId": "openeden-tbill",
        "logoContractAddress": "0xdd50c053c096cb04a3e3362e2b622529ec5f2e8a",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:18:12.553Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0xdd50c053c096cb04a3e3362e2b622529ec5f2e8a",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0xdd50c053c096cb04a3e3362e2b622529ec5f2e8a",
          "sourceIds": [
            "etherscan-token-identity-tbill"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "RESERVE_BACKED",
        "underlyingAssets": "Short-dated US Treasury Bills and a small US Dollar cash buffer",
        "collateralDescription": "TBILL is described by OpenEden as backed 1:1 by short-dated US T-Bills and a small portion of US Dollar, held via a smart contract vault.",
        "proofOfReserveAvailable": true,
        "sourceIds": [
          "openeden-tbill-docs"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "backed-bib01",
      "symbol": "BIB01",
      "name": "Backed IB01 $ Treasury Bond 0-1yr",
      "assetClass": "TREASURY",
      "issuer": "backed-finance",
      "issuerName": "Backed Finance AG",
      "underlying": "iShares $ Treasury Bond 0-1yr UCITS ETF (tracker certificate)",
      "sources": [
        {
          "id": "backed-assets-bib01-page",
          "title": "bIB01 | Backed Assets",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://assets.backed.fi/products/bib01",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-bib01",
          "title": "Backed IB01 $ Treasury Bond 0-1yr (bIB01) | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0xca30c93b02514f86d5c86a6e375e3a330b435fb5",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/31755/large/200p_bIB01_3.png?1740504175",
        "logoSource": "COINGECKO",
        "logoSourceId": "backed-ib01-treasury-bond-0-1yr",
        "logoContractAddress": "0xca30c93b02514f86d5c86a6e375e3a330b435fb5",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:18:21.217Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0xca30c93b02514f86d5c86a6e375e3a330b435fb5",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0xca30c93b02514f86d5c86a6e375e3a330b435fb5",
          "sourceIds": [
            "etherscan-token-identity-bib01"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "SYNTHETIC_EXPOSURE",
        "underlyingAssets": "iShares $ Treasury Bond 0-1yr UCITS ETF",
        "collateralDescription": "bIB01 is issued as a tracker certificate reflecting the price of the iShares ETF -- synthetic price exposure, not a direct fund share.",
        "sourceIds": [
          "backed-assets-bib01-page"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "backed-bcspx",
      "symbol": "BCSPX",
      "name": "Backed CSPX Core S&P 500",
      "assetClass": "ETF",
      "issuer": "backed-finance",
      "issuerName": "Backed Finance AG",
      "underlying": "iShares Core S&P 500 UCITS ETF (CSPX, tracker certificate)",
      "sources": [
        {
          "id": "backed-assets-bcspx-page",
          "title": "bCSPX | Backed Assets",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://assets.backed.fi/products/bcspx",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-bcspx",
          "title": "Backed CSPX Core S&P 500 (bCSPX) | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x1e2c4fb7ede391d116e6b41cd0608260e8801d59",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/31891/large/bCSPX_200p.png?1740041074",
        "logoSource": "COINGECKO",
        "logoSourceId": "backed-cspx-core-s-p-500",
        "logoContractAddress": "0x1e2c4fb7ede391d116e6b41cd0608260e8801d59",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:18:29.944Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x1e2c4fb7ede391d116e6b41cd0608260e8801d59",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x1e2c4fb7ede391d116e6b41cd0608260e8801d59",
          "sourceIds": [
            "etherscan-token-identity-bcspx"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "COLLATERAL_BACKED",
        "underlyingAssets": "iShares Core S&P 500 UCITS ETF (CSPX)",
        "collateralDescription": "bCSPX is described by Backed as 1:1 backed by the underlying ETF shares, held by Swiss third-party custodians.",
        "proofOfReserveAvailable": true,
        "sourceIds": [
          "backed-assets-bcspx-page"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "jtrsy",
      "symbol": "JTRSY",
      "name": "Janus Henderson Anemoy Treasury Fund",
      "assetClass": "TREASURY",
      "issuer": "anemoy",
      "issuerName": "Anemoy Capital Ltd. (sub-advised by Janus Henderson Investors)",
      "underlying": "Short-duration US Treasury bills (0-3 month maturities)",
      "sources": [
        {
          "id": "anemoy-jtrsy-fund-page",
          "title": "Janus Henderson Anemoy Treasury Fund (JTRSY) | Anemoy",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://www.anemoy.io/funds/jtrsy",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-jtrsy",
          "title": "Janus Henderson Anemoy Treasury Fund (JTRSY) | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x8c213ee79581ff4984583c6a801e5263418c4b86",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/70445/large/JTRSY.png?1762078582",
        "logoSource": "COINGECKO",
        "logoSourceId": "janus-henderson-anemoy-treasury-fund",
        "logoContractAddress": "0x8c213ee79581ff4984583c6a801e5263418c4b86",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:21:25.737Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x8c213ee79581ff4984583c6a801e5263418c4b86",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x8c213ee79581ff4984583c6a801e5263418c4b86",
          "sourceIds": [
            "etherscan-token-identity-jtrsy"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "FUND_SHARE",
        "underlyingAssets": "Short-duration US Treasury bills (0-3 month maturities)",
        "directLegalClaim": true,
        "sourceIds": [
          "anemoy-jtrsy-fund-page"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "acred",
      "symbol": "ACRED",
      "name": "Apollo Diversified Credit Securitize Fund",
      "assetClass": "CREDIT",
      "issuer": "apollo-global-management",
      "issuerName": "Apollo Global Management (tokenized by Securitize)",
      "underlying": "Corporate direct lending, asset-backed lending, and structured credit",
      "sources": [
        {
          "id": "securitize-acred-primary-market-page",
          "title": "Apollo Diversified Credit Securitize Fund | Securitize",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://securitize.io/primary-market/apollo-diversified-credit-securitize-fund",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-acred",
          "title": "Apollo Diversified Credit Securitize Fund (ACRED) | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x17418038ecf73ba4026c4f428547bf099706f27b",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/54809/large/ACRED.png?1741801356",
        "logoSource": "COINGECKO",
        "logoSourceId": "apollo-diversified-credit-securitize-fund",
        "logoContractAddress": "0x17418038ecf73ba4026c4f428547bf099706f27b",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:21:34.445Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x17418038ecf73ba4026c4f428547bf099706f27b",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x17418038ecf73ba4026c4f428547bf099706f27b",
          "sourceIds": [
            "etherscan-token-identity-acred"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "FUND_SHARE",
        "underlyingAssets": "Corporate direct lending, asset-backed lending, and structured credit (via the Apollo Diversified Credit Fund feeder structure)",
        "directLegalClaim": true,
        "sourceIds": [
          "securitize-acred-primary-market-page"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "uscc",
      "symbol": "USCC",
      "name": "Bitwise Crypto Carry Fund",
      "assetClass": "FUND",
      "issuer": "bitwise-asset-management",
      "issuerName": "Bitwise Asset Management (tokenized via Superstate)",
      "underlying": "Crypto basis (spot/futures) strategies across Bitcoin and Ether, plus US Treasuries",
      "sources": [
        {
          "id": "bitwise-uscc-product-page",
          "title": "Bitwise Crypto Carry Fund (USCC) | Bitwise",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://bitwiseinvestments.com/crypto-funds/uscc",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-uscc",
          "title": "Superstate USCC Token (Bitwise Crypto Carry Fund) | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x14d60e7fdc0d71d8611742720e4c50e7a974020c",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/39326/large/Bitwise_icon_lg.png?1780816913",
        "logoSource": "COINGECKO",
        "logoSourceId": "superstate-uscc",
        "logoContractAddress": "0x14d60e7fdc0d71d8611742720e4c50e7a974020c",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:19:59.382Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x14d60e7fdc0d71d8611742720e4c50e7a974020c",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x14d60e7fdc0d71d8611742720e4c50e7a974020c",
          "sourceIds": [
            "etherscan-token-identity-uscc"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "FUND_SHARE",
        "underlyingAssets": "Crypto basis (spot/futures) strategies across Bitcoin and Ether, plus US Treasuries",
        "directLegalClaim": true,
        "sourceIds": [
          "bitwise-uscc-product-page"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "wisdomtree-wtgxx",
      "symbol": "WTGXX",
      "name": "WisdomTree Government Money Market Digital Fund",
      "assetClass": "FUND",
      "issuer": "wisdomtree",
      "issuerName": "WisdomTree",
      "underlying": "US government securities, cash, and fully-collateralized repurchase agreements",
      "sources": [
        {
          "id": "wisdomtree-connect-wtgxx-page",
          "title": "WTGXX | WisdomTree Connect",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://www.wisdomtreeconnect.com/digital-funds/money-market/wtgxx",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-wtgxx",
          "title": "WisdomTree Treasury Money Market Digital Fund (WTGXX) | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x1fecf3d9d4fee7f2c02917a66028a48c6706c179",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/71484/large/wtgxx_circle_ci.png?1767948288",
        "logoSource": "COINGECKO",
        "logoSourceId": "wisdomtree-treasury-money-market-digital-fund",
        "logoContractAddress": "0x1fecf3d9d4fee7f2c02917a66028a48c6706c179",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:20:08.171Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x1fecf3d9d4fee7f2c02917a66028a48c6706c179",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x1fecf3d9d4fee7f2c02917a66028a48c6706c179",
          "sourceIds": [
            "etherscan-token-identity-wtgxx"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "FUND_SHARE",
        "underlyingAssets": "US government securities, cash, and fully-collateralized repurchase agreements",
        "directLegalClaim": true,
        "sourceIds": [
          "wisdomtree-connect-wtgxx-page"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "usyc",
      "symbol": "USYC",
      "name": "Hashnote International Short Duration Fund (USYC)",
      "assetClass": "TREASURY",
      "issuer": "hashnote",
      "issuerName": "Hashnote International Short Duration Fund Ltd. (a Circle company)",
      "underlying": "US Treasury bills and reverse repurchase agreements",
      "sources": [
        {
          "id": "circle-usyc-page",
          "title": "USYC | Tokenized Money Market Fund | Circle",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://www.circle.com/usyc",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ],
          "sourceTier": "PRIMARY"
        },
        {
          "id": "etherscan-token-identity-usyc",
          "title": "Hashnote USYC Token | Etherscan",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://etherscan.io/token/0x136471a34f6ef19fe571effc1ca711fdb8e49f2b",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "supportedFields": [
            "deployments"
          ],
          "sourceTier": "CHAIN_EXPLORER"
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/51054/large/Hashnote_SDYC_200x200.png?1730370965",
        "logoSource": "COINGECKO",
        "logoSourceId": "hashnote-usyc",
        "logoContractAddress": "0x136471a34f6ef19fe571effc1ca711fdb8e49f2b",
        "logoNetwork": "Ethereum",
        "logoVerifiedAt": "2026-08-18T08:20:16.880Z"
      },
      "deployments": [
        {
          "chainId": 1,
          "chainName": "Ethereum",
          "contractAddress": "0x136471a34f6ef19fe571effc1ca711fdb8e49f2b",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://etherscan.io/token/0x136471a34f6ef19fe571effc1ca711fdb8e49f2b",
          "sourceIds": [
            "etherscan-token-identity-usyc"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "backing": {
        "backingType": "FUND_SHARE",
        "underlyingAssets": "US Treasury bills and reverse repurchase agreements",
        "directLegalClaim": true,
        "sourceIds": [
          "circle-usyc-page"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      }
    },
    {
      "id": "ttbill-c",
      "symbol": "tTBILL-C",
      "name": "Test Treasury Fund C",
      "assetClass": "TREASURY",
      "issuer": "demo-treasury-issuer-c",
      "issuerName": "ALIVE Demo Treasury Issuer C",
      "underlying": "Synthetic zero-to-three-month Treasury reference basket",
      "yield": {
        "type": "Synthetic snapshot estimate",
        "estimatedAprBps": 465
      },
      "liquidity": {
        "score": 91,
        "redemptionWindow": "Immediate in MockRwaRouter"
      },
      "risk": {
        "score": 21,
        "issuerRisk": 22,
        "liquidityRisk": 11,
        "marketRisk": 15,
        "oracleRisk": 21,
        "redemptionRisk": 16,
        "productComplexityRisk": 12,
        "methodology": "ALIVE_DEMO_RISK_V1"
      },
      "marketHours": {
        "type": "ALWAYS_OPEN"
      },
      "restrictions": [
        "Demo token only",
        "No claim on US Treasuries"
      ],
      "sources": [
        {
          "id": "demo-source-ttbill-c",
          "title": "ALIVE synthetic demo fixture",
          "sourceType": "DEMO_FIXTURE",
          "fixtureId": "alive-rwa-demo-2026-08-14",
          "retrievedAt": "2026-08-14T12:00:00.000Z",
          "supportedFields": [
            "assetClass",
            "issuer",
            "issuerName",
            "lastUpdatedAt",
            "liquidity.redemptionWindow",
            "liquidity.score",
            "marketHours.type",
            "name",
            "restrictions",
            "risk.issuerRisk",
            "risk.liquidityRisk",
            "risk.marketRisk",
            "risk.methodology",
            "risk.oracleRisk",
            "risk.productComplexityRisk",
            "risk.redemptionRisk",
            "risk.score",
            "symbol",
            "underlying",
            "yield.estimatedAprBps",
            "yield.type"
          ],
          "disclaimer": "Synthetic fixture; not live market data."
        }
      ],
      "lastUpdatedAt": "2026-08-14T12:00:00.000Z",
      "dataMode": "DEMO"
    },
    {
      "id": "tgold",
      "symbol": "tGOLD",
      "name": "Test Gold",
      "assetClass": "GOLD",
      "issuer": "demo-gold-issuer",
      "issuerName": "ALIVE Demo Gold Issuer",
      "underlying": "Synthetic gold spot reference",
      "liquidity": {
        "score": 83,
        "redemptionWindow": "Immediate in MockRwaRouter"
      },
      "risk": {
        "score": 36,
        "issuerRisk": 24,
        "liquidityRisk": 22,
        "marketRisk": 42,
        "oracleRisk": 27,
        "redemptionRisk": 28,
        "productComplexityRisk": 18,
        "methodology": "ALIVE_DEMO_RISK_V1"
      },
      "marketHours": {
        "type": "ALWAYS_OPEN"
      },
      "restrictions": [
        "Demo token only",
        "No claim on physical gold"
      ],
      "sources": [
        {
          "id": "demo-source-tgold",
          "title": "ALIVE synthetic demo fixture",
          "sourceType": "DEMO_FIXTURE",
          "fixtureId": "alive-rwa-demo-2026-08-14",
          "retrievedAt": "2026-08-14T12:00:00.000Z",
          "supportedFields": [
            "assetClass",
            "issuer",
            "issuerName",
            "lastUpdatedAt",
            "liquidity.redemptionWindow",
            "liquidity.score",
            "marketHours.type",
            "name",
            "restrictions",
            "risk.issuerRisk",
            "risk.liquidityRisk",
            "risk.marketRisk",
            "risk.methodology",
            "risk.oracleRisk",
            "risk.productComplexityRisk",
            "risk.redemptionRisk",
            "risk.score",
            "symbol",
            "underlying"
          ],
          "disclaimer": "Synthetic fixture; not live market data."
        }
      ],
      "lastUpdatedAt": "2026-08-14T12:00:00.000Z",
      "dataMode": "DEMO"
    },
    {
      "id": "tsp500",
      "symbol": "tSP500",
      "name": "Test Broad Equity Index",
      "assetClass": "EQUITY",
      "issuer": "demo-equity-issuer",
      "issuerName": "ALIVE Demo Equity Issuer",
      "underlying": "Synthetic broad US equity index reference",
      "yield": {
        "type": "Synthetic distribution estimate",
        "estimatedAprBps": 130
      },
      "liquidity": {
        "score": 88,
        "redemptionWindow": "Immediate in MockRwaRouter"
      },
      "risk": {
        "score": 62,
        "issuerRisk": 30,
        "liquidityRisk": 18,
        "marketRisk": 72,
        "oracleRisk": 28,
        "redemptionRisk": 24,
        "productComplexityRisk": 25,
        "methodology": "ALIVE_DEMO_RISK_V1"
      },
      "marketHours": {
        "type": "TRADITIONAL_MARKET",
        "timezone": "America/New_York"
      },
      "restrictions": [
        "Demo token only",
        "No claim on an equity index"
      ],
      "sources": [
        {
          "id": "demo-source-tsp500",
          "title": "ALIVE synthetic demo fixture",
          "sourceType": "DEMO_FIXTURE",
          "fixtureId": "alive-rwa-demo-2026-08-14",
          "retrievedAt": "2026-08-14T12:00:00.000Z",
          "supportedFields": [
            "assetClass",
            "issuer",
            "issuerName",
            "lastUpdatedAt",
            "liquidity.redemptionWindow",
            "liquidity.score",
            "marketHours.timezone",
            "marketHours.type",
            "name",
            "restrictions",
            "risk.issuerRisk",
            "risk.liquidityRisk",
            "risk.marketRisk",
            "risk.methodology",
            "risk.oracleRisk",
            "risk.productComplexityRisk",
            "risk.redemptionRisk",
            "risk.score",
            "symbol",
            "underlying",
            "yield.estimatedAprBps",
            "yield.type"
          ],
          "disclaimer": "Synthetic fixture; not live market data."
        }
      ],
      "lastUpdatedAt": "2026-08-14T12:00:00.000Z",
      "dataMode": "DEMO"
    },
    {
      "id": "tnvda",
      "symbol": "tNVDA",
      "name": "Test NVDA Reference",
      "assetClass": "EQUITY",
      "issuer": "demo-equity-issuer",
      "issuerName": "ALIVE Demo Equity Issuer",
      "underlying": "Synthetic NVDA price reference",
      "yield": {
        "type": "Synthetic distribution estimate",
        "estimatedAprBps": 5
      },
      "liquidity": {
        "score": 80,
        "redemptionWindow": "Immediate in MockRwaRouter"
      },
      "risk": {
        "score": 79,
        "issuerRisk": 30,
        "liquidityRisk": 25,
        "marketRisk": 92,
        "oracleRisk": 30,
        "redemptionRisk": 25,
        "productComplexityRisk": 30,
        "methodology": "ALIVE_DEMO_RISK_V1"
      },
      "marketHours": {
        "type": "TRADITIONAL_MARKET",
        "timezone": "America/New_York"
      },
      "restrictions": [
        "Demo token only",
        "No claim on NVIDIA shares"
      ],
      "sources": [
        {
          "id": "demo-source-tnvda",
          "title": "ALIVE synthetic demo fixture",
          "sourceType": "DEMO_FIXTURE",
          "fixtureId": "alive-rwa-demo-2026-08-14",
          "retrievedAt": "2026-08-14T12:00:00.000Z",
          "supportedFields": [
            "assetClass",
            "issuer",
            "issuerName",
            "lastUpdatedAt",
            "liquidity.redemptionWindow",
            "liquidity.score",
            "marketHours.timezone",
            "marketHours.type",
            "name",
            "restrictions",
            "risk.issuerRisk",
            "risk.liquidityRisk",
            "risk.marketRisk",
            "risk.methodology",
            "risk.oracleRisk",
            "risk.productComplexityRisk",
            "risk.redemptionRisk",
            "risk.score",
            "symbol",
            "underlying",
            "yield.estimatedAprBps",
            "yield.type"
          ],
          "disclaimer": "Synthetic fixture; not live market data."
        }
      ],
      "lastUpdatedAt": "2026-08-14T12:00:00.000Z",
      "dataMode": "DEMO"
    },
    {
      "id": "taapl",
      "symbol": "tAAPL",
      "name": "Test AAPL Reference",
      "assetClass": "EQUITY",
      "issuer": "demo-equity-issuer",
      "issuerName": "ALIVE Demo Equity Issuer",
      "underlying": "Synthetic AAPL price reference",
      "yield": {
        "type": "Synthetic distribution estimate",
        "estimatedAprBps": 45
      },
      "liquidity": {
        "score": 84,
        "redemptionWindow": "Immediate in MockRwaRouter"
      },
      "risk": {
        "score": 68,
        "issuerRisk": 30,
        "liquidityRisk": 22,
        "marketRisk": 78,
        "oracleRisk": 29,
        "redemptionRisk": 25,
        "productComplexityRisk": 28,
        "methodology": "ALIVE_DEMO_RISK_V1"
      },
      "marketHours": {
        "type": "TRADITIONAL_MARKET",
        "timezone": "America/New_York"
      },
      "restrictions": [
        "Demo token only",
        "No claim on Apple shares"
      ],
      "sources": [
        {
          "id": "demo-source-taapl",
          "title": "ALIVE synthetic demo fixture",
          "sourceType": "DEMO_FIXTURE",
          "fixtureId": "alive-rwa-demo-2026-08-14",
          "retrievedAt": "2026-08-14T12:00:00.000Z",
          "supportedFields": [
            "assetClass",
            "issuer",
            "issuerName",
            "lastUpdatedAt",
            "liquidity.redemptionWindow",
            "liquidity.score",
            "marketHours.timezone",
            "marketHours.type",
            "name",
            "restrictions",
            "risk.issuerRisk",
            "risk.liquidityRisk",
            "risk.marketRisk",
            "risk.methodology",
            "risk.oracleRisk",
            "risk.productComplexityRisk",
            "risk.redemptionRisk",
            "risk.score",
            "symbol",
            "underlying",
            "yield.estimatedAprBps",
            "yield.type"
          ],
          "disclaimer": "Synthetic fixture; not live market data."
        }
      ],
      "lastUpdatedAt": "2026-08-14T12:00:00.000Z",
      "dataMode": "DEMO"
    },
    {
      "id": "spyx-xstock",
      "symbol": "SPYX",
      "name": "SP500 xStock",
      "assetClass": "ETF",
      "issuer": "backed-assets-je",
      "issuerName": "Backed Assets (JE) Limited (Backed Finance AG / Kraken-affiliated SPV)",
      "underlying": "SPDR S&P 500 ETF Trust (SPY) shares, held 1:1 by a regulated custodian",
      "deployments": [
        {
          "chainId": 196,
          "chainName": "X Layer",
          "contractAddress": "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://www.oklink.com/x-layer/address/0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
          "sourceIds": [
            "xlayer-onchain-verified-spyx-xstock"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "backing": {
        "backingType": "COLLATERAL_BACKED",
        "underlyingAssets": "SPDR S&P 500 ETF Trust (SPY) shares, held 1:1 by a regulated custodian",
        "directLegalClaim": false,
        "redemptionIntoUnderlying": "unknown",
        "custodian": "Regulated Swiss custodians (InCore Bank, Maerki Baumann) under a three-party Account Control Agreement with an independent Security Agent",
        "collateralDescription": "xStocks are issued by Backed Assets (JE) Limited under a Liechtenstein prospectus (FMA-regulated), backed 1:1 by the real underlying security held with regulated third-party custodians in segregated sub-accounts.",
        "collateralizationRatio": 1,
        "sourceIds": [
          "xstocks-legal-overview-spyx-xstock"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      },
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "sources": [
        {
          "id": "xstocks-legal-overview-spyx-xstock",
          "title": "xStocks Product Legal Overview",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://docs.xstocks.fi/docs/product-legal-overview",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "PRIMARY",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ]
        },
        {
          "id": "xlayer-onchain-verified-spyx-xstock",
          "title": "SP500 xStock (SPYX) | X Layer Mainnet -- ALIVE-verified via onchain symbol()/name()/bytecode read",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://www.oklink.com/x-layer/address/0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "CHAIN_EXPLORER",
          "supportedFields": [
            "deployments"
          ]
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/66695/large/Ticker_SPX__Company_Name_SP500__size_200x200_2x.png",
        "logoSource": "COINGECKO",
        "logoSourceId": "sp500-xstock",
        "logoContractAddress": "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48",
        "logoNetwork": "X Layer",
        "logoVerifiedAt": "2026-08-18T12:00:00.000Z"
      }
    },
    {
      "id": "qqqx-xstock",
      "symbol": "QQQX",
      "name": "Nasdaq xStock",
      "assetClass": "ETF",
      "issuer": "backed-assets-je",
      "issuerName": "Backed Assets (JE) Limited (Backed Finance AG / Kraken-affiliated SPV)",
      "underlying": "Invesco QQQ Trust (QQQ) shares, held 1:1 by a regulated custodian",
      "deployments": [
        {
          "chainId": 196,
          "chainName": "X Layer",
          "contractAddress": "0xa753a7395cae905cd615da0b82a53e0560f250af",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://www.oklink.com/x-layer/address/0xa753a7395cae905cd615da0b82a53e0560f250af",
          "sourceIds": [
            "xlayer-onchain-verified-qqqx-xstock"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "backing": {
        "backingType": "COLLATERAL_BACKED",
        "underlyingAssets": "Invesco QQQ Trust (QQQ) shares, held 1:1 by a regulated custodian",
        "directLegalClaim": false,
        "redemptionIntoUnderlying": "unknown",
        "custodian": "Regulated Swiss custodians (InCore Bank, Maerki Baumann) under a three-party Account Control Agreement with an independent Security Agent",
        "collateralDescription": "xStocks are issued by Backed Assets (JE) Limited under a Liechtenstein prospectus (FMA-regulated), backed 1:1 by the real underlying security held with regulated third-party custodians in segregated sub-accounts.",
        "collateralizationRatio": 1,
        "sourceIds": [
          "xstocks-legal-overview-qqqx-xstock"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      },
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "sources": [
        {
          "id": "xstocks-legal-overview-qqqx-xstock",
          "title": "xStocks Product Legal Overview",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://docs.xstocks.fi/docs/product-legal-overview",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "PRIMARY",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ]
        },
        {
          "id": "xlayer-onchain-verified-qqqx-xstock",
          "title": "Nasdaq xStock (QQQX) | X Layer Mainnet -- ALIVE-verified via onchain symbol()/name()/bytecode read",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://www.oklink.com/x-layer/address/0xa753a7395cae905cd615da0b82a53e0560f250af",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "CHAIN_EXPLORER",
          "supportedFields": [
            "deployments"
          ]
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/66696/large/QQQx.png",
        "logoSource": "COINGECKO",
        "logoSourceId": "nasdaq-xstock",
        "logoContractAddress": "0xa753a7395cae905cd615da0b82a53e0560f250af",
        "logoNetwork": "X Layer",
        "logoVerifiedAt": "2026-08-18T12:00:00.000Z"
      }
    },
    {
      "id": "asml-xstock",
      "symbol": "ASMLX",
      "name": "ASML xStock",
      "assetClass": "EQUITY",
      "issuer": "backed-assets-je",
      "issuerName": "Backed Assets (JE) Limited (Backed Finance AG / Kraken-affiliated SPV)",
      "underlying": "ASML Holding N.V. (NASDAQ: ASML) shares, held 1:1 by a regulated custodian",
      "deployments": [
        {
          "chainId": 196,
          "chainName": "X Layer",
          "contractAddress": "0xc0b417e7f83db438631eb5e096684dd742e5294f",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://www.oklink.com/x-layer/address/0xc0b417e7f83db438631eb5e096684dd742e5294f",
          "sourceIds": [
            "xlayer-onchain-verified-asml-xstock"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "backing": {
        "backingType": "COLLATERAL_BACKED",
        "underlyingAssets": "ASML Holding N.V. (NASDAQ: ASML) shares, held 1:1 by a regulated custodian",
        "directLegalClaim": false,
        "redemptionIntoUnderlying": "unknown",
        "custodian": "Regulated Swiss custodians (InCore Bank, Maerki Baumann) under a three-party Account Control Agreement with an independent Security Agent",
        "collateralDescription": "xStocks are issued by Backed Assets (JE) Limited under a Liechtenstein prospectus (FMA-regulated), backed 1:1 by the real underlying security held with regulated third-party custodians in segregated sub-accounts.",
        "collateralizationRatio": 1,
        "sourceIds": [
          "xstocks-legal-overview-asml-xstock"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      },
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "sources": [
        {
          "id": "xstocks-legal-overview-asml-xstock",
          "title": "xStocks Product Legal Overview",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://docs.xstocks.fi/docs/product-legal-overview",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "PRIMARY",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ]
        },
        {
          "id": "xlayer-onchain-verified-asml-xstock",
          "title": "ASML xStock (ASMLX) | X Layer Mainnet -- ALIVE-verified via onchain symbol()/name()/bytecode read",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://www.oklink.com/x-layer/address/0xc0b417e7f83db438631eb5e096684dd742e5294f",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "CHAIN_EXPLORER",
          "supportedFields": [
            "deployments"
          ]
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/69643/large/Ticker_ASMLx__Company_Name_ASML_xStock__size_200x200.png",
        "logoSource": "COINGECKO",
        "logoSourceId": "asml-xstock",
        "logoContractAddress": "0xc0b417e7f83db438631eb5e096684dd742e5294f",
        "logoNetwork": "X Layer",
        "logoVerifiedAt": "2026-08-18T12:00:00.000Z"
      }
    },
    {
      "id": "micron-xstock",
      "symbol": "MUX",
      "name": "Micron Technology xStock",
      "assetClass": "EQUITY",
      "issuer": "backed-assets-je",
      "issuerName": "Backed Assets (JE) Limited (Backed Finance AG / Kraken-affiliated SPV)",
      "underlying": "Micron Technology, Inc. (NASDAQ: MU) shares, held 1:1 by a regulated custodian",
      "deployments": [
        {
          "chainId": 196,
          "chainName": "X Layer",
          "contractAddress": "0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://www.oklink.com/x-layer/address/0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4",
          "sourceIds": [
            "xlayer-onchain-verified-micron-xstock"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "backing": {
        "backingType": "COLLATERAL_BACKED",
        "underlyingAssets": "Micron Technology, Inc. (NASDAQ: MU) shares, held 1:1 by a regulated custodian",
        "directLegalClaim": false,
        "redemptionIntoUnderlying": "unknown",
        "custodian": "Regulated Swiss custodians (InCore Bank, Maerki Baumann) under a three-party Account Control Agreement with an independent Security Agent",
        "collateralDescription": "xStocks are issued by Backed Assets (JE) Limited under a Liechtenstein prospectus (FMA-regulated), backed 1:1 by the real underlying security held with regulated third-party custodians in segregated sub-accounts.",
        "collateralizationRatio": 1,
        "sourceIds": [
          "xstocks-legal-overview-micron-xstock"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      },
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "sources": [
        {
          "id": "xstocks-legal-overview-micron-xstock",
          "title": "xStocks Product Legal Overview",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://docs.xstocks.fi/docs/product-legal-overview",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "PRIMARY",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ]
        },
        {
          "id": "xlayer-onchain-verified-micron-xstock",
          "title": "Micron Technology xStock (MUX) | X Layer Mainnet -- ALIVE-verified via onchain symbol()/name()/bytecode read",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://www.oklink.com/x-layer/address/0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "CHAIN_EXPLORER",
          "supportedFields": [
            "deployments"
          ]
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/69649/large/Ticker_MUx__Company_Name_Micron_Technology__size_200x200.png",
        "logoSource": "COINGECKO",
        "logoSourceId": "micron-technology-xstock",
        "logoContractAddress": "0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4",
        "logoNetwork": "X Layer",
        "logoVerifiedAt": "2026-08-18T12:00:00.000Z"
      }
    },
    {
      "id": "sandisk-xstock",
      "symbol": "SNDKX",
      "name": "Sandisk Corporation xStock",
      "assetClass": "EQUITY",
      "issuer": "backed-assets-je",
      "issuerName": "Backed Assets (JE) Limited (Backed Finance AG / Kraken-affiliated SPV)",
      "underlying": "Sandisk Corporation shares, held 1:1 by a regulated custodian",
      "deployments": [
        {
          "chainId": 196,
          "chainName": "X Layer",
          "contractAddress": "0xb63efbc28860c8097e341de1fcf59456161e9d98",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://www.oklink.com/x-layer/address/0xb63efbc28860c8097e341de1fcf59456161e9d98",
          "sourceIds": [
            "xlayer-onchain-verified-sandisk-xstock"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "backing": {
        "backingType": "COLLATERAL_BACKED",
        "underlyingAssets": "Sandisk Corporation shares, held 1:1 by a regulated custodian",
        "directLegalClaim": false,
        "redemptionIntoUnderlying": "unknown",
        "custodian": "Regulated Swiss custodians (InCore Bank, Maerki Baumann) under a three-party Account Control Agreement with an independent Security Agent",
        "collateralDescription": "xStocks are issued by Backed Assets (JE) Limited under a Liechtenstein prospectus (FMA-regulated), backed 1:1 by the real underlying security held with regulated third-party custodians in segregated sub-accounts.",
        "collateralizationRatio": 1,
        "sourceIds": [
          "xstocks-legal-overview-sandisk-xstock"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      },
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "sources": [
        {
          "id": "xstocks-legal-overview-sandisk-xstock",
          "title": "xStocks Product Legal Overview",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://docs.xstocks.fi/docs/product-legal-overview",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "PRIMARY",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ]
        },
        {
          "id": "xlayer-onchain-verified-sandisk-xstock",
          "title": "Sandisk Corporation xStock (SNDKX) | X Layer Mainnet -- ALIVE-verified via onchain symbol()/name()/bytecode read",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://www.oklink.com/x-layer/address/0xb63efbc28860c8097e341de1fcf59456161e9d98",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "CHAIN_EXPLORER",
          "supportedFields": [
            "deployments"
          ]
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/102172849/large/sndkx.png",
        "logoSource": "COINGECKO",
        "logoSourceId": "sandisk-corporation-xstock",
        "logoContractAddress": "0xb63efbc28860c8097e341de1fcf59456161e9d98",
        "logoNetwork": "X Layer",
        "logoVerifiedAt": "2026-08-18T12:00:00.000Z"
      }
    },
    {
      "id": "meta-xstock",
      "symbol": "WMETAX",
      "name": "Wrapped Meta xStock",
      "assetClass": "EQUITY",
      "issuer": "backed-assets-je",
      "issuerName": "Backed Assets (JE) Limited (Backed Finance AG / Kraken-affiliated SPV)",
      "underlying": "Meta Platforms, Inc. (NASDAQ: META) shares, held 1:1 by a regulated custodian",
      "deployments": [
        {
          "chainId": 196,
          "chainName": "X Layer",
          "contractAddress": "0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://www.oklink.com/x-layer/address/0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
          "sourceIds": [
            "xlayer-onchain-verified-meta-xstock"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "backing": {
        "backingType": "COLLATERAL_BACKED",
        "underlyingAssets": "Meta Platforms, Inc. (NASDAQ: META) shares, held 1:1 by a regulated custodian",
        "directLegalClaim": false,
        "redemptionIntoUnderlying": "unknown",
        "custodian": "Regulated Swiss custodians (InCore Bank, Maerki Baumann) under a three-party Account Control Agreement with an independent Security Agent",
        "collateralDescription": "xStocks are issued by Backed Assets (JE) Limited under a Liechtenstein prospectus (FMA-regulated), backed 1:1 by the real underlying security held with regulated third-party custodians in segregated sub-accounts.",
        "collateralizationRatio": 1,
        "sourceIds": [
          "xstocks-legal-overview-meta-xstock"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      },
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "sources": [
        {
          "id": "xstocks-legal-overview-meta-xstock",
          "title": "xStocks Product Legal Overview",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://docs.xstocks.fi/docs/product-legal-overview",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "PRIMARY",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ]
        },
        {
          "id": "xlayer-onchain-verified-meta-xstock",
          "title": "Wrapped Meta xStock (WMETAX) | X Layer Mainnet -- ALIVE-verified via onchain symbol()/name()/bytecode read",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://www.oklink.com/x-layer/address/0xe840946ffebcd66b7c4e95095effafadfa0d0e56",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "CHAIN_EXPLORER",
          "supportedFields": [
            "deployments"
          ]
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "UNAVAILABLE"
      }
    },
    {
      "id": "alphabet-xstock",
      "symbol": "WGOOGLX",
      "name": "Wrapped Alphabet xStock",
      "assetClass": "EQUITY",
      "issuer": "backed-assets-je",
      "issuerName": "Backed Assets (JE) Limited (Backed Finance AG / Kraken-affiliated SPV)",
      "underlying": "Alphabet Inc. (NASDAQ: GOOGL) shares, held 1:1 by a regulated custodian",
      "deployments": [
        {
          "chainId": 196,
          "chainName": "X Layer",
          "contractAddress": "0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f",
          "tokenStandard": "ERC-20",
          "deploymentStatus": "VERIFIED",
          "explorerUrl": "https://www.oklink.com/x-layer/address/0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f",
          "sourceIds": [
            "xlayer-onchain-verified-alphabet-xstock"
          ],
          "verifiedAt": "2026-08-18T00:00:00.000Z"
        }
      ],
      "backing": {
        "backingType": "COLLATERAL_BACKED",
        "underlyingAssets": "Alphabet Inc. (NASDAQ: GOOGL) shares, held 1:1 by a regulated custodian",
        "directLegalClaim": false,
        "redemptionIntoUnderlying": "unknown",
        "custodian": "Regulated Swiss custodians (InCore Bank, Maerki Baumann) under a three-party Account Control Agreement with an independent Security Agent",
        "collateralDescription": "xStocks are issued by Backed Assets (JE) Limited under a Liechtenstein prospectus (FMA-regulated), backed 1:1 by the real underlying security held with regulated third-party custodians in segregated sub-accounts.",
        "collateralizationRatio": 1,
        "sourceIds": [
          "xstocks-legal-overview-alphabet-xstock"
        ],
        "asOf": "2026-08-18T00:00:00.000Z"
      },
      "catalogStatus": "IDENTIFIED",
      "analysisCapability": "SOURCE_DISCOVERY_REQUIRED",
      "enforcementCapability": "NONE",
      "sources": [
        {
          "id": "xstocks-legal-overview-alphabet-xstock",
          "title": "xStocks Product Legal Overview",
          "sourceType": "ISSUER_DOCUMENTATION",
          "sourceUrl": "https://docs.xstocks.fi/docs/product-legal-overview",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "PRIMARY",
          "supportedFields": [
            "symbol",
            "name",
            "assetClass",
            "issuer",
            "issuerName",
            "underlying",
            "lastUpdatedAt"
          ]
        },
        {
          "id": "xlayer-onchain-verified-alphabet-xstock",
          "title": "Wrapped Alphabet xStock (WGOOGLX) | X Layer Mainnet -- ALIVE-verified via onchain symbol()/name()/bytecode read",
          "sourceType": "ONCHAIN",
          "sourceUrl": "https://www.oklink.com/x-layer/address/0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f",
          "retrievedAt": "2026-08-18T00:00:00.000Z",
          "sourceTier": "CHAIN_EXPLORER",
          "supportedFields": [
            "deployments"
          ]
        }
      ],
      "lastUpdatedAt": "2026-08-18T00:00:00.000Z",
      "dataMode": "SNAPSHOT",
      "visual": {
        "logoStatus": "RESOLVED",
        "logoUrl": "https://coin-images.coingecko.com/coins/images/55796/large/Ticker_GOOG__Company_Name_Alphabet_Inc.__size_200x200_2x.png",
        "logoSource": "COINGECKO",
        "logoSourceId": "wrapped-alphabet-xstock",
        "logoContractAddress": "0xf8c5308f80e459bb53d9ebe689854d9cbb2caa6f",
        "logoNetwork": "X Layer",
          "logoVerifiedAt": "2026-08-18T12:00:00.000Z"
      }
    }
  ]
} as const;

