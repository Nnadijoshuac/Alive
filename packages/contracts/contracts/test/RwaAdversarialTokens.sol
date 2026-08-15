// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

abstract contract SixDecimalTestToken is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function decimals() public pure virtual override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Test-only token that taxes deposits into the vault.
contract RwaFeeOnTransferToken is SixDecimalTestToken {
    constructor() SixDecimalTestToken("RWA Fee Token", "rFEE") {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
            return;
        }
        super._update(from, to, value);
    }
}

/// @dev Test-only token that calls an arbitrary target during transferFrom.
contract RwaReentrantToken is SixDecimalTestToken {
    address public callbackTarget;
    bytes public callbackData;
    bool public hookEnabled;
    bool public lastHookSucceeded;
    bool private _insideHook;

    constructor() SixDecimalTestToken("RWA Reentrant Token", "rHOOK") {}

    function configureHook(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
        hookEnabled = true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public override returns (bool) {
        bool result = super.transferFrom(from, to, value);
        if (hookEnabled && !_insideHook) {
            _insideHook = true;
            (lastHookSucceeded, ) = callbackTarget.call(callbackData);
            _insideHook = false;
        }
        return result;
    }
}

/// @dev Test-only token that returns false for transfer operations.
contract RwaFalseReturnToken is SixDecimalTestToken {
    bool public failTransfer;
    bool public failTransferFrom;

    constructor() SixDecimalTestToken("RWA False Token", "rFALSE") {}

    function setFailures(bool transferFails, bool transferFromFails) external {
        failTransfer = transferFails;
        failTransferFrom = transferFromFails;
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        if (failTransfer) return false;
        return super.transfer(to, value);
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public override returns (bool) {
        if (failTransferFrom) return false;
        return super.transferFrom(from, to, value);
    }
}
