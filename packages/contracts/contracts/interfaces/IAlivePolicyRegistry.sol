// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAlivePolicyRegistry {
    enum ApprovalMode {
        Advisory,
        GuardedAuto
    }

    struct PolicyRecord {
        address owner;
        address vault;
        bytes32 policyHash;
        bytes32 enforceablePolicyHash;
        uint32 version;
        uint16 maximumSingleAssetBps;
        uint16 maximumSingleIssuerBps;
        uint16 minimumCashBps;
        uint16 maximumSlippageBps;
        uint32 maximumPriceAgeSeconds;
        ApprovalMode approvalMode;
        bool allowlistEnabled;
        bool enabled;
        uint64 createdAt;
    }

    struct ClassLimit {
        bytes32 assetClass;
        uint16 minimumBps;
        uint16 maximumBps;
    }

    function getPolicy(
        address vault,
        uint32 version
    ) external view returns (PolicyRecord memory);

    function classLimitCount(
        address vault,
        uint32 version
    ) external view returns (uint256);

    function classLimitAt(
        address vault,
        uint32 version,
        uint256 index
    ) external view returns (ClassLimit memory);

    function isAssetAllowed(
        address vault,
        uint32 version,
        bytes32 assetId
    ) external view returns (bool);
}
