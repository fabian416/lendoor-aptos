// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import {IVault, IEVault, IERC4626} from "../IEVault.sol";
import {Base} from "../shared/Base.sol";
import {BalanceUtils} from "../shared/BalanceUtils.sol";
import {AssetTransfers} from "../shared/AssetTransfers.sol";
import {SafeERC20Lib} from "../shared/lib/SafeERC20Lib.sol";
import {ProxyUtils} from "../shared/lib/ProxyUtils.sol";

import "../shared/types/Types.sol";

/// @title VaultModule
/// @custom:security-contact security@euler.xyz
/// @author Euler Labs (https://www.eulerlabs.com/)
/// @notice An EVault module handling ERC4626 standard behaviour
abstract contract VaultModule is IVault, AssetTransfers, BalanceUtils {
    using TypesLib for uint256;
    using SafeERC20Lib for IERC20;


    uint256 internal constant JUNIOR_CAP_BPS = 2_000; // 20%

    /// @inheritdoc IERC4626
    function asset() public view virtual reentrantOK returns (address) {
        (IERC20 _asset,,) = ProxyUtils.metadata();
        return address(_asset);
    }

    /// @inheritdoc IERC4626
    function totalAssets() public view virtual nonReentrantView returns (uint256) {
        VaultCache memory vaultCache = loadVault();
        return totalAssetsInternal(vaultCache);
    }

    /// @inheritdoc IERC4626
    function convertToAssets(uint256 shares) public view virtual nonReentrantView returns (uint256) {
        VaultCache memory vaultCache = loadVault();
        return shares.toShares().toAssetsDown(vaultCache).toUint();
    }

    /// @inheritdoc IERC4626
    function convertToShares(uint256 assets) public view virtual nonReentrantView returns (uint256) {
        VaultCache memory vaultCache = loadVault();
        return assets.toAssets().toSharesDown(vaultCache).toUint();
    }

    /// @inheritdoc IERC4626
    function maxDeposit(address account) public view virtual nonReentrantView returns (uint256) {
        VaultCache memory vaultCache = loadVault();
        if (isOperationDisabled(vaultCache.hookedOps, OP_DEPOSIT)) return 0;

        // the result may underestimate due to rounding
        Assets max = maxMintInternal(vaultCache, account).toAssetsDown(vaultCache);

        // if assets round down to zero, deposit reverts with E_ZeroShares
        return max.toSharesDown(vaultCache).toUint() == 0 ? 0 : max.toUint();
    }

    /// @inheritdoc IERC4626
    function previewDeposit(uint256 assets) public view virtual nonReentrantView returns (uint256) {
        return convertToShares(assets);
    }

    /// @inheritdoc IERC4626
    function maxMint(address account) public view virtual nonReentrantView returns (uint256) {
        VaultCache memory vaultCache = loadVault();

        return isOperationDisabled(vaultCache.hookedOps, OP_MINT) ? 0 : maxMintInternal(vaultCache, account).toUint();
    }

    /// @inheritdoc IERC4626
    function previewMint(uint256 shares) public view virtual nonReentrantView returns (uint256) {
        VaultCache memory vaultCache = loadVault();
        return shares.toShares().toAssetsUp(vaultCache).toUint();
    }

    /// @inheritdoc IERC4626
    function maxWithdraw(address owner) public view virtual nonReentrantView returns (uint256) {
        VaultCache memory vaultCache = loadVault();

        return isOperationDisabled(vaultCache.hookedOps, OP_WITHDRAW)
            ? 0
            : maxRedeemInternal(vaultCache, owner).toAssetsDown(vaultCache).toUint();
    }

    /// @inheritdoc IERC4626
    function previewWithdraw(uint256 assets) public view virtual nonReentrantView returns (uint256) {
        VaultCache memory vaultCache = loadVault();
        return assets.toAssets().toSharesUp(vaultCache).toUint();
    }

    /// @inheritdoc IERC4626
    function maxRedeem(address owner) public view virtual nonReentrantView returns (uint256) {
        VaultCache memory vaultCache = loadVault();
        if (isOperationDisabled(vaultStorage.hookedOps, OP_REDEEM)) return 0;

        Shares max = maxRedeemInternal(vaultCache, owner);
        // if shares round down to zero, redeem reverts with E_ZeroAssets
        return max.toAssetsDown(vaultCache).toUint() == 0 ? 0 : max.toUint();
    }

    /// @inheritdoc IERC4626
    function previewRedeem(uint256 shares) public view virtual nonReentrantView returns (uint256) {
        return convertToAssets(shares);
    }

    /// @inheritdoc IVault
    function accumulatedFees() public view virtual nonReentrantView returns (uint256) {
        return loadVault().accumulatedFees.toUint();
    }

    /// @inheritdoc IVault
    function accumulatedFeesAssets() public view virtual nonReentrantView returns (uint256) {
        VaultCache memory vaultCache = loadVault();

        return vaultCache.accumulatedFees.toAssetsDown(vaultCache).toUint();
    }

    /// @inheritdoc IVault
    function creator() public view virtual reentrantOK returns (address) {
        return vaultStorage.creator;
    }

    /// @inheritdoc IERC4626
    function deposit(uint256 amount, address receiver) public virtual nonReentrant returns (uint256) {
        (VaultCache memory vaultCache, address account) = initOperation(OP_DEPOSIT, CHECKACCOUNT_NONE);

        Assets assets = amount == type(uint256).max ? vaultCache.asset.balanceOf(account).toAssets() : amount.toAssets();
        if (assets.isZero()) return 0;

        Shares shares = assets.toSharesDown(vaultCache);
        if (shares.isZero()) revert E_ZeroShares();

        finalizeDeposit(vaultCache, assets, shares, account, receiver);

        return shares.toUint();
    }

    /// @inheritdoc IERC4626
    function mint(uint256 amount, address receiver) public virtual nonReentrant returns (uint256) {
        (VaultCache memory vaultCache, address account) = initOperation(OP_MINT, CHECKACCOUNT_NONE);

        Shares shares = amount.toShares();
        if (shares.isZero()) return 0;

        Assets assets = shares.toAssetsUp(vaultCache);

        finalizeDeposit(vaultCache, assets, shares, account, receiver);

        return assets.toUint();
    }

    /// @inheritdoc IERC4626
    function withdraw(uint256 amount, address receiver, address owner) public virtual nonReentrant returns (uint256) {
        (VaultCache memory vaultCache, address account) = initOperation(OP_WITHDRAW, owner);

        Assets assets = amount.toAssets();
        if (assets.isZero()) return 0;

        Shares shares = assets.toSharesUp(vaultCache);

        finalizeWithdraw(vaultCache, assets, shares, account, receiver, owner);

        return shares.toUint();
    }

    /// @inheritdoc IERC4626
    function redeem(uint256 amount, address receiver, address owner) public virtual nonReentrant returns (uint256) {
        (VaultCache memory vaultCache, address account) = initOperation(OP_REDEEM, owner);

        Shares shares = amount == type(uint256).max ? vaultStorage.users[owner].getBalance() : amount.toShares();
        if (shares.isZero()) return 0;

        Assets assets = shares.toAssetsDown(vaultCache);
        if (assets.isZero()) revert E_ZeroAssets();

        finalizeWithdraw(vaultCache, assets, shares, account, receiver, owner);

        return assets.toUint();
    }

    /// @inheritdoc IVault
    function skim(uint256 amount, address receiver) public virtual nonReentrant returns (uint256) {
        (VaultCache memory vaultCache, address account) = initOperation(OP_SKIM, CHECKACCOUNT_NONE);

        Assets balance = vaultCache.asset.balanceOf(address(this)).toAssets();
        Assets available = balance <= vaultCache.cash ? Assets.wrap(0) : balance.subUnchecked(vaultCache.cash);

        Assets assets;
        if (amount == type(uint256).max) {
            assets = available;
        } else {
            assets = amount.toAssets();
            if (assets > available) revert E_InsufficientAssets();
        }
        if (assets.isZero()) return 0;

        Shares shares = assets.toSharesDown(vaultCache);
        if (shares.isZero()) revert E_ZeroShares();

        vaultStorage.cash = vaultCache.cash = vaultCache.cash + assets;
        increaseBalance(vaultCache, receiver, account, shares, assets);

        return shares.toUint();
    }

    function finalizeDeposit(
        VaultCache memory vaultCache,
        Assets assets,
        Shares shares,
        address sender,
        address receiver
    ) private {
        pullAssets(vaultCache, sender, assets);

        increaseBalance(vaultCache, receiver, sender, shares, assets);
    }

    function finalizeWithdraw(
        VaultCache memory vaultCache,
        Assets assets,
        Shares shares,
        address sender,
        address receiver,
        address owner
    ) private {
        if (vaultCache.cash < assets) revert E_InsufficientCash();

        decreaseAllowance(owner, sender, shares);
        decreaseBalance(vaultCache, owner, sender, receiver, shares, assets);

        pushAssets(vaultCache, receiver, assets);
    }

    function maxRedeemInternal(VaultCache memory vaultCache, address owner) private view returns (Shares) {
        Shares max = vaultStorage.users[owner].getBalance();

        // If account has borrows, withdrawal might be reverted by the controller during account status checks.
        // The vault has no way to verify or enforce the behaviour of the controller, which the account owner
        // has enabled. It will therefore assume that all of the assets would be withheld by the controller and
        // under-estimate the return amount to zero.
        // Integrators who handle borrowing should implement custom logic to work with the particular controllers
        // they want to support.
        if (max.isZero() || hasAnyControllerEnabled(owner)) return Shares.wrap(0);

        Shares cash = vaultCache.cash.toSharesDown(vaultCache);
        max = max > cash ? cash : max;

        return max;
    }

    function maxMintInternal(VaultCache memory vaultCache, address) private pure returns (Shares) {
        uint256 supply = totalAssetsInternal(vaultCache);
        if (supply >= vaultCache.supplyCap) return Shares.wrap(0); // at or over the supply cap already

        unchecked {
            // limit to supply cap
            uint256 max = vaultCache.supplyCap - supply;

            // limit to cash remaining space
            uint256 limit = MAX_SANE_AMOUNT - vaultCache.cash.toUint();
            max = limit < max ? limit : max;

            // limit to total shares remaining space
            max = max.toAssets().toSharesDownUint(vaultCache);
            limit = MAX_SANE_AMOUNT - vaultCache.totalShares.toUint();

            return (limit < max ? limit : max).toShares();
        }
    }

    // ----------  DEBUG VIEWS (external view, read-only) ----------
    function debugSnapshot() external view returns (uint64 lastAccrualTs, uint256 lastAssetsSnap) {
        return (vaultStorage.lastAccrualTs, vaultStorage.lastAssetsSnap);
    }
    function debugSupplies() external view returns (uint256 senSupply, uint256 junSupply) {
        return (vaultStorage.totalShares.toUint(), vaultStorage.totalSharesJunior.toUint());
    }
    function debugPps() external view returns (uint256 psSen, uint256 psJun) {
        return (vaultStorage.psSeniorRay, vaultStorage.psJuniorRay);
    }
    function debugPoolNAVs() external view returns (uint256 gross, uint256 net) {
        VaultCache memory v = loadVault();

        gross = totalAssetsInternal(v);
        net   = _poolNAVNet(v);
    }
    function debugExternalFlow() external view returns (int256) {
        return vaultStorage.netExternalFlowAssets; // if you implement the accumulator
    }

    /// -------------------------------------------------------------------------

    function _assetsToSeniorSharesDown(Assets assets) internal view returns (Shares) {
        uint256 ps = vaultStorage.psSeniorRay;
        if (ps == 0) return Shares.wrap(0);
        uint256 s = (assets.toUint() * ONE_RAY) / ps; // floor
        return Shares.wrap(uint112(s));
    }

    function _assetsToSeniorSharesUp(Assets assets) internal view returns (Shares) {
        uint256 ps = vaultStorage.psSeniorRay;
        if (ps == 0) return Shares.wrap(0);
        uint256 num = assets.toUint() * ONE_RAY;
        uint256 s = (num + ps - 1) / ps; // ceil
        return Shares.wrap(uint112(s));
    }

    function _seniorSharesToAssetsDown(Shares shares) internal view returns (Assets) {
        uint256 a = (shares.toUint() * vaultStorage.psSeniorRay) / ONE_RAY; // floor
        return Assets.wrap(uint112(a));
    }

    function _seniorSharesToAssetsUp(Shares shares) internal view returns (Assets) {
        uint256 ps = vaultStorage.psSeniorRay;
        uint256 num = shares.toUint() * ps;
        uint256 a = (num + ONE_RAY - 1) / ONE_RAY; // ceil
        return Assets.wrap(uint112(a));
    }

    function _assetsToJuniorSharesDown(Assets a) internal view returns (Shares) {
        uint256 ps = vaultStorage.psJuniorRay;
        if (ps == 0) return Shares.wrap(0);
        uint256 s = (a.toUint() * ONE_RAY) / ps; // floor
        return Shares.wrap(uint112(s));
    }

    function _assetsToJuniorSharesUp(Assets a) internal view returns (Shares) {
        uint256 ps = vaultStorage.psJuniorRay;
        if (ps == 0) return Shares.wrap(0);
        uint256 num = a.toUint() * ONE_RAY;
        uint256 s = (num + ps - 1) / ps; // ceil
        return Shares.wrap(uint112(s));
    }

    function _juniorSharesToAssetsDown(Shares j) internal view returns (Assets) {
        uint256 a = (j.toUint() * vaultStorage.psJuniorRay) / ONE_RAY; // floor
        return Assets.wrap(uint112(a));
    }

    function _juniorSharesToAssetsUp(Shares j) internal view returns (Assets) {
        uint256 ps = vaultStorage.psJuniorRay;
        uint256 num = j.toUint() * ps;
        uint256 a = (num + ONE_RAY - 1) / ONE_RAY; // ceil
        return Assets.wrap(uint112(a));
    }

    function promoteToJunior(uint256 seniorSharesIn, address to)
        public virtual nonReentrant
        returns (uint256 jSharesOut) {
        _accrueTranches();
        (VaultCache memory v, address owner) = initOperation(OP_TRANSFER, CHECKACCOUNT_CALLER);

        // seniorSharesIn -> assets (floor)
        Assets assetsA = _seniorSharesToAssetsDown(seniorSharesIn.toShares());
        if (assetsA.toUint() == 0) revert E_ZeroAssets();

        // Cap check: juniorNAV + assets ≤ cap * poolNAV / 10_000
        uint256 poolNAV   = _poolNAVNet(v);
        uint256 juniorNAV = _juniorSharesToAssetsDown(vaultStorage.totalSharesJunior).toUint();
        if ((juniorNAV + assetsA.toUint()) * 10_000 > JUNIOR_CAP_BPS * poolNAV) {
            revert E_JuniorTrancheCapExceeded();
        }

        // assets -> junior shares (floor)
        Shares jShares = _assetsToJuniorSharesDown(assetsA);
        jSharesOut = jShares.toUint();

        // Removes senior from balance and credits junior
        decreaseBalance(v, owner, owner, address(0), seniorSharesIn.toShares(), assetsA);
        vaultStorage.users[to].juniorBalance = vaultStorage.users[to].juniorBalance.addShares(jShares);
        vaultStorage.totalSharesJunior       = vaultStorage.totalSharesJunior.addShares(jShares);

        return jSharesOut;
    }

    function demoteToSenior(uint256 jSharesIn, address to)
        public virtual nonReentrant
        returns (uint256 seniorSharesOut){
        _accrueTranches();
        (VaultCache memory v, address owner) = initOperation(OP_TRANSFER, CHECKACCOUNT_CALLER);

        if (jSharesIn == 0) return 0;

        // jShares -> assets (floor)
        Shares jShares = jSharesIn.toShares();
        Assets assetsA = _juniorSharesToAssetsDown(jShares);
        if (assetsA.toUint() == 0) revert E_ZeroAssets();

        // Debit junior from owner
        UserStorage storage user = vaultStorage.users[owner];
        if (jShares.toUint() > user.juniorBalance.toUint()) revert E_InsufficientBalance();
        user.juniorBalance = user.juniorBalance.subShares(jShares);
        vaultStorage.totalSharesJunior = vaultStorage.totalSharesJunior.subShares(jShares);

        // assets -> senior shares (floor)
        Shares seniorShares = _assetsToSeniorSharesDown(assetsA);
        seniorSharesOut = seniorShares.toUint();

        // Credit senior
        increaseBalance(v, to, owner, seniorShares, assetsA);

        return seniorSharesOut;
    }

}

/// @dev Deployable module contract
contract Vault is VaultModule {
    constructor(Integrations memory integrations) Base(integrations) {}
}
