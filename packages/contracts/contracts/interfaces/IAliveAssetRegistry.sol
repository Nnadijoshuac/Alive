// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAliveAssetRegistry {
    struct Asset {
        address owner;
        bytes32 fingerprintHash;
        bytes32 metadataHash;
        uint64 registeredAt;
        string metadataURI;
    }

    function assetExists(bytes32 assetId) external view returns (bool);

    function assetOwner(bytes32 assetId) external view returns (address);

    function getAsset(bytes32 assetId) external view returns (Asset memory);
}
