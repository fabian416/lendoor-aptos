// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ERC20Permit} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {SafeERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "../../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

import {IEVault} from "evk/EVault/IEVault.sol";  

/// @notice ERC4626 whose underlying asset is e-shares (EVault's senior token).
/// The "assets" of this wrapper = e-shares of the EVault.
/// The "shares" of this wrapper = j-shares (this wrapper's token).
contract JuniorERC4626 is ERC20, ERC20Permit, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IEVault public immutable vault;        // EVault (also the e-shares ERC20)
    IERC20  public immutable senior;       // = IERC20(address(vault))
    uint8   private immutable _decimals;   // e-shares decimals

    constructor(address _vault, string memory name_, string memory symbol_)
        ERC20(name_, symbol_) ERC20Permit(name_)
    {
        vault     = IEVault(_vault);
        senior    = IERC20(_vault);                    // eToken
        _decimals = IERC20Metadata(_vault).decimals(); // use the eToken's decimals
    }

}