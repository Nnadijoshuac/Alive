// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ALIVE Test USDT
/// @notice TEST TOKEN ONLY. This contract is not affiliated with, backed by, or
/// redeemable for Tether USD. Never deploy or present it as real USDT.
contract MockUSDT is ERC20, Ownable {
    uint256 public constant FAUCET_AMOUNT = 10_000 * 10 ** 6;

    error FaucetAlreadyUsed(address account);

    mapping(address account => bool used) public faucetUsed;

    constructor(address initialOwner)
        ERC20("ALIVE Test USDT", "tUSDT")
        Ownable(initialOwner)
    {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice One faucet claim per address for local and public test networks.
    function faucet() external {
        if (faucetUsed[msg.sender]) revert FaucetAlreadyUsed(msg.sender);
        faucetUsed[msg.sender] = true;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Test environment administration only.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
