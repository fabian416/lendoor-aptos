module lendoor::profile {
    use std::option::{Self, Option};
    use std::string::{Self};
    use std::signer;
    use std::vector;

    use aptos_std::type_info::{Self, TypeInfo};
    use aptos_std::event::{Self};
    use aptos_std::string_utils;

    use lendoor::credit_manager;
    use lendoor::reserve::{Self};
    use decimal::decimal::{Self, Decimal};
    use util_types::iterable_table::{Self as iterable_table, IterableTable};
    use lendoor::emode_category::{Self as emode_category};

    friend lendoor::controller;
    //
    // Errors.
    //

    const ECREDIT_LIMIT_EXCEEDED: u64 = 42;

    /// When there is no collateral that can be remove from this user.
    const EPROFILE_NO_DEPOSIT_RESERVE: u64 = 0;

    /// When there is not enough collateral LP token that can be removed in the user `Profile`.
    const EPROFILE_NOT_ENOUGH_COLLATERAL: u64 = 1;

    /// When there is no corresponding bororw reserve.
    const EPROFILE_NO_BORROWED_RESERVE: u64 = 2;

    /// When the user already have a profile during creation.
    const EPROFILE_ALREADY_EXIST: u64 = 3;

    /// When the user doesn't have a profile.
    const EPROFILE_NOT_EXIST: u64 = 4;

    /// When the debt exceeds borrowing power.
    const EPROFILE_NEGATIVE_EQUITY: u64 = 5;

    /// When the profile is healthy and cannot be liquidated.
    const EPROFILE_IS_HEALTHY: u64 = 7;

    /// When the rounded coin/LP coin amount is 0.
    const EPROFILE_ZERO_AMOUNT: u64 = 8;

    /// When trying to repay 0 amount.
    const EPROFILE_REPAY_ZERO_AMOUNT: u64 = 9;

    /// When the FarmingType is not Deposit or Borrow
    const EPROFILE_INVALID_FARMING_TYPE: u64 = 10;

    /// When the emode cateogry of the borrowing reserve is not same as profile.
    const EPROFILE_EMODE_DIFF_WITH_RESERVE: u64 = 11;

    /// Constants

    const LIQUIDATION_CLOSE_AMOUNT: u64 = 2;

    const LIQUIDATION_CLOSE_FACTOR_PERCENTAGE: u128 = 50;

    /// This is a resource that records a user's all deposits and borrows, 
    /// Mainly used for book keeping purpose.
    /// Note that, the key is reserve type info from `reserve::type_info<CoinType>()`.
    struct Profile has key {
        /// All reserves that the user has deposited into.
        deposited_reserves: IterableTable<TypeInfo, Deposit>,
        /// All reserves that the user has borrowed from.
        borrowed_reserves: IterableTable<TypeInfo, Loan>,
    }

    struct Deposit has store, drop {
        /// The amount of LP tokens that is stored as collateral.
        collateral_amount: u64
    }

    struct Loan has store, drop {
        /// Normalized borrow share amount.
        borrowed_share: Decimal
    }   

    #[event]
    struct SyncProfileDepositEvent has drop, store {
        user_addr: address,
        reserve_type: TypeInfo,
        collateral_amount: u64,
    }

    #[event]
    struct SyncProfileBorrowEvent has drop, store {
        user_addr: address,
        reserve_type: TypeInfo,
        borrowed_share_decimal: u128,
    }
    
    public fun init(account: &signer) {
        let addr = signer::address_of(account);
        assert!(!exists<Profile>(addr), EPROFILE_ALREADY_EXIST);
        move_to(account, Profile {
            deposited_reserves: iterable_table::new(),
            borrowed_reserves:  iterable_table::new(),
        });
    }

    #[view]
    public fun is_registered(user_addr: address): bool {
        exists<Profile>(user_addr)
    }

    #[view]
    /// Return profile deposit position of the specified `ReserveType`
    /// return (u64, u64): (collateral_lp_amount, underlying_coin_amount)
    public fun profile_deposit<ReserveType>(user_addr: address): (u64, u64) acquires Profile {
        let reserve_type = type_info::type_of<ReserveType>();
        let collateral_amount = get_deposited_amount(user_addr, reserve_type);
        let underlying_amount = reserve::get_underlying_amount_from_lp_amount(reserve_type, collateral_amount);
        (collateral_amount, underlying_amount)
    }

    #[view]
    /// Return profile loan position of the specified `ReserveType`
    /// return (u128, u128): (borrowed_share_decimal, borrowed_amount_decimal)
    public fun profile_loan<ReserveType>(user_addr: address): (u128, u128) acquires Profile {
        let profile = borrow_global_mut<Profile>(user_addr);
        let reserve_type = type_info::type_of<ReserveType>();
        let borrowed_share = if (iterable_table::contains(&profile.borrowed_reserves, &reserve_type)) {
            iterable_table::borrow(&profile.borrowed_reserves, &reserve_type).borrowed_share
        } else {
            decimal::zero()
        };
        (
            decimal::raw(borrowed_share),
            decimal::raw(reserve::get_borrow_amount_from_share_dec(reserve_type, borrowed_share))
        )
    }

    /// The total bororwing power assuming no borrow.
    public fun get_total_borrowing_power(addr: address): Decimal acquires Profile {
        let profile = borrow_global<Profile>(addr);
        get_total_borrowing_power_from_profile_inner(profile, &emode_category::profile_emode(addr))
    }

    public(friend) fun get_total_borrowing_power_from_profile_inner(profile: &Profile, profile_emode_id: &Option<string::String>): Decimal {
        let borrowing_power = decimal::zero();
        let key = iterable_table::head_key(&profile.deposited_reserves);
        while (option::is_some(&key)) {
            let type_info = *option::borrow(&key);
            let (val, _, next) = iterable_table::borrow_iter(
                &profile.deposited_reserves, &type_info);

            let ltv_pct: u8 = asset_ltv(profile_emode_id, &type_info);
            let ltv = decimal::from_percentage((ltv_pct as u128));

            let price: Decimal = asset_price(profile_emode_id, &type_info);
            let actual_amount = reserve::get_underlying_amount_from_lp_amount(
                type_info,
                val.collateral_amount
            );
            let total_value = decimal::mul(
                decimal::from_u64(actual_amount),
                price
            );

            borrowing_power = decimal::add(
                borrowing_power, 
                decimal::mul(
                    total_value,
                    ltv
                )
            );
            key = next;
        };

        borrowing_power
    }

    public(friend) fun get_liquidation_borrow_value_inner(profile: &Profile, profile_emode_id: &Option<string::String>): Decimal {
        let maintenance_margin = decimal::zero();
        let key = iterable_table::head_key(&profile.deposited_reserves);
        while (option::is_some(&key)) {
            let type_info = *option::borrow(&key);
            let (val, _, next) = iterable_table::borrow_iter(
                &profile.deposited_reserves, &type_info);

            let liquidation_thereshold_pct: u8 = asset_liquidation_threshold(profile_emode_id, &type_info);
            let liquidation_thereshold = decimal::from_percentage((liquidation_thereshold_pct as u128));

            let price: Decimal = asset_price(profile_emode_id, &type_info);
            let actual_amount = reserve::get_underlying_amount_from_lp_amount(
                type_info,
                val.collateral_amount
            );
            let total_value = decimal::mul(
                decimal::from_u64(actual_amount),
                price
            );

            maintenance_margin = decimal::add(
                maintenance_margin,
                decimal::mul(
                    total_value,
                    liquidation_thereshold
                )
            );
            key = next;
        };

        maintenance_margin
    }

    /// Caller needs to ensure the interest is accrued before calling this.
    public fun get_adjusted_borrowed_value(user_addr: address): Decimal acquires Profile {
        let profile = borrow_global<Profile>(user_addr);
        get_adjusted_borrowed_value_fresh_for_profile(profile, &emode_category::profile_emode(user_addr))
    }

    /// Get the risk-adjusted borrow value
    ///
    /// This takes into account the `borrow_factor` which is based on an asset's
    /// volatility.
    fun get_adjusted_borrowed_value_fresh_for_profile(profile: &Profile, profile_emode_id: &Option<string::String>): Decimal {
        let total_risk_adjusted_borrow_value = decimal::zero();
        let key = iterable_table::head_key(&profile.borrowed_reserves);
        while (option::is_some(&key)) {
            let type_info = *option::borrow(&key);
            let (val, _, next) = iterable_table::borrow_iter(&profile.borrowed_reserves, &type_info);

            let price: Decimal = asset_price(profile_emode_id, &type_info);
            let borrowed_amount = reserve::get_borrow_amount_from_share_dec(type_info, val.borrowed_share);
            let borrow_value = decimal::mul(borrowed_amount, price);
            let borrow_factor_pct = asset_borrow_factor(profile_emode_id, &type_info);
            let risked_ajusted_borrow_value = decimal::div(
                borrow_value, 
                decimal::from_percentage((borrow_factor_pct as u128))
            );

            total_risk_adjusted_borrow_value = decimal::add(
                total_risk_adjusted_borrow_value, 
                risked_ajusted_borrow_value
            );
            key = next;
        };
        total_risk_adjusted_borrow_value
    }


    /// Get the borrowing power that is still available, measured in dollars.
    public fun available_borrowing_power(user_addr: address): Decimal acquires Profile {
        let profile = borrow_global_mut<Profile>(user_addr);
        let profile_emode = emode_category::profile_emode(user_addr);

        let total_borrowed_value = get_adjusted_borrowed_value_fresh_for_profile(profile, &profile_emode);
        let total_borrowing_power = get_total_borrowing_power_from_profile_inner(profile, &profile_emode);
        assert!(decimal::gte(total_borrowing_power, total_borrowed_value), EPROFILE_NEGATIVE_EQUITY);
        decimal::sub(total_borrowing_power, total_borrowed_value)
    }

    public fun get_deposited_amount(
        user_addr: address,
        reserve_type_info: TypeInfo
    ): u64 acquires Profile {
        let profile = borrow_global_mut<Profile>(user_addr);
        if (!iterable_table::contains<TypeInfo, Deposit>(&profile.deposited_reserves, &reserve_type_info)) {
            0
        } else {
            let d = iterable_table::borrow<TypeInfo, Deposit>(&profile.deposited_reserves, &reserve_type_info);
            d.collateral_amount
        }
    }

    public fun get_borrowed_amount(
        user_addr: address,
        reserve_type_info: TypeInfo
    ): Decimal acquires Profile {
        let profile = borrow_global_mut<Profile>(user_addr);
        if (!iterable_table::contains<TypeInfo, Loan>(&profile.borrowed_reserves, &reserve_type_info)) {
            decimal::zero()
        } else {
            let loan = iterable_table::borrow_mut<TypeInfo, Loan>(
                &mut profile.borrowed_reserves,
                &reserve_type_info
            );
            reserve::get_borrow_amount_from_share_dec(reserve_type_info, loan.borrowed_share)
        }
    }

    /// Caller needs to make sure that the LP token is actually transferred.
    public(friend) fun add_collateral(
        user_addr: address,
        reserve_type_info: TypeInfo,
        amount: u64
    ) acquires Profile {
        let profile = borrow_global_mut<Profile>(user_addr);
        add_collateral_profile(profile, reserve_type_info, amount);

        emit_deposit_event(user_addr, profile, reserve_type_info);
    }


    fun add_collateral_profile(
        profile: &mut Profile,
        reserve_type_info: TypeInfo,
        amount: u64
    ) {
        assert!(amount > 0, EPROFILE_ZERO_AMOUNT);
        assert!(!iterable_table::contains(&profile.borrowed_reserves, &reserve_type_info), 0);

        let deposited_reserve = iterable_table::borrow_mut_with_default<TypeInfo, Deposit>(
            &mut profile.deposited_reserves,
            &reserve_type_info,
            Deposit { collateral_amount: 0 }
        );

        deposited_reserve.collateral_amount = deposited_reserve.collateral_amount + amount;
    }


    public(friend) fun deposit(
        user_addr: address,
        reserve_type_info: TypeInfo,
        amount: u64,
        repay_only: bool
    ): (u64, u64) acquires Profile {
        let profile = borrow_global_mut<Profile>(user_addr);
        let (repay_amount, deposit_amount) = deposit_profile(profile, reserve_type_info, amount, repay_only);

        emit_deposit_event(user_addr, profile, reserve_type_info);
        (repay_amount, deposit_amount)
    }


    /// Returns the (repay amount, deposit amount)
    /// `repay_only` means that we only repay the debt, if there is no debt we do nothing.
    fun deposit_profile(
        profile: &mut Profile,
        reserve_type_info: TypeInfo,
        amount: u64,
        repay_only: bool,
    ): (u64, u64) {
        let repay_amount = if (iterable_table::contains(&profile.borrowed_reserves, &reserve_type_info)) {
            repay_profile(profile, reserve_type_info, amount)
        } else {
            0
        };

        let deposit_amount = if (repay_only || amount <= repay_amount) {
            0
        } else {
            let amount_after_repay = amount - repay_amount;
            let lp_amount = reserve::get_lp_amount_from_underlying_amount(reserve_type_info, amount_after_repay);
            if (lp_amount > 0) {
                add_collateral_profile(profile, reserve_type_info, lp_amount);
                amount_after_repay
            } else {
                0
            }
        };

        (repay_amount, deposit_amount)
    }

    /// Callers will do the actual transfer, this function here is just for book keeping.
    /// We return a struct `CheckEquity` to enforce that health check is enforced on the caller
    /// side to make sure that it is healthy even after `remove_collateral`.
    public(friend) fun remove_collateral(
        user_addr: address,
        reserve_type_info: TypeInfo,
        amount: u64
    ): CheckEquity acquires Profile {
        let profile = borrow_global_mut<Profile>(user_addr);
        remove_collateral_profile(profile, reserve_type_info, amount);
        emit_deposit_event(user_addr, profile, reserve_type_info);
        CheckEquity { user_addr }
    }

    /// Returns: removed reward shares
    fun remove_collateral_profile(
        profile: &mut Profile,
        reserve_type_info: TypeInfo,
        amount: u64
    ) {
        assert!(!iterable_table::contains<TypeInfo, Loan>(&profile.borrowed_reserves, &reserve_type_info), EPROFILE_NO_BORROWED_RESERVE);
        assert!(
            iterable_table::contains<TypeInfo, Deposit>(&profile.deposited_reserves, &reserve_type_info),
            EPROFILE_NO_DEPOSIT_RESERVE
        );
        let deposited_reserve = iterable_table::borrow_mut<TypeInfo, Deposit>(
            &mut profile.deposited_reserves,
            &reserve_type_info
        );
        assert!(deposited_reserve.collateral_amount >= amount, EPROFILE_NOT_ENOUGH_COLLATERAL);
        deposited_reserve.collateral_amount = deposited_reserve.collateral_amount - amount;

        if (deposited_reserve.collateral_amount == 0) {
            iterable_table::remove(&mut profile.deposited_reserves, &reserve_type_info);
        };
    }


    public(friend) fun withdraw(
        user_addr: address,
        reserve_type_info: TypeInfo,
        amount: u64,
        allow_borrow: bool,
    ): (u64, u64, CheckEquity) acquires Profile {
        withdraw_internal(user_addr, reserve_type_info, amount, allow_borrow)
    }


    /// We return a struct hot potato `CheckEquity` to enforce health check after withdraw. The design makes 
    /// it possible to `withdraw`, do some trading on DEXes, then `deposit` and finally use `has_enough_collateral`
    /// to consumes the `CheckEquity`.
    fun withdraw_internal(
        user_addr: address,
        reserve_type_info: TypeInfo,
        amount: u64,
        allow_borrow: bool,
    ): (u64, u64) acquires Profile {
        let profile = borrow_global_mut<Profile>(user_addr);
        let profile_emode = emode_category::profile_emode(user_addr);

        // 1) calcular retiro + faltante
        let (withdrawal_lp_amount, borrow_amount_unchecked) = withdraw_profile(
            profile,
            &profile_emode,
            reserve_type_info,
            amount,
            allow_borrow,
        );

        // 2) si hay borrow, validar y “marcar” en el credit manager; producir el borrow_amount final
        let borrow_amount_final = if (allow_borrow && borrow_amount_unchecked > 0) {
            assert!(
                credit_manager::can_borrow(user_addr, reserve_type_info, borrow_amount_unchecked),
                ECREDIT_LIMIT_EXCEEDED
            );
            credit_manager::on_borrow(user_addr, reserve_type_info, borrow_amount_unchecked);

            // registra el préstamo en el perfil (book-keeping de shares)
            borrow_profile(profile, &profile_emode, reserve_type_info, borrow_amount_unchecked);

            // ya cubrimos el faltante vía borrow
            0
        } else {
            borrow_amount_unchecked
        };

        emit_borrow_event(user_addr, profile, reserve_type_info);
        (withdrawal_lp_amount, borrow_amount_final, CheckEquity { user_addr })
    }
    
    /// Returns the (withdraw amount in terms of LP tokens, borrow amount).
    /// In the case of u64::max, we do not borrow, just withdraw all.
    fun withdraw_profile(
        profile: &mut Profile,
        profile_emode_id: &Option<string::String>,
        reserve_type_info: TypeInfo,
        amount: u64,
        allow_borrow: bool,
    ): (u64, u64) {
        let (withdraw_lp_amount, remaining_borrow_amount) =
            if (iterable_table::contains(&profile.deposited_reserves, &reserve_type_info)) {
                let deposited_reserve = iterable_table::borrow_mut<TypeInfo, Deposit>(
                    &mut profile.deposited_reserves,
                    &reserve_type_info
                );
                let deposited_amount = reserve::get_underlying_amount_from_lp_amount(
                    reserve_type_info, deposited_reserve.collateral_amount
                );

                if (deposited_amount >= amount) {
                    let lp_amount = reserve::get_lp_amount_from_underlying_amount(reserve_type_info, amount);
                    remove_collateral_profile(profile, reserve_type_info, lp_amount);
                    (lp_amount, 0)
                } else {
                    let lp_amount = deposited_reserve.collateral_amount;
                    remove_collateral_profile(profile, reserve_type_info, lp_amount);
                    (lp_amount, amount - deposited_amount)
                }
            } else {
                (0, amount)
            };

        if (allow_borrow && remaining_borrow_amount > 0) {
            borrow_profile(profile, profile_emode_id, reserve_type_info, remaining_borrow_amount);
            remaining_borrow_amount = 0;
        };

        (withdraw_lp_amount, remaining_borrow_amount)
    }


    public fun max_borrow_amount(
        user_addr: address,
        reserve_type_info: TypeInfo,
    ): u64 acquires Profile {
        let profile_emode = emode_category::profile_emode(user_addr);
        if (!can_borrow_asset(&profile_emode, &reserve_type_info)) {
            0
        } else {
            let avail = available_borrowing_power(user_addr);
            let price = asset_price(&profile_emode, &reserve_type_info);
            let bf = asset_borrow_factor(&profile_emode, &reserve_type_info);
            let max_value = decimal::mul(avail, decimal::from_percentage((bf as u128)));
            decimal::as_u64(decimal::div(max_value, price))
        }
    }

    fun borrow_profile(
        profile: &mut Profile,
        profile_emode_id: &Option<string::String>,
        reserve_type_info: TypeInfo,
        amount: u64,
    ) {
        assert!(!iterable_table::contains(&profile.deposited_reserves, &reserve_type_info), 0);
        assert!(can_borrow_asset(profile_emode_id, &reserve_type_info), EPROFILE_EMODE_DIFF_WITH_RESERVE);

        let fee_amount = reserve::calculate_borrow_fee_using_borrow_type(
            reserve_type_info,
            amount,
        );
        let borrowed_share = reserve::get_share_amount_from_borrow_amount(
            reserve_type_info, amount + fee_amount
        );

        let borrowed_reserve = iterable_table::borrow_mut_with_default<TypeInfo, Loan>(
            &mut profile.borrowed_reserves,
            &reserve_type_info,
            Loan { borrowed_share: decimal::zero() }
        );
        borrowed_reserve.borrowed_share = decimal::add(borrowed_reserve.borrowed_share, borrowed_share);
    }


    fun repay_profile(
        profile: &mut Profile,
        reserve_type_info: TypeInfo,
        amount: u64
    ): u64 {
        assert!(amount > 0, EPROFILE_REPAY_ZERO_AMOUNT);
        assert!(!iterable_table::contains(&profile.deposited_reserves, &reserve_type_info), 0);
        assert!(
            iterable_table::contains(&profile.borrowed_reserves, &reserve_type_info),
            EPROFILE_NO_BORROWED_RESERVE
        );

        let borrowed_reserve = iterable_table::borrow_mut(
            &mut profile.borrowed_reserves,
            &reserve_type_info
        );

        let (actual_repay_amount, settle_share_amount) =
            reserve::calculate_repay(reserve_type_info, amount, borrowed_reserve.borrowed_share);

        borrowed_reserve.borrowed_share =
            decimal::sub(borrowed_reserve.borrowed_share, settle_share_amount);

        if (decimal::eq(borrowed_reserve.borrowed_share, decimal::zero())) {
            iterable_table::remove(&mut profile.borrowed_reserves, &reserve_type_info);
        };

        actual_repay_amount
    }


    public(friend) fun liquidate(
        user_addr: address,
        repay_reserve_type_info: TypeInfo,
        withdraw_reserve_type_info: TypeInfo,
        repay_amount: u64
    ): (u64, u64) acquires Profile {
        assert!(repay_amount > 0, 0);
        let profile = borrow_global_mut<Profile>(user_addr);
        let profile_emode = emode_category::profile_emode(user_addr);

        let (actual_repay_amount, withdraw_amount) = liquidate_profile(
            profile,
            &profile_emode,
            repay_reserve_type_info,
            withdraw_reserve_type_info,
            repay_amount
        );

        // events WITHOUT profile_name
        emit_deposit_event(user_addr, profile, withdraw_reserve_type_info);
        emit_borrow_event(user_addr, profile, repay_reserve_type_info);

        (actual_repay_amount, withdraw_amount)
    }


    // TODO: Consider adding dynamic liquidation bonus.
    /// Returns the (actual_repay_amount, actual_withdraw_amount) and update the `Profile`.
    fun liquidate_profile(
        profile: &mut Profile,
        profile_emode_id: &Option<string::String>,
        repay_reserve_type_info: TypeInfo,
        withdraw_reserve_type_info: TypeInfo,
        repay_amount: u64
    ): (u64, u64) {
        let total_borrowed_value = get_adjusted_borrowed_value_fresh_for_profile(profile, profile_emode_id);
        let liquidation_borrowed_value = get_liquidation_borrow_value_inner(profile, profile_emode_id);

        assert!(decimal::gte(total_borrowed_value, liquidation_borrowed_value), EPROFILE_IS_HEALTHY);
        assert!(iterable_table::contains(&profile.borrowed_reserves, &repay_reserve_type_info), EPROFILE_NO_BORROWED_RESERVE);
        assert!(iterable_table::contains(&profile.deposited_reserves, &withdraw_reserve_type_info), EPROFILE_NO_DEPOSIT_RESERVE);

        let repay_reserve = iterable_table::borrow_mut(&mut profile.borrowed_reserves, &repay_reserve_type_info);
        let withdraw_reserve = iterable_table::borrow_mut(&mut profile.deposited_reserves, &withdraw_reserve_type_info);

        let borrowed_amount = reserve::get_borrow_amount_from_share_dec(repay_reserve_type_info, repay_reserve.borrowed_share);

        let liquidation_bonus_bips = decimal::from_bips(
            (asset_liquidation_bonus_bips(profile_emode_id, &withdraw_reserve_type_info) as u128)
        );
        let bonus_rate = decimal::add(decimal::one(), liquidation_bonus_bips);
        let max_amount = decimal::min(decimal::from_u64(repay_amount), borrowed_amount);
        let borrowed_asset_price = asset_price(profile_emode_id, &repay_reserve_type_info);
        let withdraw_asset_price = asset_price(profile_emode_id, &withdraw_reserve_type_info);
        let collateral_amount = reserve::get_underlying_amount_from_lp_amount(
            withdraw_reserve_type_info,
            withdraw_reserve.collateral_amount
        );
        let collateral_value = decimal::mul(decimal::from_u64(collateral_amount), withdraw_asset_price);

        let (actual_repay_amount, withdraw_amount, settled_share_amount) =
            if (decimal::lt(borrowed_amount, decimal::from_u64(LIQUIDATION_CLOSE_AMOUNT))) {
                let liquidation_value = decimal::mul(borrowed_amount, borrowed_asset_price);
                let bonus_liquidation_value = decimal::mul(liquidation_value, bonus_rate);

                if (decimal::gte(bonus_liquidation_value, collateral_value)) {
                    let repay_pct = decimal::div(collateral_value, bonus_liquidation_value);
                    (
                        decimal::ceil_u64(decimal::mul(max_amount, repay_pct)),
                        withdraw_reserve.collateral_amount,
                        repay_reserve.borrowed_share
                    )
                } else {
                    let withdraw_pct = decimal::div(bonus_liquidation_value, collateral_value);
                    (
                        decimal::ceil_u64(max_amount),
                        decimal::floor_u64(decimal::mul_u64(withdraw_pct, withdraw_reserve.collateral_amount)),
                        repay_reserve.borrowed_share
                    )
                }
            } else {
                let max_liquidation_value_for_repay_reserve = decimal::mul(borrowed_asset_price, max_amount);
                let fractionalised_max_liqudiation_value =
                    decimal::mul(total_borrowed_value, decimal::from_percentage(LIQUIDATION_CLOSE_FACTOR_PERCENTAGE));
                let max_liquidation_value =
                    decimal::min(max_liquidation_value_for_repay_reserve, fractionalised_max_liqudiation_value);

                let max_liquidation_amount = decimal::div(max_liquidation_value, borrowed_asset_price);
                let bonus_liquidation_value = decimal::mul(max_liquidation_value, bonus_rate);

                if (decimal::gte(bonus_liquidation_value, collateral_value)) {
                    let repay_percentage = decimal::div(collateral_value, bonus_liquidation_value);
                    let settled_amount = decimal::mul(max_liquidation_amount, repay_percentage);
                    let repay_amount = decimal::ceil_u64(settled_amount);
                    let withdraw_amount = withdraw_reserve.collateral_amount;
                    let settled_share = decimal::min(
                        reserve::get_share_amount_from_borrow_amount_dec(repay_reserve_type_info, settled_amount),
                        repay_reserve.borrowed_share
                    );
                    (repay_amount, withdraw_amount, settled_share)
                } else {
                    let withdraw_percentage = decimal::div(bonus_liquidation_value, collateral_value);
                    let settled_amount = max_liquidation_amount;
                    let repay_amount = decimal::ceil_u64(settled_amount);
                    let withdraw_amount = decimal::floor_u64(decimal::mul_u64(withdraw_percentage, withdraw_reserve.collateral_amount));
                    let settled_share = decimal::min(
                        reserve::get_share_amount_from_borrow_amount_dec(repay_reserve_type_info, settled_amount),
                        repay_reserve.borrowed_share
                    );
                    (repay_amount, withdraw_amount, settled_share)
                }
            };

        repay_reserve.borrowed_share = decimal::sub(repay_reserve.borrowed_share, settled_share_amount);
        withdraw_reserve.collateral_amount = withdraw_reserve.collateral_amount - withdraw_amount;

        if (decimal::eq(repay_reserve.borrowed_share, decimal::zero())) {
            iterable_table::remove(&mut profile.borrowed_reserves, &repay_reserve_type_info);
        };
        if (withdraw_reserve.collateral_amount == 0) {
            iterable_table::remove(&mut profile.deposited_reserves, &withdraw_reserve_type_info);
        };

        (actual_repay_amount, withdraw_amount)
    }

    fun emit_deposit_event(
        user_addr: address,
        profile: &Profile,
        reserve_type: TypeInfo,
    ) {
        let collateral_amount =
            if (iterable_table::contains(&profile.deposited_reserves, &reserve_type)) {
                iterable_table::borrow(&profile.deposited_reserves, &reserve_type).collateral_amount
            } else { 0 };
        event::emit(SyncProfileDepositEvent {
            user_addr,
            reserve_type,
            collateral_amount,
        })
    }


    fun emit_borrow_event(
        user_addr: address,
        profile: &Profile,
        reserve_type: TypeInfo,
    ) {
        let borrowed_share =
            if (iterable_table::contains(&profile.borrowed_reserves, &reserve_type)) {
                iterable_table::borrow<TypeInfo, Loan>(&profile.borrowed_reserves, &reserve_type).borrowed_share
            } else { decimal::zero() };
        event::emit(SyncProfileBorrowEvent {
            user_addr,
            reserve_type,
            borrowed_share_decimal: decimal::raw(borrowed_share),
        })
    }


    #[view]
    /// Returns whether the profile is eligible for the specified emode.
    /// # Returns
    ///
    /// * `bool`: is eligible or not. (will be `true` if the profile is alredy in emode)
    /// * `bool`: has enough collateral or not if the profile enter the emode.
    /// * `vector<string::String>`: which reserves make profile ineligible for the emode.
    public fun is_eligible_for_emode(
        user_addr: address,
        emode_id: string::String
    ): (bool, bool, vector<string::String>) acquires Profile {
        let profile = borrow_global<Profile>(user_addr);

        if (emode_category::profile_emode(user_addr) == option::some(emode_id)) {
            (true, has_enough_collateral_for_profile(profile, &option::some(emode_id)), vector::empty())
        } else {
            let ineligible_reserves = vector::empty();
            let borrowed_reserves = &profile.borrowed_reserves;
            let borrowed_key = iterable_table::head_key(borrowed_reserves);
            while (option::is_some(&borrowed_key)) {
                let borrowed_type = *option::borrow(&borrowed_key);
                let (_, _, next) = iterable_table::borrow_iter(borrowed_reserves, &borrowed_type);

                if (!emode_category::reserve_in_emode_t(&emode_id, borrowed_type)) {
                    vector::push_back(&mut ineligible_reserves, type_info_to_name(borrowed_type));
                };
                borrowed_key = next;
            };

            if (
                vector::length(&ineligible_reserves) > 0 ||
                !has_enough_collateral_for_profile(profile, &option::some(emode_id))
            ) {
                (false, false, ineligible_reserves)
            } else {
                (true, true, ineligible_reserves)
            }
        }
    }


    public(friend) fun set_emode(user_addr: address, emode_id_x: Option<string::String>) acquires Profile {
        let profile = borrow_global<Profile>(user_addr);

        if (option::is_some(&emode_id_x)) {
            let borrowed_reserves = &profile.borrowed_reserves;
            let borrowed_key = iterable_table::head_key(borrowed_reserves);
            let emode_id = option::extract(&mut emode_id_x);

            while (option::is_some(&borrowed_key)) {
                let borrowed_type = *option::borrow(&borrowed_key);
                let (_, _, next) = iterable_table::borrow_iter(borrowed_reserves, &borrowed_type);

                assert!(
                    emode_category::reserve_in_emode_t(&emode_id, borrowed_type),
                    EPROFILE_EMODE_DIFF_WITH_RESERVE
                );

                borrowed_key = next;
            };

            emode_category::profile_enter_emode(user_addr, emode_id);
        } else {
            emode_category::profile_exit_emode(user_addr);
        };

        assert!(
            has_enough_collateral_for_profile(profile, &emode_id_x),
            EPROFILE_NOT_ENOUGH_COLLATERAL
        );
    }


    public(friend) fun asset_borrow_factor(_profile_emode_id: &Option<string::String>, reserve_type: &TypeInfo): u8 {
        reserve::borrow_factor(*reserve_type)
    }

    public(friend) fun asset_ltv(profile_emode_id: &Option<string::String>, reserve_type: &TypeInfo): u8 {
        let reserve_emode = emode_category::reserve_emode_t(*reserve_type);
        if (emode_is_matching(profile_emode_id, &reserve_emode)) {
            emode_category::emode_loan_to_value(option::extract(&mut reserve_emode))
        } else {
            reserve::loan_to_value(*reserve_type)
        }
    }

    public(friend) fun asset_liquidation_threshold(profile_emode_id: &Option<string::String>, reserve_type: &TypeInfo): u8 {
        let reserve_emode = emode_category::reserve_emode_t(*reserve_type);
        if (emode_is_matching(profile_emode_id, &reserve_emode)) {
            emode_category::emode_liquidation_threshold(option::extract(&mut reserve_emode))
        } else {
            reserve::liquidation_threshold(*reserve_type)
        }
    }

    public(friend) fun asset_liquidation_bonus_bips(profile_emode_id: &Option<string::String>, reserve_type: &TypeInfo): u64 {
        let reserve_emode = emode_category::reserve_emode_t(*reserve_type);
        if (emode_is_matching(profile_emode_id, &reserve_emode)) {
            emode_category::emode_liquidation_bonus_bips(option::extract(&mut reserve_emode))
        } else {
            reserve::liquidation_bonus_bips(*reserve_type)
        }
    }

    public(friend) fun asset_price(
        _profile_emode_id: &Option<string::String>,
        _reserve_type: &TypeInfo
    ): Decimal {
        decimal::one()
    }

    public(friend) fun can_borrow_asset(profile_emode_id: &Option<string::String>, reserve_type: &TypeInfo): bool {
        let reserve_emode = emode_category::reserve_emode_t(*reserve_type);
        if (option::is_some(profile_emode_id)) {
            // Only delete assets of the same e-mode.
            emode_is_matching(profile_emode_id, &reserve_emode)
        } else {
            true
        }
    }

    public(friend) fun emode_is_matching(profile_emode_id: &Option<string::String>, reserve_emode_id: &Option<string::String>): bool {
        if (option::is_some(profile_emode_id) &&
            option::is_some(reserve_emode_id) &&
            *option::borrow(profile_emode_id) == *option::borrow(reserve_emode_id)
        ) {
            true
        } else {
            false
        }
    }

    fun type_info_to_name(typ: TypeInfo): string::String {
        string_utils::format3(
            &b"{}::{}::{}",
            type_info::account_address(&typ),
            string::utf8(type_info::module_name(&typ)),
            string::utf8(type_info::struct_name(&typ))
        )
    }

}
