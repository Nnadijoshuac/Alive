// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAliveStrategyVerifier {
    struct Strategy {
        address vault;
        bytes32 policyHash;
        bytes32 portfolioBeforeHash;
        bytes32 portfolioAfterHash;
        bytes32 marketSnapshotHash;
        bytes32 executionPlanHash;
        bytes32 strategyNonce;
        uint64 marketTimestamp;
        uint64 issuedAt;
        uint64 expiresAt;
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
    ) external returns (bytes32 digest);
}
