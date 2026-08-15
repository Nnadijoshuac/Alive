// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IAliveEligibilityRegistry} from "./interfaces/IAliveEligibilityRegistry.sol";
import {IAliveRwaAssetRegistry} from "./interfaces/IAliveRwaAssetRegistry.sol";

/// @title ALIVE eligibility registry
/// @notice Stores the latest signed eligibility verdict per RWA asset and
/// exposes a single boolean gate (isEligible) other contracts can trust.
/// The signer decides nothing on-chain by itself: this contract only
/// accepts a publish when it is EIP-712 signed by the authorized off-chain
/// eligibility signer, references an asset that exists in
/// AliveRwaAssetRegistry, and is strictly newer than whatever is currently
/// stored for that asset -- an already-expired-but-not-yet-superseded
/// attestation can still be replayed to *downgrade* an asset back to
/// ineligible (which is safe), but never to resurrect an eligible status
/// after a newer, more restrictive verdict was published.
contract AliveEligibilityRegistry is
    IAliveEligibilityRegistry,
    EIP712,
    Ownable
{
    string public constant EIP712_NAME = "ALIVE Eligibility Gateway";
    string public constant EIP712_VERSION = "1";
    uint64 public constant MAX_ATTESTATION_LIFETIME = 1 days;

    bytes32 public constant ELIGIBILITY_ATTESTATION_TYPEHASH = keccak256(
        "EligibilityAttestation(bytes32 assetIdHash,bool eligible,bytes32 reasonHash,bytes32 passportHash,bytes32 marketSnapshotHash,bytes32 policyHash,uint64 issuedAt,uint64 validUntil,bytes32 nonce)"
    );

    error AssetNotRegistered(bytes32 assetId);
    error EmptyAttestationField(bytes32 field);
    error InvalidAttestationTimeRange(uint64 issuedAt, uint64 validUntil);
    error AttestationIssuedInFuture(uint64 issuedAt, uint64 currentTime);
    error AttestationLifetimeTooLong(uint64 lifetime);
    error AttestationNotNewerThanRecord(uint64 issuedAt, uint64 recordedIssuedAt);
    error InvalidAuthorizedSigner();
    error InvalidSignature();
    error NonceAlreadyConsumed(bytes32 nonce);
    error WrongSigner(address recovered, address expected);

    event AuthorizedSignerUpdated(
        address indexed previousSigner,
        address indexed newSigner
    );
    event EligibilityUpdated(
        bytes32 indexed assetId,
        bool eligible,
        bytes32 reasonHash,
        uint64 validUntil,
        uint64 version
    );

    IAliveRwaAssetRegistry public immutable assetRegistry;
    address public authorizedSigner;

    mapping(bytes32 assetId => EligibilityRecord record) private _records;
    mapping(bytes32 nonce => bool consumed) private _consumedNonces;

    constructor(
        IAliveRwaAssetRegistry assetRegistry_,
        address authorizedSigner_,
        address initialOwner
    ) EIP712(EIP712_NAME, EIP712_VERSION) Ownable(initialOwner) {
        if (authorizedSigner_ == address(0)) {
            revert InvalidAuthorizedSigner();
        }
        assetRegistry = assetRegistry_;
        authorizedSigner = authorizedSigner_;
    }

    function setAuthorizedSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidAuthorizedSigner();
        address previousSigner = authorizedSigner;
        authorizedSigner = newSigner;
        emit AuthorizedSignerUpdated(previousSigner, newSigner);
    }

    function publishEligibility(
        EligibilityAttestation calldata attestation,
        bytes calldata signature
    ) external returns (bytes32 digest) {
        if (!assetRegistry.assetExists(attestation.assetIdHash)) {
            revert AssetNotRegistered(attestation.assetIdHash);
        }
        _validateFields(attestation);

        EligibilityRecord storage existing = _records[attestation.assetIdHash];
        if (attestation.issuedAt <= existing.issuedAt) {
            revert AttestationNotNewerThanRecord(
                attestation.issuedAt,
                existing.issuedAt
            );
        }
        if (_consumedNonces[attestation.nonce]) {
            revert NonceAlreadyConsumed(attestation.nonce);
        }

        digest = _hashTypedDataV4(_hashAttestationStruct(attestation));
        (address recovered, ECDSA.RecoverError recoverError, ) = ECDSA
            .tryRecover(digest, signature);
        if (recoverError != ECDSA.RecoverError.NoError) {
            revert InvalidSignature();
        }
        if (recovered != authorizedSigner) {
            revert WrongSigner(recovered, authorizedSigner);
        }

        _consumedNonces[attestation.nonce] = true;
        uint64 nextVersion = existing.version + 1;
        _records[attestation.assetIdHash] = EligibilityRecord({
            eligible: attestation.eligible,
            reasonHash: attestation.reasonHash,
            passportHash: attestation.passportHash,
            marketSnapshotHash: attestation.marketSnapshotHash,
            policyHash: attestation.policyHash,
            issuedAt: attestation.issuedAt,
            validUntil: attestation.validUntil,
            version: nextVersion
        });

        emit EligibilityUpdated(
            attestation.assetIdHash,
            attestation.eligible,
            attestation.reasonHash,
            attestation.validUntil,
            nextVersion
        );
    }

    /// @notice True only when: a verdict was published, it marked the asset
    /// eligible, it has not expired, and the asset is still enabled in the
    /// registry. Any one of those failing means capital must not move.
    function isEligible(bytes32 assetId) external view returns (bool) {
        EligibilityRecord storage record = _records[assetId];
        if (!record.eligible) return false;
        if (record.version == 0) return false;
        if (block.timestamp >= record.validUntil) return false;
        if (!assetRegistry.assetExists(assetId)) return false;
        return assetRegistry.getAsset(assetId).enabled;
    }

    function getRecord(
        bytes32 assetId
    ) external view returns (EligibilityRecord memory) {
        return _records[assetId];
    }

    function isNonceConsumed(bytes32 nonce) external view returns (bool) {
        return _consumedNonces[nonce];
    }

    function hashAttestation(
        EligibilityAttestation calldata attestation
    ) external view returns (bytes32) {
        return _hashTypedDataV4(_hashAttestationStruct(attestation));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _validateFields(
        EligibilityAttestation calldata attestation
    ) private view {
        if (attestation.nonce == bytes32(0)) {
            revert EmptyAttestationField("nonce");
        }
        if (attestation.reasonHash == bytes32(0)) {
            revert EmptyAttestationField("reasonHash");
        }
        if (attestation.passportHash == bytes32(0)) {
            revert EmptyAttestationField("passportHash");
        }
        if (attestation.policyHash == bytes32(0)) {
            revert EmptyAttestationField("policyHash");
        }
        if (attestation.issuedAt >= attestation.validUntil) {
            revert InvalidAttestationTimeRange(
                attestation.issuedAt,
                attestation.validUntil
            );
        }
        uint64 lifetime = attestation.validUntil - attestation.issuedAt;
        if (lifetime > MAX_ATTESTATION_LIFETIME) {
            revert AttestationLifetimeTooLong(lifetime);
        }
        uint64 currentTime = uint64(block.timestamp);
        if (attestation.issuedAt > currentTime) {
            revert AttestationIssuedInFuture(attestation.issuedAt, currentTime);
        }
    }

    function _hashAttestationStruct(
        EligibilityAttestation calldata attestation
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ELIGIBILITY_ATTESTATION_TYPEHASH,
                    attestation.assetIdHash,
                    attestation.eligible,
                    attestation.reasonHash,
                    attestation.passportHash,
                    attestation.marketSnapshotHash,
                    attestation.policyHash,
                    attestation.issuedAt,
                    attestation.validUntil,
                    attestation.nonce
                )
            );
    }
}
