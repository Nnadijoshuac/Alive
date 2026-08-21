// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRwaExecutionRouter {
    function cashToken() external view returns (address);

    function getPrice(
        address token
    ) external view returns (uint256 priceInCashE6, uint64 updatedAt);

    function quote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) external view returns (uint256 amountOut);

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minimumAmountOut,
        address recipient
    ) external returns (uint256 amountOut);
}
