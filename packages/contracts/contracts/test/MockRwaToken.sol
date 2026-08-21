// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ALIVE demo RWA token
/// @notice TEST TOKEN ONLY. It is not a security, fund share, commodity claim,
/// or redeemable representation of the named underlying.
contract MockRwaToken is ERC20, Ownable {
    bool public constant IS_DEMO_TOKEN = true;

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner
    ) ERC20(name_, symbol_) Ownable(initialOwner) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
