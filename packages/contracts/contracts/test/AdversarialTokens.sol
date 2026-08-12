// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only token for exercising SafeERC20 failure paths.
contract ConfigurableFailureToken is ERC20 {
    bool public failTransfer;
    bool public failTransferFrom;

    constructor(address holder, uint256 supply)
        ERC20("Configurable Failure Token", "FAIL")
    {
        _mint(holder, supply);
    }

    function setFailures(bool transferFails, bool transferFromFails) external {
        failTransfer = transferFails;
        failTransferFrom = transferFromFails;
    }

    function transfer(
        address to,
        uint256 value
    ) public override returns (bool) {
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

/// @dev Test-only token that attempts an arbitrary callback during funding.
contract ReentrantToken is ERC20 {
    address public callbackTarget;
    bytes public callbackData;
    bool public hookEnabled;
    bool public lastHookSucceeded;
    bool private _insideHook;

    constructor(address holder, uint256 supply)
        ERC20("Reentrant Test Token", "REENTER")
    {
        _mint(holder, supply);
    }

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

/// @dev Test-only fee token. AliveEscrow rejects the resulting short deposit.
contract FeeOnTransferToken is ERC20 {
    constructor(address holder, uint256 supply)
        ERC20("Fee-on-transfer Test Token", "FEE")
    {
        _mint(holder, supply);
    }

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

/// @dev Test-only token that deposits normally but taxes transfers originating
/// from the configured escrow. This exercises exact payout accounting.
contract OutputFeeToken is ERC20 {
    address public feeSender;

    constructor(address holder, uint256 supply)
        ERC20("Output-fee Test Token", "OUTFEE")
    {
        _mint(holder, supply);
    }

    function setFeeSender(address sender) external {
        feeSender = sender;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (feeSender != address(0) && from == feeSender && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
            return;
        }
        super._update(from, to, value);
    }
}
