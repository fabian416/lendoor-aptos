// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";

contract TrancheToken is ERC20 {
    address public immutable minter;

    constructor(string memory name_, string memory symbol_, address minter_) ERC20(name_, symbol_) {
        minter = minter_;
    }

    function mint(address to, uint256 amount) external {
        require(msg.sender == minter, "NOT_MINTER");
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        require(msg.sender == minter, "NOT_MINTER");
        _burn(from, amount);
    }
}