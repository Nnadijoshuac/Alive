// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRwaExecutionRouter} from "../interfaces/IRwaExecutionRouter.sol";

/// @title ALIVE deterministic demo RWA router
/// @notice TEST INFRASTRUCTURE ONLY. This is a controlled-price swap fixture,
/// not a DEX and not a source of live or executable market prices.
contract MockRwaRouter is IRwaExecutionRouter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PRICE_SCALE = 1e6;

    struct PriceRecord {
        uint192 priceInCashE6;
        uint64 updatedAt;
    }

    error IdenticalTokens();
    error InsufficientRouterLiquidity(
        address token,
        uint256 required,
        uint256 available
    );
    error InvalidAmount();
    error InvalidPrice(address token, uint256 priceInCashE6);
    error InvalidRecipient();
    error InvalidToken(address token);
    error PriceNotConfigured(address token);
    error SlippageExceeded(uint256 minimumAmountOut, uint256 amountOut);
    error UnsupportedTokenTransfer(address token, uint256 expected, uint256 actual);

    event DemoPriceUpdated(
        address indexed token,
        uint256 priceInCashE6,
        uint64 updatedAt
    );
    event DemoPriceTimestampRefreshed(
        address indexed token,
        uint256 priceInCashE6,
        uint64 updatedAt
    );
    event DemoSwap(
        address indexed caller,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    );

    address public immutable cashToken;
    mapping(address token => PriceRecord price) private _prices;

    constructor(address cashToken_, address initialOwner) Ownable(initialOwner) {
        if (cashToken_ == address(0) || cashToken_.code.length == 0) {
            revert InvalidToken(cashToken_);
        }
        cashToken = cashToken_;
        _setPrice(cashToken_, PRICE_SCALE);
    }

    function setPrice(
        address token,
        uint256 priceInCashE6
    ) external onlyOwner {
        _setPrice(token, priceInCashE6);
    }

    function setPrices(
        address[] calldata tokens,
        uint256[] calldata pricesInCashE6
    ) external onlyOwner {
        if (tokens.length != pricesInCashE6.length) revert InvalidAmount();
        for (uint256 index; index < tokens.length; ++index) {
            _setPrice(tokens[index], pricesInCashE6[index]);
        }
    }

    /// @notice Refreshes timestamps without changing the configured synthetic
    /// price. This permissionless path exists only so a public testnet demo can
    /// satisfy short freshness policies without giving users price-setting
    /// authority. Production execution adapters must not expose this behavior.
    function refreshPriceTimestamps(address[] calldata tokens) external {
        uint64 timestamp = uint64(block.timestamp);
        for (uint256 index; index < tokens.length; ++index) {
            address token = tokens[index];
            PriceRecord storage price = _prices[token];
            if (price.updatedAt == 0) revert PriceNotConfigured(token);
            price.updatedAt = timestamp;
            emit DemoPriceTimestampRefreshed(
                token,
                price.priceInCashE6,
                timestamp
            );
        }
    }

    function getPrice(
        address token
    ) external view returns (uint256 priceInCashE6, uint64 updatedAt) {
        PriceRecord memory price = _prices[token];
        if (price.updatedAt == 0) revert PriceNotConfigured(token);
        return (price.priceInCashE6, price.updatedAt);
    }

    function quote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) public view returns (uint256 amountOut) {
        if (tokenIn == tokenOut) revert IdenticalTokens();
        if (amountIn == 0) revert InvalidAmount();
        PriceRecord memory inputPrice = _prices[tokenIn];
        PriceRecord memory outputPrice = _prices[tokenOut];
        if (inputPrice.updatedAt == 0) revert PriceNotConfigured(tokenIn);
        if (outputPrice.updatedAt == 0) revert PriceNotConfigured(tokenOut);
        amountOut = (amountIn * inputPrice.priceInCashE6) /
            outputPrice.priceInCashE6;
        if (amountOut == 0) revert InvalidAmount();
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient
    ) external nonReentrant returns (uint256 amountOut) {
        if (recipient == address(0)) revert InvalidRecipient();
        amountOut = quote(tokenIn, tokenOut, amountIn);
        if (amountOut < minimumAmountOut) {
            revert SlippageExceeded(minimumAmountOut, amountOut);
        }
        uint256 available = IERC20(tokenOut).balanceOf(address(this));
        if (available < amountOut) {
            revert InsufficientRouterLiquidity(tokenOut, amountOut, available);
        }

        uint256 inputBefore = IERC20(tokenIn).balanceOf(address(this));
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 received = IERC20(tokenIn).balanceOf(address(this)) - inputBefore;
        if (received != amountIn) {
            revert UnsupportedTokenTransfer(tokenIn, amountIn, received);
        }

        uint256 recipientBefore = IERC20(tokenOut).balanceOf(recipient);
        IERC20(tokenOut).safeTransfer(recipient, amountOut);
        uint256 delivered = IERC20(tokenOut).balanceOf(recipient) -
            recipientBefore;
        if (delivered != amountOut) {
            revert UnsupportedTokenTransfer(tokenOut, amountOut, delivered);
        }

        emit DemoSwap(
            msg.sender,
            tokenIn,
            tokenOut,
            amountIn,
            amountOut,
            recipient
        );
    }

    function withdrawLiquidity(
        address token,
        address recipient,
        uint256 amount
    ) external onlyOwner nonReentrant {
        if (recipient == address(0)) revert InvalidRecipient();
        IERC20(token).safeTransfer(recipient, amount);
    }

    function _setPrice(address token, uint256 priceInCashE6) private {
        if (token == address(0) || token.code.length == 0) {
            revert InvalidToken(token);
        }
        if (priceInCashE6 == 0 || priceInCashE6 > type(uint192).max) {
            revert InvalidPrice(token, priceInCashE6);
        }
        uint64 timestamp = uint64(block.timestamp);
        _prices[token] = PriceRecord({
            priceInCashE6: uint192(priceInCashE6),
            updatedAt: timestamp
        });
        emit DemoPriceUpdated(token, priceInCashE6, timestamp);
    }
}
