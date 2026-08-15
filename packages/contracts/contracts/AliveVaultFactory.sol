// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AliveVault} from "./AliveVault.sol";

/// @title ALIVE permissionless user-vault factory
/// @notice Creates vault instances owned directly by the calling user while
/// reusing one reviewed registry, verifier, router, and demo cash asset.
contract AliveVaultFactory {
    error InvalidConfiguration(address supplied);

    event VaultCreated(
        address indexed owner,
        address indexed vault,
        uint256 indexed vaultIndex
    );

    bytes32 public immutable cashAssetId;
    address public immutable assetRegistry;
    address public immutable policyRegistry;
    address public immutable strategyVerifier;
    address public immutable executionRouter;
    address public immutable eligibilityRegistry;

    address[] private _vaults;
    mapping(address owner => address[] vaults) private _ownerVaults;
    mapping(address vault => bool created) public isFactoryVault;

    constructor(
        bytes32 cashAssetId_,
        address assetRegistry_,
        address policyRegistry_,
        address strategyVerifier_,
        address executionRouter_,
        address eligibilityRegistry_
    ) {
        if (cashAssetId_ == bytes32(0)) revert InvalidConfiguration(address(0));
        _requireContract(assetRegistry_);
        _requireContract(policyRegistry_);
        _requireContract(strategyVerifier_);
        _requireContract(executionRouter_);
        _requireContract(eligibilityRegistry_);
        cashAssetId = cashAssetId_;
        assetRegistry = assetRegistry_;
        policyRegistry = policyRegistry_;
        strategyVerifier = strategyVerifier_;
        executionRouter = executionRouter_;
        eligibilityRegistry = eligibilityRegistry_;
    }

    function createVault() external returns (address vault) {
        vault = address(
            new AliveVault(
                msg.sender,
                cashAssetId,
                assetRegistry,
                policyRegistry,
                strategyVerifier,
                executionRouter,
                eligibilityRegistry
            )
        );
        uint256 index = _vaults.length;
        _vaults.push(vault);
        _ownerVaults[msg.sender].push(vault);
        isFactoryVault[vault] = true;
        emit VaultCreated(msg.sender, vault, index);
    }

    function vaultCount() external view returns (uint256) {
        return _vaults.length;
    }

    function vaultAt(uint256 index) external view returns (address) {
        return _vaults[index];
    }

    function ownerVaultCount(address owner) external view returns (uint256) {
        return _ownerVaults[owner].length;
    }

    function ownerVaultAt(
        address owner,
        uint256 index
    ) external view returns (address) {
        return _ownerVaults[owner][index];
    }

    function _requireContract(address supplied) private view {
        if (supplied == address(0) || supplied.code.length == 0) {
            revert InvalidConfiguration(supplied);
        }
    }
}
