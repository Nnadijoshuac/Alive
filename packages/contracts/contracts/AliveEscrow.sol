// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAliveAssetRegistry} from "./interfaces/IAliveAssetRegistry.sol";
import {IAliveAttestationRegistry} from "./interfaces/IAliveAttestationRegistry.sol";

/// @title ALIVE verification-gated escrow
/// @notice Releases payment only after a fresh, context-bound ALIVE attestation
/// meets the buyer's identity and liveness requirements.
contract AliveEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_SCORE_BPS = 10_000;
    uint64 public constant MAX_ESCROW_DURATION = 30 days;

    enum EscrowStatus {
        None,
        Created,
        AwaitingVerification,
        Released,
        Refunded,
        Cancelled,
        Funded,
        Disputed
    }

    struct Escrow {
        bytes32 assetId;
        address buyer;
        address seller;
        IERC20 token;
        uint256 amount;
        uint16 requiredIdentityScore;
        uint16 requiredLivenessScore;
        uint64 createdAt;
        uint64 expiresAt;
        EscrowStatus status;
    }

    error AssetNotRegistered(bytes32 assetId);
    error EscrowExpired(bytes32 escrowId, uint64 expiresAt);
    error EscrowNotExpired(bytes32 escrowId, uint64 expiresAt);
    error EscrowNotFound(bytes32 escrowId);
    error AttestationPredatesFunding(uint64 issuedAt, uint64 fundedAt);
    error InvalidAmount();
    error InvalidAssetId();
    error InvalidEscrowExpiry(uint64 expiresAt);
    error InvalidEscrowStatus(
        bytes32 escrowId,
        EscrowStatus expected,
        EscrowStatus actual
    );
    error InvalidSeller();
    error InvalidDisputeReason();
    error InvalidThreshold(uint16 score);
    error InvalidToken(address token);
    error NotBuyer(address caller);
    error NotEscrowParty(address caller);
    error NotRefundAuthorized(address caller);
    error SellerNotAssetOwner(address seller, address assetOwner);
    error ThresholdNotMet(
        uint16 identityScore,
        uint16 requiredIdentityScore,
        uint16 livenessScore,
        uint16 requiredLivenessScore
    );
    error UnsupportedTokenTransfer(uint256 expected, uint256 received);
    error VerificationRejected();
    error WrongAttestationAsset(bytes32 expected, bytes32 actual);
    error WrongAttestationContext(bytes32 expected, bytes32 actual);
    error WrongAttestationSubject(address expected, address actual);

    event EscrowCreated(
        bytes32 indexed escrowId,
        bytes32 indexed assetId,
        address indexed buyer,
        address seller,
        address token,
        uint256 amount,
        uint16 requiredIdentityScore,
        uint16 requiredLivenessScore,
        uint64 expiresAt
    );
    event EscrowFunded(
        bytes32 indexed escrowId,
        address indexed buyer,
        uint256 amount
    );
    event EscrowAwaitingVerification(bytes32 indexed escrowId);
    event EscrowReleased(
        bytes32 indexed escrowId,
        address indexed seller,
        uint256 amount,
        bytes32 indexed attestationDigest
    );
    event EscrowRefunded(
        bytes32 indexed escrowId,
        address indexed buyer,
        uint256 amount,
        address authorizedBy
    );
    event EscrowCancelled(bytes32 indexed escrowId);
    event EscrowDisputed(
        bytes32 indexed escrowId,
        address indexed raisedBy,
        bytes32 indexed reasonHash
    );
    event DisputeResolved(
        bytes32 indexed escrowId,
        EscrowStatus resolution,
        address indexed resolvedBy
    );

    IAliveAssetRegistry public immutable assetRegistry;
    IAliveAttestationRegistry public immutable attestationRegistry;

    uint256 private _nextEscrowNonce;
    mapping(bytes32 escrowId => Escrow escrow) private _escrows;
    mapping(bytes32 escrowId => uint64 timestamp) public fundedAt;
    mapping(bytes32 escrowId => bytes32 reasonHash) public disputeReasonHash;

    constructor(address assetRegistry_, address attestationRegistry_) {
        if (assetRegistry_ == address(0)) revert InvalidAssetId();
        if (attestationRegistry_ == address(0)) revert InvalidToken(address(0));
        assetRegistry = IAliveAssetRegistry(assetRegistry_);
        attestationRegistry = IAliveAttestationRegistry(
            attestationRegistry_
        );
    }

    function createEscrow(
        bytes32 assetId,
        address seller,
        address token,
        uint256 amount,
        uint16 requiredIdentityScore,
        uint16 requiredLivenessScore,
        uint64 expiresAt
    ) external returns (bytes32 escrowId) {
        if (assetId == bytes32(0)) revert InvalidAssetId();
        if (!assetRegistry.assetExists(assetId)) {
            revert AssetNotRegistered(assetId);
        }
        if (seller == address(0) || seller == msg.sender) {
            revert InvalidSeller();
        }
        address currentAssetOwner = assetRegistry.assetOwner(assetId);
        if (currentAssetOwner != seller) {
            revert SellerNotAssetOwner(seller, currentAssetOwner);
        }
        if (token == address(0) || token.code.length == 0) {
            revert InvalidToken(token);
        }
        if (amount == 0) revert InvalidAmount();
        _validateThreshold(requiredIdentityScore);
        _validateThreshold(requiredLivenessScore);

        uint64 currentTime = uint64(block.timestamp);
        if (
            expiresAt <= currentTime ||
            expiresAt - currentTime > MAX_ESCROW_DURATION
        ) {
            revert InvalidEscrowExpiry(expiresAt);
        }

        uint256 nonce = ++_nextEscrowNonce;
        escrowId = keccak256(
            abi.encode(
                address(this),
                block.chainid,
                nonce,
                msg.sender,
                seller,
                assetId
            )
        );
        _escrows[escrowId] = Escrow({
            assetId: assetId,
            buyer: msg.sender,
            seller: seller,
            token: IERC20(token),
            amount: amount,
            requiredIdentityScore: requiredIdentityScore,
            requiredLivenessScore: requiredLivenessScore,
            createdAt: currentTime,
            expiresAt: expiresAt,
            status: EscrowStatus.Created
        });

        emit EscrowCreated(
            escrowId,
            assetId,
            msg.sender,
            seller,
            token,
            amount,
            requiredIdentityScore,
            requiredLivenessScore,
            expiresAt
        );
    }

    function fundEscrow(bytes32 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);
        _requireStatus(escrowId, escrow, EscrowStatus.Created);
        if (msg.sender != escrow.buyer) revert NotBuyer(msg.sender);
        if (block.timestamp >= escrow.expiresAt) {
            revert EscrowExpired(escrowId, escrow.expiresAt);
        }
        _requireSellerStillOwnsAsset(escrow);

        // Set state before interacting with the token. A failed or short
        // transfer reverts this effect atomically.
        escrow.status = EscrowStatus.Funded;
        fundedAt[escrowId] = uint64(block.timestamp);
        uint256 balanceBefore = escrow.token.balanceOf(address(this));
        escrow.token.safeTransferFrom(
            escrow.buyer,
            address(this),
            escrow.amount
        );
        uint256 received = escrow.token.balanceOf(address(this)) - balanceBefore;
        if (received != escrow.amount) {
            revert UnsupportedTokenTransfer(escrow.amount, received);
        }

        emit EscrowFunded(escrowId, escrow.buyer, escrow.amount);
        escrow.status = EscrowStatus.AwaitingVerification;
        emit EscrowAwaitingVerification(escrowId);
    }

    /// @notice Consumes and settles with one attestation in a single atomic
    /// transaction. Any token-transfer failure also rolls back session use.
    function settleWithAttestation(
        bytes32 escrowId,
        IAliveAttestationRegistry.Attestation calldata attestation,
        bytes calldata signature
    ) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);
        _requireActiveStatus(escrowId, escrow);
        if (block.timestamp >= escrow.expiresAt) {
            revert EscrowExpired(escrowId, escrow.expiresAt);
        }
        _requireSellerStillOwnsAsset(escrow);
        if (attestation.assetId != escrow.assetId) {
            revert WrongAttestationAsset(
                escrow.assetId,
                attestation.assetId
            );
        }
        bytes32 expectedContext = escrowContext(escrowId);
        if (attestation.context != expectedContext) {
            revert WrongAttestationContext(
                expectedContext,
                attestation.context
            );
        }
        if (attestation.subject != escrow.seller) {
            revert WrongAttestationSubject(
                escrow.seller,
                attestation.subject
            );
        }
        uint64 fundingTimestamp = fundedAt[escrowId];
        if (attestation.issuedAt < fundingTimestamp) {
            revert AttestationPredatesFunding(
                attestation.issuedAt,
                fundingTimestamp
            );
        }
        if (!attestation.verified) revert VerificationRejected();
        if (
            attestation.identityScore < escrow.requiredIdentityScore ||
            attestation.livenessScore < escrow.requiredLivenessScore
        ) {
            revert ThresholdNotMet(
                attestation.identityScore,
                escrow.requiredIdentityScore,
                attestation.livenessScore,
                escrow.requiredLivenessScore
            );
        }

        bool wasDisputed = escrow.status == EscrowStatus.Disputed;
        escrow.status = EscrowStatus.Released;
        bytes32 digest = attestationRegistry.consumeAttestation(
            attestation,
            signature
        );
        _safeTransferExact(escrow.token, escrow.seller, escrow.amount);

        emit EscrowReleased(escrowId, escrow.seller, escrow.amount, digest);
        if (wasDisputed) {
            emit DisputeResolved(
                escrowId,
                EscrowStatus.Released,
                msg.sender
            );
        }
    }

    /// @notice The seller may authorize a refund at any time. The buyer may
    /// recover funds unilaterally only once the escrow has expired.
    function refundEscrow(bytes32 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);
        _requireActiveStatus(escrowId, escrow);

        bool sellerAuthorized = msg.sender == escrow.seller;
        bool buyerTimedOut =
            msg.sender == escrow.buyer && block.timestamp >= escrow.expiresAt;
        if (!sellerAuthorized && !buyerTimedOut) {
            if (msg.sender == escrow.buyer) {
                revert EscrowNotExpired(escrowId, escrow.expiresAt);
            }
            revert NotRefundAuthorized(msg.sender);
        }

        bool wasDisputed = escrow.status == EscrowStatus.Disputed;
        escrow.status = EscrowStatus.Refunded;
        _safeTransferExact(escrow.token, escrow.buyer, escrow.amount);
        emit EscrowRefunded(
            escrowId,
            escrow.buyer,
            escrow.amount,
            msg.sender
        );
        if (wasDisputed) {
            emit DisputeResolved(
                escrowId,
                EscrowStatus.Refunded,
                msg.sender
            );
        }
    }

    /// @notice Records an offchain dispute-reason commitment without granting
    /// either party a unilateral withdrawal. A valid proof may still release;
    /// seller consent or buyer timeout may still refund.
    function raiseDispute(bytes32 escrowId, bytes32 reasonHash) external {
        Escrow storage escrow = _getEscrow(escrowId);
        _requireStatus(
            escrowId,
            escrow,
            EscrowStatus.AwaitingVerification
        );
        if (msg.sender != escrow.buyer && msg.sender != escrow.seller) {
            revert NotEscrowParty(msg.sender);
        }
        if (reasonHash == bytes32(0)) revert InvalidDisputeReason();
        if (block.timestamp >= escrow.expiresAt) {
            revert EscrowExpired(escrowId, escrow.expiresAt);
        }

        disputeReasonHash[escrowId] = reasonHash;
        escrow.status = EscrowStatus.Disputed;
        emit EscrowDisputed(escrowId, msg.sender, reasonHash);
    }

    function cancelEscrow(bytes32 escrowId) external {
        Escrow storage escrow = _getEscrow(escrowId);
        _requireStatus(escrowId, escrow, EscrowStatus.Created);
        if (msg.sender != escrow.buyer) revert NotBuyer(msg.sender);
        escrow.status = EscrowStatus.Cancelled;
        emit EscrowCancelled(escrowId);
    }

    function escrowContext(bytes32 escrowId) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), escrowId));
    }

    function getEscrow(bytes32 escrowId) external view returns (Escrow memory) {
        Escrow memory escrow = _escrows[escrowId];
        if (escrow.status == EscrowStatus.None) {
            revert EscrowNotFound(escrowId);
        }
        return escrow;
    }

    function _getEscrow(
        bytes32 escrowId
    ) private view returns (Escrow storage escrow) {
        escrow = _escrows[escrowId];
        if (escrow.status == EscrowStatus.None) {
            revert EscrowNotFound(escrowId);
        }
    }

    function _requireStatus(
        bytes32 escrowId,
        Escrow storage escrow,
        EscrowStatus expected
    ) private view {
        if (escrow.status != expected) {
            revert InvalidEscrowStatus(escrowId, expected, escrow.status);
        }
    }

    function _requireActiveStatus(
        bytes32 escrowId,
        Escrow storage escrow
    ) private view {
        if (
            escrow.status != EscrowStatus.AwaitingVerification &&
            escrow.status != EscrowStatus.Disputed
        ) {
            revert InvalidEscrowStatus(
                escrowId,
                EscrowStatus.AwaitingVerification,
                escrow.status
            );
        }
    }

    function _requireSellerStillOwnsAsset(Escrow storage escrow) private view {
        address currentAssetOwner = assetRegistry.assetOwner(escrow.assetId);
        if (currentAssetOwner != escrow.seller) {
            revert SellerNotAssetOwner(escrow.seller, currentAssetOwner);
        }
    }

    function _safeTransferExact(
        IERC20 token,
        address recipient,
        uint256 amount
    ) private {
        uint256 balanceBefore = token.balanceOf(recipient);
        token.safeTransfer(recipient, amount);
        uint256 received = token.balanceOf(recipient) - balanceBefore;
        if (received != amount) {
            revert UnsupportedTokenTransfer(amount, received);
        }
    }

    function _validateThreshold(uint16 threshold) private pure {
        if (threshold > MAX_SCORE_BPS) {
            revert InvalidThreshold(threshold);
        }
    }
}
