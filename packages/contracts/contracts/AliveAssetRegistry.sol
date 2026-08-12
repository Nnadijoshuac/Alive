// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAliveAssetRegistry} from "./interfaces/IAliveAssetRegistry.sol";

/// @title ALIVE Asset Registry
/// @notice Stores only compact commitments and public metadata references. Raw
/// inspection media and visual feature data must remain offchain.
contract AliveAssetRegistry is IAliveAssetRegistry {
    error AssetAlreadyRegistered(bytes32 assetId);
    error AssetNotRegistered(bytes32 assetId);
    error InvalidAssetId();
    error InvalidCommitment();
    error InvalidNewOwner();
    error NotAssetOwner(bytes32 assetId, address caller);

    event AssetRegistered(
        bytes32 indexed assetId,
        address indexed owner,
        bytes32 fingerprintHash,
        bytes32 metadataHash,
        string metadataURI,
        uint64 registeredAt
    );
    event AssetOwnershipTransferred(
        bytes32 indexed assetId,
        address indexed previousOwner,
        address indexed newOwner
    );

    mapping(bytes32 assetId => Asset asset) private _assets;

    /// @notice Registers an externally generated, globally unique asset ID.
    function registerAsset(
        bytes32 assetId,
        bytes32 fingerprintHash,
        bytes32 metadataHash,
        string calldata metadataURI
    ) external returns (bytes32) {
        if (assetId == bytes32(0)) revert InvalidAssetId();
        if (fingerprintHash == bytes32(0) || metadataHash == bytes32(0)) {
            revert InvalidCommitment();
        }
        if (_assets[assetId].owner != address(0)) {
            revert AssetAlreadyRegistered(assetId);
        }

        uint64 registeredAt = uint64(block.timestamp);
        _assets[assetId] = Asset({
            owner: msg.sender,
            fingerprintHash: fingerprintHash,
            metadataHash: metadataHash,
            registeredAt: registeredAt,
            metadataURI: metadataURI
        });

        emit AssetRegistered(
            assetId,
            msg.sender,
            fingerprintHash,
            metadataHash,
            metadataURI,
            registeredAt
        );
        return assetId;
    }

    function transferAsset(bytes32 assetId, address newOwner) external {
        Asset storage asset = _assets[assetId];
        if (asset.owner == address(0)) revert AssetNotRegistered(assetId);
        if (asset.owner != msg.sender) revert NotAssetOwner(assetId, msg.sender);
        if (newOwner == address(0)) revert InvalidNewOwner();

        address previousOwner = asset.owner;
        asset.owner = newOwner;
        emit AssetOwnershipTransferred(assetId, previousOwner, newOwner);
    }

    function assetExists(bytes32 assetId) external view returns (bool) {
        return _assets[assetId].owner != address(0);
    }

    function assetOwner(bytes32 assetId) external view returns (address) {
        address owner = _assets[assetId].owner;
        if (owner == address(0)) revert AssetNotRegistered(assetId);
        return owner;
    }

    function getAsset(bytes32 assetId) external view returns (Asset memory) {
        Asset memory asset = _assets[assetId];
        if (asset.owner == address(0)) revert AssetNotRegistered(assetId);
        return asset;
    }
}
