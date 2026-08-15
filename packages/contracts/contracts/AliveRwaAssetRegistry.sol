// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IAliveRwaAssetRegistry} from "./interfaces/IAliveRwaAssetRegistry.sol";

/// @title ALIVE approved RWA asset registry
/// @notice Stores compact, administrator-reviewed token facts. Product
/// documents and other large source material remain offchain; metadata and
/// provenance hashes commit to the reviewed records.
contract AliveRwaAssetRegistry is IAliveRwaAssetRegistry, Ownable {
    uint8 public constant REQUIRED_TOKEN_DECIMALS = 6;

    error AssetAlreadyRegistered(bytes32 assetId);
    error AssetNotRegistered(bytes32 assetId);
    error InvalidAssetClass();
    error InvalidAssetId();
    error InvalidCommitment();
    error InvalidIssuerId();
    error InvalidToken(address token);
    error TokenAlreadyRegistered(address token, bytes32 assetId);
    error UnsupportedTokenDecimals(address token, uint8 decimals);

    event RwaAssetRegistered(
        bytes32 indexed assetId,
        address indexed token,
        bytes32 indexed assetClass,
        bytes32 issuerId,
        bytes32 metadataHash,
        bytes32 provenanceHash,
        uint64 registeredAt
    );
    event RwaAssetStatusUpdated(bytes32 indexed assetId, bool enabled);
    event RwaAssetCommitmentsUpdated(
        bytes32 indexed assetId,
        bytes32 metadataHash,
        bytes32 provenanceHash
    );

    mapping(bytes32 assetId => RwaAsset asset) private _assets;
    mapping(address token => bytes32 assetId) private _assetIdsByToken;
    bytes32[] private _assetIds;

    constructor(address initialOwner) Ownable(initialOwner) {}

    function registerAsset(
        bytes32 assetId,
        address token,
        bytes32 assetClass,
        bytes32 issuerId,
        bytes32 metadataHash,
        bytes32 provenanceHash
    ) external onlyOwner {
        if (assetId == bytes32(0)) revert InvalidAssetId();
        if (token == address(0) || token.code.length == 0) {
            revert InvalidToken(token);
        }
        if (assetClass == bytes32(0)) revert InvalidAssetClass();
        if (issuerId == bytes32(0)) revert InvalidIssuerId();
        if (metadataHash == bytes32(0) || provenanceHash == bytes32(0)) {
            revert InvalidCommitment();
        }
        if (_assets[assetId].token != address(0)) {
            revert AssetAlreadyRegistered(assetId);
        }
        bytes32 existingAssetId = _assetIdsByToken[token];
        if (existingAssetId != bytes32(0)) {
            revert TokenAlreadyRegistered(token, existingAssetId);
        }

        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        if (tokenDecimals != REQUIRED_TOKEN_DECIMALS) {
            revert UnsupportedTokenDecimals(token, tokenDecimals);
        }

        uint64 registeredAt = uint64(block.timestamp);
        _assets[assetId] = RwaAsset({
            token: token,
            assetClass: assetClass,
            issuerId: issuerId,
            metadataHash: metadataHash,
            provenanceHash: provenanceHash,
            registeredAt: registeredAt,
            enabled: true
        });
        _assetIdsByToken[token] = assetId;
        _assetIds.push(assetId);

        emit RwaAssetRegistered(
            assetId,
            token,
            assetClass,
            issuerId,
            metadataHash,
            provenanceHash,
            registeredAt
        );
    }

    function setAssetEnabled(
        bytes32 assetId,
        bool enabled
    ) external onlyOwner {
        RwaAsset storage asset = _getAsset(assetId);
        asset.enabled = enabled;
        emit RwaAssetStatusUpdated(assetId, enabled);
    }

    function updateCommitments(
        bytes32 assetId,
        bytes32 metadataHash,
        bytes32 provenanceHash
    ) external onlyOwner {
        if (metadataHash == bytes32(0) || provenanceHash == bytes32(0)) {
            revert InvalidCommitment();
        }
        RwaAsset storage asset = _getAsset(assetId);
        asset.metadataHash = metadataHash;
        asset.provenanceHash = provenanceHash;
        emit RwaAssetCommitmentsUpdated(
            assetId,
            metadataHash,
            provenanceHash
        );
    }

    function assetExists(bytes32 assetId) external view returns (bool) {
        return _assets[assetId].token != address(0);
    }

    function assetCount() external view returns (uint256) {
        return _assetIds.length;
    }

    function assetIdAt(uint256 index) external view returns (bytes32) {
        return _assetIds[index];
    }

    function assetIdForToken(address token) external view returns (bytes32) {
        return _assetIdsByToken[token];
    }

    function getAsset(
        bytes32 assetId
    ) external view returns (RwaAsset memory) {
        RwaAsset memory asset = _assets[assetId];
        if (asset.token == address(0)) revert AssetNotRegistered(assetId);
        return asset;
    }

    function _getAsset(
        bytes32 assetId
    ) private view returns (RwaAsset storage asset) {
        asset = _assets[assetId];
        if (asset.token == address(0)) revert AssetNotRegistered(assetId);
    }
}
