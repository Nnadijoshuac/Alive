// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title ALIVE local/testnet cash faucet
/// @notice TEST INFRASTRUCTURE ONLY. Each address may claim one fixed allotment
/// of the synthetic six-decimal tUSDC token used by the policy-vault demo.
contract DemoRwaFaucet is Ownable {
    using SafeERC20 for IERC20;

    error AlreadyClaimed(address account);
    error InvalidConfiguration();

    event DemoCashClaimed(address indexed account, uint256 amount);
    event ClaimAmountUpdated(uint256 previousAmount, uint256 newAmount);

    IERC20 public immutable token;
    uint256 public claimAmount;
    mapping(address account => bool claimed) public hasClaimed;

    constructor(
        address token_,
        uint256 claimAmount_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (token_ == address(0) || token_.code.length == 0 || claimAmount_ == 0) {
            revert InvalidConfiguration();
        }
        token = IERC20(token_);
        claimAmount = claimAmount_;
    }

    function claim() external {
        if (hasClaimed[msg.sender]) revert AlreadyClaimed(msg.sender);
        hasClaimed[msg.sender] = true;
        uint256 amount = claimAmount;
        token.safeTransfer(msg.sender, amount);
        emit DemoCashClaimed(msg.sender, amount);
    }

    function setClaimAmount(uint256 newAmount) external onlyOwner {
        if (newAmount == 0) revert InvalidConfiguration();
        uint256 previousAmount = claimAmount;
        claimAmount = newAmount;
        emit ClaimAmountUpdated(previousAmount, newAmount);
    }

    function withdraw(address recipient, uint256 amount) external onlyOwner {
        if (recipient == address(0)) revert InvalidConfiguration();
        token.safeTransfer(recipient, amount);
    }
}
