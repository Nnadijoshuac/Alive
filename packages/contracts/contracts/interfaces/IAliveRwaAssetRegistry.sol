// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAliveRwaAssetRegistry {
    struct RwaAsset {
        address token;
        bytes32 assetClass;
        bytes32 issuerId;
        bytes32 metadataHash;
        bytes32 provenanceHash;
        uint64 registeredAt;
        bool enabled;
    }

    function assetExists(bytes32 assetId) external view returns (bool);

    function assetCount() external view returns (uint256);

    function assetIdAt(uint256 index) external view returns (bytes32);

    function assetIdForToken(address token) external view returns (bytes32);

    function getAsset(
        bytes32 assetId
    ) external view returns (RwaAsset memory);
}
