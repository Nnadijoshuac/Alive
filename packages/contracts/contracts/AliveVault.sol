// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAlivePolicyRegistry} from "./interfaces/IAlivePolicyRegistry.sol";
import {IAliveRwaAssetRegistry} from "./interfaces/IAliveRwaAssetRegistry.sol";
import {IAliveStrategyVerifier} from "./interfaces/IAliveStrategyVerifier.sol";
import {IRwaExecutionRouter} from "./interfaces/IRwaExecutionRouter.sol";

/// @title ALIVE user-owned policy vault
/// @notice Holds six-decimal demo assets and executes only EIP-712 committed
/// plans whose resulting balances satisfy the vault owner's active policy.
/// The strategy signer never receives custody or arbitrary call authority.
contract AliveVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint16 public constant MAX_BPS = 10_000;
    uint256 public constant VALUE_SCALE = 1e6;
    uint256 public constant MAX_PLAN_ITEMS = 32;
    bytes32 public constant CASH_ASSET_CLASS = keccak256("CASH");

    struct Position {
        bytes32 assetId;
        uint256 balance;
    }

    struct MarketQuote {
        bytes32 assetId;
        uint256 priceInCashE6;
        uint64 updatedAt;
    }

    struct Trade {
        bytes32 assetIn;
        bytes32 assetOut;
        uint256 amountIn;
        uint256 quotedAmountOut;
        uint256 minimumAmountOut;
    }

    struct ExecutionPlan {
        Trade[] trades;
        Position[] beforePositions;
        Position[] afterPositions;
        MarketQuote[] marketQuotes;
    }

    error AssetAllocationExceeded(
        bytes32 assetId,
        uint256 assetValue,
        uint256 maximumValue,
        uint16 maximumBps
    );
    error AssetNotAllowed(bytes32 assetId);
    error AssetNotEnabled(bytes32 assetId);
    error ActivePolicyHashMismatch(bytes32 expected, bytes32 actual);
    error CashFloorNotMet(
        uint256 cashValue,
        uint256 minimumValue,
        uint16 minimumBps
    );
    error ClassAllocationAboveMaximum(
        bytes32 assetClass,
        uint256 classValue,
        uint256 maximumValue,
        uint16 maximumBps
    );
    error ClassAllocationBelowMinimum(
        bytes32 assetClass,
        uint256 classValue,
        uint256 minimumValue,
        uint16 minimumBps
    );
    error DuplicateOrUnsortedItem(bytes32 item);
    error EmptyPortfolio();
    error GuardedExecutorRequired(address caller);
    error IdenticalTradeAssets(bytes32 assetId);
    error InvalidAddress(address supplied);
    error InvalidAmount();
    error InvalidCashAsset(bytes32 assetId);
    error InvalidPlanLength(bytes32 field, uint256 supplied, uint256 maximum);
    error InvalidPolicyOwner(address expected, address actual);
    error InvalidPositionBalance(bytes32 assetId, uint256 balance);
    error IssuerAllocationExceeded(
        bytes32 issuerId,
        uint256 issuerValue,
        uint256 maximumValue,
        uint16 maximumBps
    );
    error MarketQuoteMismatch(
        bytes32 assetId,
        uint256 expectedPrice,
        uint64 expectedTimestamp,
        uint256 suppliedPrice,
        uint64 suppliedTimestamp
    );
    error MarketQuoteMissing(bytes32 assetId);
    error MarketTimestampMismatch(uint64 expected, uint64 supplied);
    error NoActivePolicy();
    error PolicyDisabled(uint32 version);
    error PortfolioAssetMissing(bytes32 assetId, uint256 actualBalance);
    error PortfolioBalanceMismatch(
        bytes32 assetId,
        uint256 expected,
        uint256 actual
    );
    error PriceDataStale(
        bytes32 assetId,
        uint64 updatedAt,
        uint64 currentTime,
        uint32 maximumAge
    );
    error QuoteAmountMismatch(uint256 expected, uint256 supplied);
    error SlippageLimitViolated(
        uint256 minimumAmountOut,
        uint256 policyMinimumAmountOut
    );
    error TokenBalanceDeltaMismatch(
        address token,
        uint256 expected,
        uint256 actual
    );
    error TotalPortfolioValueIsZero();
    error UnauthorizedAdvisoryExecution(address caller);
    error UnsupportedTokenTransfer(address token, uint256 expected, uint256 actual);

    event CashDeposited(address indexed sender, uint256 amount);
    event GuardedExecutorUpdated(
        address indexed previousExecutor,
        address indexed newExecutor
    );
    event PolicyActivated(
        uint32 indexed version,
        bytes32 indexed policyHash,
        bytes32 indexed enforceablePolicyHash
    );
    event StrategyExecuted(
        bytes32 indexed digest,
        bytes32 indexed strategyNonce,
        uint32 indexed policyVersion,
        bytes32 portfolioBeforeHash,
        bytes32 portfolioAfterHash,
        bytes32 executionPlanHash
    );
    event VaultWithdrawal(
        bytes32 indexed assetId,
        address indexed recipient,
        uint256 amount
    );

    IAliveRwaAssetRegistry public immutable assetRegistry;
    IAlivePolicyRegistry public immutable policyRegistry;
    IAliveStrategyVerifier public immutable strategyVerifier;
    IRwaExecutionRouter public immutable executionRouter;
    bytes32 public immutable cashAssetId;
    IERC20 public immutable cashToken;

    uint32 public activePolicyVersion;
    bytes32 public activePolicyHash;
    address public guardedExecutor;

    constructor(
        address initialOwner,
        bytes32 cashAssetId_,
        address assetRegistry_,
        address policyRegistry_,
        address strategyVerifier_,
        address executionRouter_
    ) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert InvalidAddress(initialOwner);
        _requireContract(assetRegistry_);
        _requireContract(policyRegistry_);
        _requireContract(strategyVerifier_);
        _requireContract(executionRouter_);

        assetRegistry = IAliveRwaAssetRegistry(assetRegistry_);
        policyRegistry = IAlivePolicyRegistry(policyRegistry_);
        strategyVerifier = IAliveStrategyVerifier(strategyVerifier_);
        executionRouter = IRwaExecutionRouter(executionRouter_);
        IAliveRwaAssetRegistry.RwaAsset memory cashAsset = IAliveRwaAssetRegistry(
                assetRegistry_
            ).getAsset(cashAssetId_);
        if (
            !cashAsset.enabled ||
            cashAsset.assetClass != CASH_ASSET_CLASS ||
            cashAsset.token != IRwaExecutionRouter(executionRouter_).cashToken()
        ) {
            revert InvalidCashAsset(cashAssetId_);
        }
        cashAssetId = cashAssetId_;
        cashToken = IERC20(cashAsset.token);
    }

    function activatePolicy(uint32 version) external onlyOwner {
        IAlivePolicyRegistry.PolicyRecord memory policy = policyRegistry
            .getPolicy(address(this), version);
        if (!policy.enabled) revert PolicyDisabled(version);
        if (policy.owner != owner()) {
            revert InvalidPolicyOwner(owner(), policy.owner);
        }
        activePolicyVersion = version;
        activePolicyHash = policy.policyHash;
        emit PolicyActivated(
            version,
            policy.policyHash,
            policy.enforceablePolicyHash
        );
    }

    function setGuardedExecutor(address executor) external onlyOwner {
        address previousExecutor = guardedExecutor;
        guardedExecutor = executor;
        emit GuardedExecutorUpdated(previousExecutor, executor);
    }

    function depositCash(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();
        uint256 balanceBefore = cashToken.balanceOf(address(this));
        cashToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = cashToken.balanceOf(address(this)) - balanceBefore;
        if (received != amount) {
            revert UnsupportedTokenTransfer(
                address(cashToken),
                amount,
                received
            );
        }
        emit CashDeposited(msg.sender, amount);
    }

    /// @notice The user always retains an owner-only exit. Policy constrains AI
    /// execution authority; it never traps the owner's funds.
    function withdraw(
        bytes32 assetId,
        address recipient,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidAddress(recipient);
        if (amount == 0) revert InvalidAmount();
        IAliveRwaAssetRegistry.RwaAsset memory asset = assetRegistry.getAsset(
            assetId
        );
        IERC20 token = IERC20(asset.token);
        uint256 beforeBalance = token.balanceOf(recipient);
        token.safeTransfer(recipient, amount);
        uint256 delivered = token.balanceOf(recipient) - beforeBalance;
        if (delivered != amount) {
            revert UnsupportedTokenTransfer(asset.token, amount, delivered);
        }
        emit VaultWithdrawal(assetId, recipient, amount);
    }

    function executeStrategy(
        ExecutionPlan calldata plan,
        IAliveStrategyVerifier.Strategy calldata strategy,
        bytes calldata signature
    ) external nonReentrant returns (bytes32 digest) {
        IAlivePolicyRegistry.PolicyRecord memory policy = _activePolicy();
        _authorizeExecution(policy.approvalMode);
        _validatePlanLengths(plan);

        bytes32 beforeHash = hashPortfolio(plan.beforePositions);
        bytes32 afterHash = hashPortfolio(plan.afterPositions);
        bytes32 marketHash = hashMarketSnapshot(plan.marketQuotes);
        bytes32 planHash = hashExecutionPlan(plan);
        uint64 oldestMarketTimestamp = _validateMarketQuotes(
            plan,
            policy.maximumPriceAgeSeconds
        );
        if (strategy.marketTimestamp != oldestMarketTimestamp) {
            revert MarketTimestampMismatch(
                oldestMarketTimestamp,
                strategy.marketTimestamp
            );
        }

        // Consume before checking mutable balances so an already-used signed
        // capability has one deterministic replay failure. Any later failure
        // reverts this consumption atomically.
        digest = strategyVerifier.consumeStrategy(
            strategy,
            policy.policyHash,
            beforeHash,
            afterHash,
            marketHash,
            planHash,
            policy.maximumPriceAgeSeconds,
            signature
        );

        _validatePortfolioSnapshot(plan.beforePositions);
        _executeTrades(plan.trades, policy);
        _validatePortfolioSnapshot(plan.afterPositions);
        _enforcePolicy(plan.afterPositions, plan.marketQuotes, policy);

        emit StrategyExecuted(
            digest,
            strategy.strategyNonce,
            activePolicyVersion,
            beforeHash,
            afterHash,
            planHash
        );
    }

    function hashPortfolio(
        Position[] calldata positions
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(positions));
    }

    function hashMarketSnapshot(
        MarketQuote[] calldata quotes
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(quotes));
    }

    function hashTrades(
        Trade[] calldata trades
    ) public pure returns (bytes32) {
        return keccak256(abi.encode(trades));
    }

    function hashExecutionPlan(
        ExecutionPlan calldata plan
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    address(executionRouter),
                    hashTrades(plan.trades),
                    hashPortfolio(plan.beforePositions),
                    hashPortfolio(plan.afterPositions),
                    hashMarketSnapshot(plan.marketQuotes)
                )
            );
    }

    function _activePolicy()
        private
        view
        returns (IAlivePolicyRegistry.PolicyRecord memory policy)
    {
        uint32 version = activePolicyVersion;
        if (version == 0) revert NoActivePolicy();
        policy = policyRegistry.getPolicy(address(this), version);
        if (!policy.enabled) revert PolicyDisabled(version);
        if (policy.owner != owner()) {
            revert InvalidPolicyOwner(owner(), policy.owner);
        }
        if (policy.policyHash != activePolicyHash) {
            revert ActivePolicyHashMismatch(
                activePolicyHash,
                policy.policyHash
            );
        }
    }

    function _authorizeExecution(
        IAlivePolicyRegistry.ApprovalMode mode
    ) private view {
        if (mode == IAlivePolicyRegistry.ApprovalMode.Advisory) {
            if (msg.sender != owner()) {
                revert UnauthorizedAdvisoryExecution(msg.sender);
            }
            return;
        }
        if (msg.sender != owner() && msg.sender != guardedExecutor) {
            revert GuardedExecutorRequired(msg.sender);
        }
    }

    function _validatePlanLengths(ExecutionPlan calldata plan) private pure {
        _validateLength("trades", plan.trades.length, true);
        _validateLength(
            "beforePositions",
            plan.beforePositions.length,
            false
        );
        _validateLength(
            "afterPositions",
            plan.afterPositions.length,
            true
        );
        _validateLength("marketQuotes", plan.marketQuotes.length, true);
    }

    function _validateLength(
        bytes32 field,
        uint256 supplied,
        bool nonzero
    ) private pure {
        if ((nonzero && supplied == 0) || supplied > MAX_PLAN_ITEMS) {
            revert InvalidPlanLength(field, supplied, MAX_PLAN_ITEMS);
        }
    }

    function _validateMarketQuotes(
        ExecutionPlan calldata plan,
        uint32 maximumAge
    ) private view returns (uint64 oldestTimestamp) {
        bytes32 previous;
        uint64 currentTime = uint64(block.timestamp);
        oldestTimestamp = type(uint64).max;
        for (uint256 index; index < plan.marketQuotes.length; ++index) {
            MarketQuote calldata supplied = plan.marketQuotes[index];
            if (
                supplied.assetId == bytes32(0) ||
                (index != 0 &&
                    uint256(supplied.assetId) <= uint256(previous))
            ) {
                revert DuplicateOrUnsortedItem(supplied.assetId);
            }
            IAliveRwaAssetRegistry.RwaAsset memory asset = assetRegistry
                .getAsset(supplied.assetId);
            (uint256 price, uint64 updatedAt) = executionRouter.getPrice(
                asset.token
            );
            if (
                price != supplied.priceInCashE6 ||
                updatedAt != supplied.updatedAt
            ) {
                revert MarketQuoteMismatch(
                    supplied.assetId,
                    price,
                    updatedAt,
                    supplied.priceInCashE6,
                    supplied.updatedAt
                );
            }
            if (
                updatedAt > currentTime ||
                currentTime - updatedAt > maximumAge
            ) {
                revert PriceDataStale(
                    supplied.assetId,
                    updatedAt,
                    currentTime,
                    maximumAge
                );
            }
            if (updatedAt < oldestTimestamp) oldestTimestamp = updatedAt;
            previous = supplied.assetId;
        }

        for (uint256 index; index < plan.beforePositions.length; ++index) {
            _requireQuote(plan.marketQuotes, plan.beforePositions[index].assetId);
        }
        for (uint256 index; index < plan.afterPositions.length; ++index) {
            _requireQuote(plan.marketQuotes, plan.afterPositions[index].assetId);
        }
        for (uint256 index; index < plan.trades.length; ++index) {
            _requireQuote(plan.marketQuotes, plan.trades[index].assetIn);
            _requireQuote(plan.marketQuotes, plan.trades[index].assetOut);
        }
    }

    function _validatePortfolioSnapshot(
        Position[] calldata positions
    ) private view {
        bytes32 previous;
        for (uint256 index; index < positions.length; ++index) {
            Position calldata position = positions[index];
            if (
                position.assetId == bytes32(0) ||
                (index != 0 &&
                    uint256(position.assetId) <= uint256(previous))
            ) {
                revert DuplicateOrUnsortedItem(position.assetId);
            }
            if (position.balance == 0) {
                revert InvalidPositionBalance(position.assetId, 0);
            }
            IAliveRwaAssetRegistry.RwaAsset memory asset = assetRegistry
                .getAsset(position.assetId);
            uint256 actual = IERC20(asset.token).balanceOf(address(this));
            if (actual != position.balance) {
                revert PortfolioBalanceMismatch(
                    position.assetId,
                    position.balance,
                    actual
                );
            }
            previous = position.assetId;
        }

        uint256 count = assetRegistry.assetCount();
        for (uint256 index; index < count; ++index) {
            bytes32 assetId = assetRegistry.assetIdAt(index);
            IAliveRwaAssetRegistry.RwaAsset memory asset = assetRegistry
                .getAsset(assetId);
            uint256 actual = IERC20(asset.token).balanceOf(address(this));
            if (actual != 0 && !_containsPosition(positions, assetId)) {
                revert PortfolioAssetMissing(assetId, actual);
            }
        }
    }

    function _executeTrades(
        Trade[] calldata trades,
        IAlivePolicyRegistry.PolicyRecord memory policy
    ) private {
        for (uint256 index; index < trades.length; ++index) {
            Trade calldata trade = trades[index];
            if (trade.assetIn == trade.assetOut) {
                revert IdenticalTradeAssets(trade.assetIn);
            }
            if (
                trade.amountIn == 0 ||
                trade.quotedAmountOut == 0 ||
                trade.minimumAmountOut == 0
            ) {
                revert InvalidAmount();
            }
            IAliveRwaAssetRegistry.RwaAsset memory inputAsset = assetRegistry
                .getAsset(trade.assetIn);
            IAliveRwaAssetRegistry.RwaAsset memory outputAsset = assetRegistry
                .getAsset(trade.assetOut);
            if (!outputAsset.enabled) revert AssetNotEnabled(trade.assetOut);
            if (
                !policyRegistry.isAssetAllowed(
                    address(this),
                    activePolicyVersion,
                    trade.assetOut
                )
            ) {
                revert AssetNotAllowed(trade.assetOut);
            }

            uint256 currentQuote = executionRouter.quote(
                inputAsset.token,
                outputAsset.token,
                trade.amountIn
            );
            if (trade.quotedAmountOut != currentQuote) {
                revert QuoteAmountMismatch(
                    currentQuote,
                    trade.quotedAmountOut
                );
            }
            uint256 policyMinimum = Math.mulDiv(
                currentQuote,
                MAX_BPS - policy.maximumSlippageBps,
                MAX_BPS,
                Math.Rounding.Ceil
            );
            if (trade.minimumAmountOut < policyMinimum) {
                revert SlippageLimitViolated(
                    trade.minimumAmountOut,
                    policyMinimum
                );
            }

            IERC20 inputToken = IERC20(inputAsset.token);
            IERC20 outputToken = IERC20(outputAsset.token);
            uint256 inputBefore = inputToken.balanceOf(address(this));
            uint256 outputBefore = outputToken.balanceOf(address(this));
            inputToken.forceApprove(address(executionRouter), trade.amountIn);
            uint256 reportedOutput = executionRouter.swap(
                inputAsset.token,
                outputAsset.token,
                trade.amountIn,
                trade.minimumAmountOut,
                address(this)
            );
            inputToken.forceApprove(address(executionRouter), 0);

            uint256 inputSpent = inputBefore -
                inputToken.balanceOf(address(this));
            uint256 outputReceived = outputToken.balanceOf(address(this)) -
                outputBefore;
            if (inputSpent != trade.amountIn) {
                revert TokenBalanceDeltaMismatch(
                    inputAsset.token,
                    trade.amountIn,
                    inputSpent
                );
            }
            if (
                outputReceived != reportedOutput ||
                outputReceived < trade.minimumAmountOut
            ) {
                revert TokenBalanceDeltaMismatch(
                    outputAsset.token,
                    reportedOutput,
                    outputReceived
                );
            }
        }
    }

    function _enforcePolicy(
        Position[] calldata positions,
        MarketQuote[] calldata quotes,
        IAlivePolicyRegistry.PolicyRecord memory policy
    ) private view {
        if (positions.length == 0) revert EmptyPortfolio();
        uint256[] memory values = new uint256[](positions.length);
        uint256 totalValue;
        uint256 cashValue;

        for (uint256 index; index < positions.length; ++index) {
            Position calldata position = positions[index];
            IAliveRwaAssetRegistry.RwaAsset memory asset = assetRegistry
                .getAsset(position.assetId);
            if (!asset.enabled) revert AssetNotEnabled(position.assetId);
            if (
                !policyRegistry.isAssetAllowed(
                    address(this),
                    activePolicyVersion,
                    position.assetId
                )
            ) {
                revert AssetNotAllowed(position.assetId);
            }
            MarketQuote calldata quote_ = _requireQuote(
                quotes,
                position.assetId
            );
            uint256 value = Math.mulDiv(
                position.balance,
                quote_.priceInCashE6,
                VALUE_SCALE
            );
            values[index] = value;
            totalValue += value;
            if (asset.assetClass == CASH_ASSET_CLASS) cashValue += value;
        }
        if (totalValue == 0) revert TotalPortfolioValueIsZero();

        uint256 maximumAssetValue = Math.mulDiv(
            totalValue,
            policy.maximumSingleAssetBps,
            MAX_BPS
        );
        for (uint256 index; index < positions.length; ++index) {
            if (values[index] > maximumAssetValue) {
                revert AssetAllocationExceeded(
                    positions[index].assetId,
                    values[index],
                    maximumAssetValue,
                    policy.maximumSingleAssetBps
                );
            }
        }

        uint256 maximumIssuerValue = Math.mulDiv(
            totalValue,
            policy.maximumSingleIssuerBps,
            MAX_BPS
        );
        for (uint256 index; index < positions.length; ++index) {
            IAliveRwaAssetRegistry.RwaAsset memory currentAsset = assetRegistry
                .getAsset(positions[index].assetId);
            bool alreadyCounted;
            for (uint256 prior; prior < index; ++prior) {
                if (
                    assetRegistry.getAsset(positions[prior].assetId).issuerId ==
                    currentAsset.issuerId
                ) {
                    alreadyCounted = true;
                    break;
                }
            }
            if (alreadyCounted) continue;
            uint256 issuerValue;
            for (uint256 candidate; candidate < positions.length; ++candidate) {
                if (
                    assetRegistry
                        .getAsset(positions[candidate].assetId)
                        .issuerId == currentAsset.issuerId
                ) {
                    issuerValue += values[candidate];
                }
            }
            if (issuerValue > maximumIssuerValue) {
                revert IssuerAllocationExceeded(
                    currentAsset.issuerId,
                    issuerValue,
                    maximumIssuerValue,
                    policy.maximumSingleIssuerBps
                );
            }
        }

        uint256 minimumCashValue = Math.mulDiv(
            totalValue,
            policy.minimumCashBps,
            MAX_BPS,
            Math.Rounding.Ceil
        );
        if (cashValue < minimumCashValue) {
            revert CashFloorNotMet(
                cashValue,
                minimumCashValue,
                policy.minimumCashBps
            );
        }

        uint256 limitCount = policyRegistry.classLimitCount(
            address(this),
            activePolicyVersion
        );
        for (uint256 limitIndex; limitIndex < limitCount; ++limitIndex) {
            IAlivePolicyRegistry.ClassLimit memory limit = policyRegistry
                .classLimitAt(
                    address(this),
                    activePolicyVersion,
                    limitIndex
                );
            uint256 classValue;
            for (uint256 index; index < positions.length; ++index) {
                if (
                    assetRegistry
                        .getAsset(positions[index].assetId)
                        .assetClass == limit.assetClass
                ) {
                    classValue += values[index];
                }
            }
            uint256 minimumValue = Math.mulDiv(
                totalValue,
                limit.minimumBps,
                MAX_BPS,
                Math.Rounding.Ceil
            );
            if (classValue < minimumValue) {
                revert ClassAllocationBelowMinimum(
                    limit.assetClass,
                    classValue,
                    minimumValue,
                    limit.minimumBps
                );
            }
            uint256 maximumValue = Math.mulDiv(
                totalValue,
                limit.maximumBps,
                MAX_BPS
            );
            if (classValue > maximumValue) {
                revert ClassAllocationAboveMaximum(
                    limit.assetClass,
                    classValue,
                    maximumValue,
                    limit.maximumBps
                );
            }
        }
    }

    function _requireQuote(
        MarketQuote[] calldata quotes,
        bytes32 assetId
    ) private pure returns (MarketQuote calldata result) {
        for (uint256 index; index < quotes.length; ++index) {
            if (quotes[index].assetId == assetId) return quotes[index];
        }
        revert MarketQuoteMissing(assetId);
    }

    function _containsPosition(
        Position[] calldata positions,
        bytes32 assetId
    ) private pure returns (bool) {
        for (uint256 index; index < positions.length; ++index) {
            if (positions[index].assetId == assetId) return true;
        }
        return false;
    }

    function _requireContract(address supplied) private view {
        if (supplied == address(0) || supplied.code.length == 0) {
            revert InvalidAddress(supplied);
        }
    }
}
