// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IAliveStrategyVerifier} from "./interfaces/IAliveStrategyVerifier.sol";

/// @title ALIVE signed strategy verifier
/// @notice Consumes short-lived, vault-bound EIP-712 strategy capabilities.
/// A signature authorizes only committed portfolio states and a bounded plan;
/// the vault remains responsible for enforcing the registered policy.
contract AliveStrategyVerifier is
    IAliveStrategyVerifier,
    EIP712,
    Ownable
{
    string public constant EIP712_NAME = "ALIVE RWA Strategy";
    string public constant EIP712_VERSION = "1";
    uint64 public constant MAX_STRATEGY_LIFETIME = 1 days;

    bytes32 public constant STRATEGY_TYPEHASH = keccak256(
        "Strategy(address vault,bytes32 policyHash,bytes32 portfolioBeforeHash,bytes32 portfolioAfterHash,bytes32 marketSnapshotHash,bytes32 executionPlanHash,bytes32 strategyNonce,uint64 marketTimestamp,uint64 issuedAt,uint64 expiresAt)"
    );

    error EmptyStrategyField(bytes32 field);
    error InvalidMarketTimestamp(uint64 marketTimestamp, uint64 issuedAt);
    error InvalidSignature();
    error InvalidStrategyTimeRange(uint64 issuedAt, uint64 expiresAt);
    error NoPortfolioChange(bytes32 portfolioHash);
    error MarketDataStale(
        uint64 marketTimestamp,
        uint64 currentTime,
        uint32 maximumPriceAgeSeconds
    );
    error StrategyExpired(uint64 expiresAt, uint64 currentTime);
    error StrategyIssuedInFuture(uint64 issuedAt, uint64 currentTime);
    error StrategyLifetimeTooLong(uint64 lifetime);
    error StrategyNonceAlreadyConsumed(address vault, bytes32 strategyNonce);
    error UnauthorizedVaultCaller(address caller);
    error WrongCommitment(bytes32 field, bytes32 expected, bytes32 supplied);
    error WrongSigner(address recovered, address expected);
    error WrongVault(address expected, address supplied);
    error InvalidAuthorizedSigner();

    event AuthorizedSignerUpdated(
        address indexed previousSigner,
        address indexed newSigner
    );
    event StrategyConsumed(
        address indexed vault,
        bytes32 indexed strategyNonce,
        bytes32 indexed digest,
        bytes32 policyHash,
        bytes32 executionPlanHash
    );

    address public authorizedSigner;
    mapping(address vault => mapping(bytes32 nonce => bool consumed))
        private _consumedNonces;

    constructor(
        address authorizedSigner_,
        address initialOwner
    ) EIP712(EIP712_NAME, EIP712_VERSION) Ownable(initialOwner) {
        if (authorizedSigner_ == address(0)) {
            revert InvalidAuthorizedSigner();
        }
        authorizedSigner = authorizedSigner_;
    }

    function setAuthorizedSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidAuthorizedSigner();
        address previousSigner = authorizedSigner;
        authorizedSigner = newSigner;
        emit AuthorizedSignerUpdated(previousSigner, newSigner);
    }

    function consumeStrategy(
        Strategy calldata strategy,
        bytes32 expectedPolicyHash,
        bytes32 expectedPortfolioBeforeHash,
        bytes32 expectedPortfolioAfterHash,
        bytes32 expectedMarketSnapshotHash,
        bytes32 expectedExecutionPlanHash,
        uint32 maximumPriceAgeSeconds,
        bytes calldata signature
    ) external returns (bytes32 digest) {
        if (msg.sender.code.length == 0) {
            revert UnauthorizedVaultCaller(msg.sender);
        }
        if (strategy.vault != msg.sender) {
            revert WrongVault(msg.sender, strategy.vault);
        }
        _requireCommitment(
            "policyHash",
            expectedPolicyHash,
            strategy.policyHash
        );
        _requireCommitment(
            "portfolioBeforeHash",
            expectedPortfolioBeforeHash,
            strategy.portfolioBeforeHash
        );
        _requireCommitment(
            "portfolioAfterHash",
            expectedPortfolioAfterHash,
            strategy.portfolioAfterHash
        );
        _requireCommitment(
            "marketSnapshotHash",
            expectedMarketSnapshotHash,
            strategy.marketSnapshotHash
        );
        _requireCommitment(
            "executionPlanHash",
            expectedExecutionPlanHash,
            strategy.executionPlanHash
        );
        _validateFields(strategy, maximumPriceAgeSeconds);
        if (_consumedNonces[msg.sender][strategy.strategyNonce]) {
            revert StrategyNonceAlreadyConsumed(
                msg.sender,
                strategy.strategyNonce
            );
        }

        digest = _hashTypedDataV4(_hashStrategyStruct(strategy));
        (
            address recovered,
            ECDSA.RecoverError recoverError,

        ) = ECDSA.tryRecover(digest, signature);
        if (recoverError != ECDSA.RecoverError.NoError) {
            revert InvalidSignature();
        }
        if (recovered != authorizedSigner) {
            revert WrongSigner(recovered, authorizedSigner);
        }

        _consumedNonces[msg.sender][strategy.strategyNonce] = true;
        emit StrategyConsumed(
            msg.sender,
            strategy.strategyNonce,
            digest,
            strategy.policyHash,
            strategy.executionPlanHash
        );
    }

    function hashStrategy(
        Strategy calldata strategy
    ) external view returns (bytes32) {
        return _hashTypedDataV4(_hashStrategyStruct(strategy));
    }

    function isNonceConsumed(
        address vault,
        bytes32 strategyNonce
    ) external view returns (bool) {
        return _consumedNonces[vault][strategyNonce];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _validateFields(
        Strategy calldata strategy,
        uint32 maximumPriceAgeSeconds
    ) private view {
        if (strategy.strategyNonce == bytes32(0)) {
            revert EmptyStrategyField("strategyNonce");
        }
        if (strategy.portfolioBeforeHash == strategy.portfolioAfterHash) {
            revert NoPortfolioChange(strategy.portfolioAfterHash);
        }
        if (strategy.issuedAt >= strategy.expiresAt) {
            revert InvalidStrategyTimeRange(
                strategy.issuedAt,
                strategy.expiresAt
            );
        }
        uint64 lifetime = strategy.expiresAt - strategy.issuedAt;
        if (lifetime > MAX_STRATEGY_LIFETIME) {
            revert StrategyLifetimeTooLong(lifetime);
        }

        uint64 currentTime = uint64(block.timestamp);
        if (strategy.issuedAt > currentTime) {
            revert StrategyIssuedInFuture(strategy.issuedAt, currentTime);
        }
        if (strategy.expiresAt <= currentTime) {
            revert StrategyExpired(strategy.expiresAt, currentTime);
        }
        if (
            strategy.marketTimestamp == 0 ||
            strategy.marketTimestamp > strategy.issuedAt
        ) {
            revert InvalidMarketTimestamp(
                strategy.marketTimestamp,
                strategy.issuedAt
            );
        }
        if (
            maximumPriceAgeSeconds == 0 ||
            currentTime - strategy.marketTimestamp > maximumPriceAgeSeconds
        ) {
            revert MarketDataStale(
                strategy.marketTimestamp,
                currentTime,
                maximumPriceAgeSeconds
            );
        }
    }

    function _requireCommitment(
        bytes32 field,
        bytes32 expected,
        bytes32 supplied
    ) private pure {
        if (supplied == bytes32(0)) revert EmptyStrategyField(field);
        if (supplied != expected) {
            revert WrongCommitment(field, expected, supplied);
        }
    }

    function _hashStrategyStruct(
        Strategy calldata strategy
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    STRATEGY_TYPEHASH,
                    strategy.vault,
                    strategy.policyHash,
                    strategy.portfolioBeforeHash,
                    strategy.portfolioAfterHash,
                    strategy.marketSnapshotHash,
                    strategy.executionPlanHash,
                    strategy.strategyNonce,
                    strategy.marketTimestamp,
                    strategy.issuedAt,
                    strategy.expiresAt
                )
            );
    }
}
