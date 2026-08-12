// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IAliveAssetRegistry} from "./interfaces/IAliveAssetRegistry.sol";
import {IAliveAttestationRegistry} from "./interfaces/IAliveAttestationRegistry.sol";

/// @title ALIVE Attestation Registry
/// @notice Validates short-lived EIP-712 attestations from the authorized ALIVE
/// verifier. Session IDs are globally single-use capabilities.
contract AliveAttestationRegistry is
    IAliveAttestationRegistry,
    EIP712,
    Ownable
{
    uint16 public constant MAX_SCORE_BPS = 10_000;
    uint64 public constant MAX_ATTESTATION_LIFETIME = 1 days;
    string public constant EIP712_NAME = "Alive Protocol";
    string public constant EIP712_VERSION = "1";

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(bytes32 assetId,bytes32 fingerprintHash,bytes32 sessionId,address subject,bytes32 context,uint16 identityScore,uint16 livenessScore,uint16 integrityScore,bool verified,bytes32 evidenceHash,uint64 issuedAt,uint64 expiresAt)"
    );

    error AssetNotRegistered(bytes32 assetId);
    error AttestationExpired(uint64 expiresAt, uint64 currentTime);
    error AttestationIssuedInFuture(uint64 issuedAt, uint64 currentTime);
    error AttestationLifetimeTooLong(uint64 lifetime);
    error ContextConsumerRequired(bytes32 context);
    error FingerprintHashMismatch(bytes32 expected, bytes32 actual);
    error InvalidAssetId();
    error InvalidAttestationTimeRange(uint64 issuedAt, uint64 expiresAt);
    error InvalidContext();
    error InvalidEvidenceHash();
    error InvalidScore(bytes32 scoreName, uint16 score);
    error InvalidSessionId();
    error InvalidSignature();
    error InvalidSubject();
    error InvalidVerifier();
    error SessionAlreadyConsumed(bytes32 sessionId);
    error UnauthorizedConsumer(address consumer);
    error UnauthorizedSubject(address caller, address subject);
    error WrongSigner(address recovered, address expected);

    event AssetVerified(
        bytes32 indexed assetId,
        bytes32 fingerprintHash,
        bytes32 indexed sessionId,
        address indexed subject,
        bytes32 context,
        uint16 identityScore,
        uint16 livenessScore,
        uint16 integrityScore,
        bool verified,
        bytes32 evidenceHash,
        uint64 issuedAt,
        uint64 expiresAt,
        bytes32 digest
    );
    event AuthorizedConsumerUpdated(
        address indexed consumer,
        bool isAuthorized
    );
    event AuthorizedVerifierUpdated(
        address indexed previousVerifier,
        address indexed newVerifier
    );

    struct VerificationRecord {
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
        uint64 recordedAt;
        bytes32 digest;
    }

    IAliveAssetRegistry public immutable assetRegistry;
    address public authorizedVerifier;

    mapping(bytes32 sessionId => bool consumed) private _consumedSessions;
    mapping(address consumer => bool authorized) public authorizedConsumers;
    mapping(bytes32 assetId => VerificationRecord record)
        public latestVerification;
    mapping(bytes32 assetId => uint256 count) public verificationCount;

    constructor(
        address assetRegistry_,
        address authorizedVerifier_,
        address initialOwner
    ) EIP712(EIP712_NAME, EIP712_VERSION) Ownable(initialOwner) {
        if (assetRegistry_ == address(0)) revert InvalidAssetId();
        if (authorizedVerifier_ == address(0)) revert InvalidVerifier();
        assetRegistry = IAliveAssetRegistry(assetRegistry_);
        authorizedVerifier = authorizedVerifier_;
    }

    /// @notice Rotates the verifier used for attestations not yet consumed.
    function setAuthorizedVerifier(address newVerifier) external onlyOwner {
        if (newVerifier == address(0)) revert InvalidVerifier();
        address previousVerifier = authorizedVerifier;
        authorizedVerifier = newVerifier;
        emit AuthorizedVerifierUpdated(previousVerifier, newVerifier);
    }

    /// @notice Authorizes a trusted protocol contract to consume nonzero,
    /// context-bound attestations. The consumer remains responsible for matching
    /// the signed context to its exact operation before calling this registry.
    function setAuthorizedConsumer(
        address consumer,
        bool isAuthorized
    ) external onlyOwner {
        if (consumer == address(0)) revert UnauthorizedConsumer(consumer);
        authorizedConsumers[consumer] = isAuthorized;
        emit AuthorizedConsumerUpdated(consumer, isAuthorized);
    }

    /// @notice Records a standalone inspection. Only its signed subject may
    /// submit it, preventing third parties from consuming the session first.
    function submitAttestation(
        Attestation calldata attestation,
        bytes calldata signature
    ) external returns (bytes32 digest) {
        if (attestation.context != bytes32(0)) {
            revert ContextConsumerRequired(attestation.context);
        }
        if (msg.sender != attestation.subject) {
            revert UnauthorizedSubject(msg.sender, attestation.subject);
        }
        return _validateAndConsume(attestation, signature);
    }

    /// @notice Records a context-bound inspection for an authorized protocol
    /// contract, such as AliveEscrow.
    function consumeAttestation(
        Attestation calldata attestation,
        bytes calldata signature
    ) external returns (bytes32 digest) {
        if (!authorizedConsumers[msg.sender]) {
            revert UnauthorizedConsumer(msg.sender);
        }
        if (attestation.context == bytes32(0)) revert InvalidContext();
        return _validateAndConsume(attestation, signature);
    }

    function hashAttestation(
        Attestation calldata attestation
    ) public view returns (bytes32) {
        return _hashTypedDataV4(_hashAttestationStruct(attestation));
    }

    function isSessionConsumed(
        bytes32 sessionId
    ) external view returns (bool) {
        return _consumedSessions[sessionId];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _validateAndConsume(
        Attestation calldata attestation,
        bytes calldata signature
    ) private returns (bytes32 digest) {
        _validateFields(attestation);
        if (_consumedSessions[attestation.sessionId]) {
            revert SessionAlreadyConsumed(attestation.sessionId);
        }

        digest = _hashTypedDataV4(_hashAttestationStruct(attestation));
        (
            address recovered,
            ECDSA.RecoverError recoverError,

        ) = ECDSA.tryRecover(digest, signature);
        if (recoverError != ECDSA.RecoverError.NoError) {
            revert InvalidSignature();
        }
        if (recovered != authorizedVerifier) {
            revert WrongSigner(recovered, authorizedVerifier);
        }

        // Checks and signature validation are complete. Consume before writing
        // the latest record so the single-use capability cannot be reentered.
        _consumedSessions[attestation.sessionId] = true;
        latestVerification[attestation.assetId] = VerificationRecord({
            fingerprintHash: attestation.fingerprintHash,
            sessionId: attestation.sessionId,
            subject: attestation.subject,
            context: attestation.context,
            identityScore: attestation.identityScore,
            livenessScore: attestation.livenessScore,
            integrityScore: attestation.integrityScore,
            verified: attestation.verified,
            evidenceHash: attestation.evidenceHash,
            issuedAt: attestation.issuedAt,
            expiresAt: attestation.expiresAt,
            recordedAt: uint64(block.timestamp),
            digest: digest
        });
        unchecked {
            ++verificationCount[attestation.assetId];
        }

        emit AssetVerified(
            attestation.assetId,
            attestation.fingerprintHash,
            attestation.sessionId,
            attestation.subject,
            attestation.context,
            attestation.identityScore,
            attestation.livenessScore,
            attestation.integrityScore,
            attestation.verified,
            attestation.evidenceHash,
            attestation.issuedAt,
            attestation.expiresAt,
            digest
        );
    }

    function _validateFields(Attestation calldata attestation) private view {
        if (attestation.assetId == bytes32(0)) revert InvalidAssetId();
        if (attestation.sessionId == bytes32(0)) revert InvalidSessionId();
        if (attestation.subject == address(0)) revert InvalidSubject();
        if (attestation.evidenceHash == bytes32(0)) {
            revert InvalidEvidenceHash();
        }
        if (!assetRegistry.assetExists(attestation.assetId)) {
            revert AssetNotRegistered(attestation.assetId);
        }
        bytes32 registeredFingerprintHash = assetRegistry
            .getAsset(attestation.assetId)
            .fingerprintHash;
        if (attestation.fingerprintHash != registeredFingerprintHash) {
            revert FingerprintHashMismatch(
                registeredFingerprintHash,
                attestation.fingerprintHash
            );
        }
        _validateScore("identityScore", attestation.identityScore);
        _validateScore("livenessScore", attestation.livenessScore);
        _validateScore("integrityScore", attestation.integrityScore);

        uint64 currentTime = uint64(block.timestamp);
        if (attestation.issuedAt >= attestation.expiresAt) {
            revert InvalidAttestationTimeRange(
                attestation.issuedAt,
                attestation.expiresAt
            );
        }
        uint64 lifetime = attestation.expiresAt - attestation.issuedAt;
        if (lifetime > MAX_ATTESTATION_LIFETIME) {
            revert AttestationLifetimeTooLong(lifetime);
        }
        if (attestation.issuedAt > currentTime) {
            revert AttestationIssuedInFuture(
                attestation.issuedAt,
                currentTime
            );
        }
        if (attestation.expiresAt <= currentTime) {
            revert AttestationExpired(attestation.expiresAt, currentTime);
        }
    }

    function _validateScore(bytes32 name, uint16 score) private pure {
        if (score > MAX_SCORE_BPS) revert InvalidScore(name, score);
    }

    function _hashAttestationStruct(
        Attestation calldata attestation
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH,
                    attestation.assetId,
                    attestation.fingerprintHash,
                    attestation.sessionId,
                    attestation.subject,
                    attestation.context,
                    attestation.identityScore,
                    attestation.livenessScore,
                    attestation.integrityScore,
                    attestation.verified,
                    attestation.evidenceHash,
                    attestation.issuedAt,
                    attestation.expiresAt
                )
            );
    }
}
