// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAliveEligibilityRegistry {
    struct EligibilityAttestation {
        bytes32 assetIdHash;
        bool eligible;
        bytes32 reasonHash;
        bytes32 passportHash;
        bytes32 marketSnapshotHash;
        bytes32 policyHash;
        uint64 issuedAt;
        uint64 validUntil;
        bytes32 nonce;
    }

    struct EligibilityRecord {
        bool eligible;
        bytes32 reasonHash;
        bytes32 passportHash;
        bytes32 marketSnapshotHash;
        bytes32 policyHash;
        uint64 issuedAt;
        uint64 validUntil;
        uint64 version;
    }

    function publishEligibility(
        EligibilityAttestation calldata attestation,
        bytes calldata signature
    ) external returns (bytes32 digest);

    function isEligible(bytes32 assetId) external view returns (bool);

    function getRecord(
        bytes32 assetId
    ) external view returns (EligibilityRecord memory);
}
