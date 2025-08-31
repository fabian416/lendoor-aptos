// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;


import {ERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "../../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "/Users/fabiandiaz/personal-repos/LenDoor/contracts/lib/openzeppelin-contracts/contracts/interfaces/IERC4626.sol";
import {TrancheToken} from "./TrancheToken.sol";

contract SymbioticTrancheVault {
    IERC4626 public immutable symbioticVault;
    ERC20 public seniorToken;
    ERC20 public juniorToken;

    constructor(IERC4626 _vault) {
        symbioticVault = _vault;
        seniorToken = new TrancheToken("Symbiotic Senior Tranche", "tSNR", address(this));
        juniorToken = new TrancheToken("Symbiotic Junior Tranche", "tJNR", address(this));
    }

    function depositSenior(uint256 assets) external {
        // Transfer USDC from user → wrapper
        IERC20(symbioticVault.asset()).transferFrom(msg.sender, address(this), assets);
        IERC20(symbioticVault.asset()).approve(address(symbioticVault), assets);

        // Deposit into Symbiotic Vault
        uint256 shares = symbioticVault.deposit(assets, address(this));

        // Mint 1:1 tranche token to depositor
        // (in real impl, guard with ratios / accounting)
        _mintSenior(msg.sender, shares);
    }

    function depositJunior(uint256 assets) external {
        IERC20(symbioticVault.asset()).transferFrom(msg.sender, address(this), assets);
        IERC20(symbioticVault.asset()).approve(address(symbioticVault), assets);

        uint256 shares = symbioticVault.deposit(assets, address(this));

        _mintJunior(msg.sender, shares);
    }

    function redeemSenior(uint256 trancheShares) external {
        // burn tranche token
        _burnSenior(msg.sender, trancheShares);

        // logic: compute how much assets senior can take given losses
        uint256 assets = _computeSeniorAssets(trancheShares);
        symbioticVault.redeem(assets, msg.sender, address(this));
    }

    function redeemJunior(uint256 trancheShares) external {
        _burnJunior(msg.sender, trancheShares);

        uint256 assets = _computeJuniorAssets(trancheShares);
        symbioticVault.redeem(assets, msg.sender, address(this));
    }

    // ---------------- internal helpers ----------------

    function _mintSenior(address to, uint256 amt) internal {
        // pseudo-code, deberías extender ERC20
        // seniorToken._mint(to, amt);
    }

    function _burnSenior(address from, uint256 amt) internal {
        // seniorToken._burn(from, amt);
    }

    function _mintJunior(address to, uint256 amt) internal {
        // juniorToken._mint(to, amt);
    }

    function _burnJunior(address from, uint256 amt) internal {
        // juniorToken._burn(from, amt);
    }

    function _computeSeniorAssets(uint256 trancheShares) internal view returns (uint256) {
        // lógica: si hay pérdidas, junior absorbe primero
        // return proportional assets
    }

    function _computeJuniorAssets(uint256 trancheShares) internal view returns (uint256) {
        // lógica: junior recibe remanente
    }
}