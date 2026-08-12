// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAliveAttestationRegistry {
    struct Attestation {
        bytes32 assetId;
        bytes32 fingerprintHash;
        bytes32 sessionId;
        address subject;
        bytes32 context;
        uint16 identityScore;
        uint16 livenessScore;
        uint16 integrityScore;
        bool verified;
        bytes32 evidenceHash;
        uint64 issuedAt;
        uint64 expiresAt;
    }

    function consumeAttestation(
        Attestation calldata attestation,
        bytes calldata signature
    ) external returns (bytes32 digest);

    function submitAttestation(
        Attestation calldata attestation,
        bytes calldata signature
    ) external returns (bytes32 digest);

    function hashAttestation(
        Attestation calldata attestation
    ) external view returns (bytes32);

    function isSessionConsumed(bytes32 sessionId) external view returns (bool);
}
