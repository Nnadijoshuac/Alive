// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAlivePolicyRegistry} from "./interfaces/IAlivePolicyRegistry.sol";
import {IAliveRwaAssetRegistry} from "./interfaces/IAliveRwaAssetRegistry.sol";

interface IAliveVaultOwner {
    function owner() external view returns (address);
}

/// @title ALIVE versioned onchain policy registry
/// @notice Binds an immutable canonical policy commitment and an explicitly
/// enforceable V1 subset to a user-owned vault. Revisions create new versions;
/// an existing policy can never be edited in place.
contract AlivePolicyRegistry is IAlivePolicyRegistry, Ownable {
    uint16 public constant MAX_BPS = 10_000;
    uint32 public constant MAX_PRICE_AGE_LIMIT = 1 days;
    uint256 public constant MAX_POLICY_ITEMS = 32;

    struct PolicyInput {
        bytes32 policyHash;
        uint16 maximumSingleAssetBps;
        uint16 maximumSingleIssuerBps;
        uint16 minimumCashBps;
        uint16 maximumSlippageBps;
        uint32 maximumPriceAgeSeconds;
        ApprovalMode approvalMode;
        bool allowlistEnabled;
    }

    error AssetConflict(bytes32 assetId);
    error AssetNotRegistered(bytes32 assetId);
    error DuplicateOrUnsortedItem(bytes32 item);
    error EmptyAllowlist();
    error InvalidBasisPoints(bytes32 field, uint16 value);
    error InvalidClassLimit(bytes32 assetClass, uint16 minimumBps, uint16 maximumBps);
    error InvalidPolicyHash();
    error InvalidPriceAge(uint32 maximumPriceAgeSeconds);
    error InvalidVault(address vault);
    error PolicyNotFound(address vault, uint32 version);
    error TooManyPolicyItems(uint256 supplied, uint256 maximum);
    error TotalClassMinimumTooHigh(uint256 totalMinimumBps);
    error UnauthorizedPolicyManager(address caller, address vaultOwner);
    error UnexpectedAllowlistEntries();

    event PolicyRegistered(
        address indexed vault,
        address indexed owner,
        uint32 indexed version,
        bytes32 policyHash,
        bytes32 enforceablePolicyHash,
        ApprovalMode approvalMode
    );
    event PolicyStatusUpdated(
        address indexed vault,
        uint32 indexed version,
        bool enabled,
        address indexed updatedBy
    );

    IAliveRwaAssetRegistry public immutable assetRegistry;

    mapping(address vault => uint32 version) public latestVersion;
    mapping(bytes32 policyKey => PolicyRecord policy) private _policies;
    mapping(bytes32 policyKey => ClassLimit[] limits) private _classLimits;
    mapping(bytes32 policyKey => mapping(bytes32 assetId => bool allowed))
        private _allowedAssets;
    mapping(bytes32 policyKey => mapping(bytes32 assetId => bool blocked))
        private _blockedAssets;

    constructor(
        address assetRegistry_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (assetRegistry_ == address(0)) revert InvalidVault(address(0));
        assetRegistry = IAliveRwaAssetRegistry(assetRegistry_);
    }

    function registerPolicy(
        address vault,
        PolicyInput calldata input,
        ClassLimit[] calldata classLimits,
        bytes32[] calldata allowedAssets,
        bytes32[] calldata blockedAssets
    ) external returns (uint32 version) {
        address vaultOwner = _vaultOwner(vault);
        if (msg.sender != vaultOwner) {
            revert UnauthorizedPolicyManager(msg.sender, vaultOwner);
        }
        _validateInput(input, classLimits, allowedAssets, blockedAssets);

        version = latestVersion[vault] + 1;
        latestVersion[vault] = version;
        bytes32 key = policyKey(vault, version);
        bytes32 enforceableHash = hashEnforceablePolicy(
            input,
            classLimits,
            allowedAssets,
            blockedAssets
        );
        _policies[key] = PolicyRecord({
            owner: vaultOwner,
            vault: vault,
            policyHash: input.policyHash,
            enforceablePolicyHash: enforceableHash,
            version: version,
            maximumSingleAssetBps: input.maximumSingleAssetBps,
            maximumSingleIssuerBps: input.maximumSingleIssuerBps,
            minimumCashBps: input.minimumCashBps,
            maximumSlippageBps: input.maximumSlippageBps,
            maximumPriceAgeSeconds: input.maximumPriceAgeSeconds,
            approvalMode: input.approvalMode,
            allowlistEnabled: input.allowlistEnabled,
            enabled: true,
            createdAt: uint64(block.timestamp)
        });

        for (uint256 index; index < classLimits.length; ++index) {
            _classLimits[key].push(classLimits[index]);
        }
        for (uint256 index; index < allowedAssets.length; ++index) {
            _allowedAssets[key][allowedAssets[index]] = true;
        }
        for (uint256 index; index < blockedAssets.length; ++index) {
            _blockedAssets[key][blockedAssets[index]] = true;
        }

        emit PolicyRegistered(
            vault,
            vaultOwner,
            version,
            input.policyHash,
            enforceableHash,
            input.approvalMode
        );
    }

    /// @notice Vault owners may enable or disable their versions. The protocol
    /// owner has emergency disable-only authority and cannot reactivate a user's
    /// policy or substitute a new one.
    function setPolicyEnabled(
        address vault,
        uint32 version,
        bool enabled
    ) external {
        bytes32 key = policyKey(vault, version);
        PolicyRecord storage policy = _policies[key];
        if (policy.vault == address(0)) revert PolicyNotFound(vault, version);

        address vaultOwner = _vaultOwner(vault);
        bool vaultOwnerCall = msg.sender == vaultOwner;
        bool emergencyDisable = msg.sender == owner() && !enabled;
        if (!vaultOwnerCall && !emergencyDisable) {
            revert UnauthorizedPolicyManager(msg.sender, vaultOwner);
        }
        policy.enabled = enabled;
        emit PolicyStatusUpdated(vault, version, enabled, msg.sender);
    }

    function getPolicy(
        address vault,
        uint32 version
    ) external view returns (PolicyRecord memory) {
        PolicyRecord memory policy = _policies[policyKey(vault, version)];
        if (policy.vault == address(0)) revert PolicyNotFound(vault, version);
        return policy;
    }

    function classLimitCount(
        address vault,
        uint32 version
    ) external view returns (uint256) {
        return _classLimits[policyKey(vault, version)].length;
    }

    function classLimitAt(
        address vault,
        uint32 version,
        uint256 index
    ) external view returns (ClassLimit memory) {
        return _classLimits[policyKey(vault, version)][index];
    }

    function isAssetAllowed(
        address vault,
        uint32 version,
        bytes32 assetId
    ) external view returns (bool) {
        bytes32 key = policyKey(vault, version);
        PolicyRecord storage policy = _policies[key];
        if (policy.vault == address(0) || !policy.enabled) return false;
        if (_blockedAssets[key][assetId]) return false;
        return !policy.allowlistEnabled || _allowedAssets[key][assetId];
    }

    function isAssetExplicitlyAllowed(
        address vault,
        uint32 version,
        bytes32 assetId
    ) external view returns (bool) {
        return _allowedAssets[policyKey(vault, version)][assetId];
    }

    function isAssetBlocked(
        address vault,
        uint32 version,
        bytes32 assetId
    ) external view returns (bool) {
        return _blockedAssets[policyKey(vault, version)][assetId];
    }

    function policyKey(
        address vault,
        uint32 version
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(vault, version));
    }

    function hashEnforceablePolicy(
        PolicyInput calldata input,
        ClassLimit[] calldata classLimits,
        bytes32[] calldata allowedAssets,
        bytes32[] calldata blockedAssets
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    input.maximumSingleAssetBps,
                    input.maximumSingleIssuerBps,
                    input.minimumCashBps,
                    input.maximumSlippageBps,
                    input.maximumPriceAgeSeconds,
                    input.approvalMode,
                    input.allowlistEnabled,
                    classLimits,
                    allowedAssets,
                    blockedAssets
                )
            );
    }

    function _validateInput(
        PolicyInput calldata input,
        ClassLimit[] calldata classLimits,
        bytes32[] calldata allowedAssets,
        bytes32[] calldata blockedAssets
    ) private view {
        if (input.policyHash == bytes32(0)) revert InvalidPolicyHash();
        _validateNonzeroBps(
            "maximumSingleAssetBps",
            input.maximumSingleAssetBps
        );
        _validateNonzeroBps(
            "maximumSingleIssuerBps",
            input.maximumSingleIssuerBps
        );
        _validateBps("minimumCashBps", input.minimumCashBps);
        _validateBps("maximumSlippageBps", input.maximumSlippageBps);
        if (
            input.maximumPriceAgeSeconds == 0 ||
            input.maximumPriceAgeSeconds > MAX_PRICE_AGE_LIMIT
        ) {
            revert InvalidPriceAge(input.maximumPriceAgeSeconds);
        }
        _checkLength(classLimits.length);
        _checkLength(allowedAssets.length);
        _checkLength(blockedAssets.length);
        if (input.allowlistEnabled && allowedAssets.length == 0) {
            revert EmptyAllowlist();
        }
        if (!input.allowlistEnabled && allowedAssets.length != 0) {
            revert UnexpectedAllowlistEntries();
        }

        uint256 totalMinimumBps;
        bytes32 previousClass;
        for (uint256 index; index < classLimits.length; ++index) {
            ClassLimit calldata limit = classLimits[index];
            if (
                limit.assetClass == bytes32(0) ||
                (index != 0 && uint256(limit.assetClass) <= uint256(previousClass))
            ) {
                revert DuplicateOrUnsortedItem(limit.assetClass);
            }
            if (
                limit.minimumBps > limit.maximumBps ||
                limit.maximumBps > MAX_BPS
            ) {
                revert InvalidClassLimit(
                    limit.assetClass,
                    limit.minimumBps,
                    limit.maximumBps
                );
            }
            totalMinimumBps += limit.minimumBps;
            previousClass = limit.assetClass;
        }
        if (totalMinimumBps > MAX_BPS) {
            revert TotalClassMinimumTooHigh(totalMinimumBps);
        }

        _validateAssetList(allowedAssets);
        _validateAssetList(blockedAssets);
        uint256 allowedIndex;
        uint256 blockedIndex;
        while (
            allowedIndex < allowedAssets.length &&
            blockedIndex < blockedAssets.length
        ) {
            bytes32 allowed = allowedAssets[allowedIndex];
            bytes32 blocked = blockedAssets[blockedIndex];
            if (allowed == blocked) revert AssetConflict(allowed);
            if (uint256(allowed) < uint256(blocked)) {
                ++allowedIndex;
            } else {
                ++blockedIndex;
            }
        }
    }

    function _validateAssetList(bytes32[] calldata assetIds) private view {
        bytes32 previous;
        for (uint256 index; index < assetIds.length; ++index) {
            bytes32 assetId = assetIds[index];
            if (
                assetId == bytes32(0) ||
                (index != 0 && uint256(assetId) <= uint256(previous))
            ) {
                revert DuplicateOrUnsortedItem(assetId);
            }
            if (!assetRegistry.assetExists(assetId)) {
                revert AssetNotRegistered(assetId);
            }
            previous = assetId;
        }
    }

    function _vaultOwner(address vault) private view returns (address result) {
        if (vault == address(0) || vault.code.length == 0) {
            revert InvalidVault(vault);
        }
        result = IAliveVaultOwner(vault).owner();
        if (result == address(0)) revert InvalidVault(vault);
    }

    function _checkLength(uint256 supplied) private pure {
        if (supplied > MAX_POLICY_ITEMS) {
            revert TooManyPolicyItems(supplied, MAX_POLICY_ITEMS);
        }
    }

    function _validateBps(bytes32 field, uint16 value) private pure {
        if (value > MAX_BPS) revert InvalidBasisPoints(field, value);
    }

    function _validateNonzeroBps(bytes32 field, uint16 value) private pure {
        if (value == 0 || value > MAX_BPS) {
            revert InvalidBasisPoints(field, value);
        }
    }
}
