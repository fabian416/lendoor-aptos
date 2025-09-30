module lendoor::controller {
    use std::signer;
    use std::string;
    use aptos_std::event::{Self}; 

    use aptos_framework::coin;
    use aptos_framework::coin::Coin; 
    use aptos_framework::fungible_asset::Metadata;
    use aptos_framework::object::Object;

    use util_types::decimal;

    use lendoor_config::interest_rate_config;
    use lendoor_config::reserve_config;
    use lendoor_config::utils;

    use lendoor::controller_config;
    use lendoor::credit_manager;
    use lendoor::fa_to_coin_wrapper;
    use lendoor::profile;
    use lendoor::reserve; 
    use lendoor::reserve::LP;
    use lendoor::junior;
    use lendoor::tranche_manager;
    use lendoor::tranche_config;


    //
    // Errors.
    //

    /// When the minimum output amount is not satisfied from controller.
    const ECONTROLLER_SWAP_MINIMUM_OUT_NOT_MET: u64 = 0;
    /// When the deposit amount is zero.
    const ECONTROLLER_DEPOSIT_ZERO_AMOUNT: u64 = 1;
    /// When the account is not Aries Markets Account. 
    const ECONTROLLER_NOT_ARIES: u64 = 2;

    #[event]
    struct AddReserveEvent<phantom CoinType> has drop, store  {
        signer_addr: address,
        initial_exchange_rate_decimal: u128,
        reserve_conf: reserve_config::ReserveConfig,
        interest_rate_conf: interest_rate_config::InterestRateConfig,
    }
    
    #[event]
    struct RegisterUserEvent has drop, store {
        user_addr: address,
        default_profile_name: string::String,
    }

    #[event]
    struct MintLPShareEvent<phantom CoinType> has drop, store {
        user_addr: address,
        amount: u64,
        lp_amount: u64,
    }

    #[event]
    struct RedeemLPShareEvent<phantom CoinType> has drop, store {
        user_addr: address,
        amount: u64,
        lp_amount: u64,
    }

    #[event]
    struct AddLPShareEvent<phantom CoinType> has drop, store {
        user_addr: address,
        lp_amount: u64,
    }

    #[event]
    struct RemoveLPShareEvent<phantom CoinType> has drop, store {
        user_addr: address,
        profile_name: string::String,
        lp_amount: u64,
    }

    #[event]
    struct DepositEvent<phantom CoinType> has drop, store {
        sender: address,
        receiver: address,
        profile_name: string::String,
        amount_in: u64,
        repay_only: bool,
        repay_amount: u64,
        deposit_amount: u64,
    }

    #[event]
    struct WithdrawEvent<phantom CoinType> has drop, store {
        sender: address,
        profile_name: string::String,
        amount_in: u64,
        allow_borrow: bool,
        withdraw_amount: u64,
        borrow_amount: u64,
    }

    #[event]
    struct LiquidateEvent<phantom RepayCoin, phantom WithdrawCoin> has drop, store {
        liquidator: address,
        liquidatee: address,
        liquidatee_profile_name: string::String,
        repay_amount_in: u64,
        redeem_lp: bool,
        repay_amount: u64,
        withdraw_lp_amount: u64,
        liquidation_fee_amount: u64,
        redeem_lp_amount: u64,
    }

    #[event]
    struct DepositRepayForEvent<phantom CoinType> has drop, store {
        receiver: address,
        receiver_profile_name: string::String,
        deposit_amount: u64,
        repay_amount: u64,
    }

    #[event]
    struct SwapEvent<phantom InCoin, phantom OutCoin> has drop, store {
        sender: address,
        profile_name: string::String,
        amount_in: u64,
        amount_min_out: u64,
        allow_borrow: bool,
        in_withdraw_amount: u64,
        in_borrow_amount: u64,
        out_deposit_amount: u64,
        out_repay_amount: u64,
    }

    #[event]
    struct UpsertPrivilegedReferrerConfigEvent has drop, store {
        signer_addr: address,
        claimant_addr: address,
        fee_sharing_percentage: u8,
    }

    #[event]
    struct UpdateReserveConfigEvent<phantom CoinType> has drop, store {
        signer_addr: address,
        config: reserve_config::ReserveConfig, 
    }

    #[event]
    struct UpdateInterestRateConfigEvent<phantom CoinType> has drop, store {
        signer_addr: address,
        config: interest_rate_config::InterestRateConfig,
    }

    #[event]
    struct ProfileEModeSet has drop, store {
        user_addr: address,
        profile_name: string::String,
        // An empty string indicates exiting emode, 
        // while any other non-empty string represents an active emode configuration.
        emode_id: string::String,
    }

    #[event]
    struct EModeCategorySet has drop, store {
        signer_addr: address,
        id: string::String,
        label: string::String,
        loan_to_value: u8,
        liquidation_threshold: u8,
        liquidation_bonus_bips: u64,
        oracle_key_type: string::String,
    }

    #[event]
    struct ReserveEModeSet has drop, store {
        signer_addr: address,
        reserve_str: string::String,
        // An empty string indicates exiting emode, 
        // while any other non-empty string represents an active emode configuration.
        emode_id: string::String,
    }

    fun apply_tranche_effects<Coin0>(profit: u64, loss: u64, junior_addr: address, tranche_bps: u16) {
        if (loss > 0) {
            let lp_to_burn = reserve::get_lp_amount_from_underlying_amount(reserve::type_info<Coin0>(), loss);
            if (lp_to_burn > 0) {
                let burned_lp = junior::pull_and_burn<Coin0>(junior_addr, lp_to_burn);
                if (burned_lp < lp_to_burn) {
                    let remaining_lp = lp_to_burn - burned_lp;
                    let remaining_assets =
                        reserve::get_underlying_amount_from_lp_amount(reserve::type_info<Coin0>(), remaining_lp);
                    if (remaining_assets > 0) {
                        reserve::apply_external_loss_assets<Coin0>(remaining_assets);
                    };
                };
            };
        };

        if (profit > 0 && tranche_bps > 0) {
            reserve::mint_tranche_fee_shares<Coin0>(junior_addr, profit, tranche_bps);
        };
    }

    /// Deployment: we can just use a normal human owned account (will need to make sure that 
    /// this account is only used for deployment) and transfer the authentication key to a 
    /// multisig/another account later on.
    public entry fun init(account: &signer, admin_addr: address) {
        controller_config::init_config(account, admin_addr);
        reserve::init(account);
        credit_manager::init(account); // << new
    }

    public entry fun init_wrapper_fa_signer(account: &signer) {
        fa_to_coin_wrapper::init(account);
    }

    public entry fun init_wrapper_coin<WCoin>(account: &signer, metadata: Object<Metadata>) {
        fa_to_coin_wrapper::add_fa<WCoin>(account, metadata);
    }

    /// Need to have a corresponding Wrapped Coin.
    public entry fun deposit_fa<WCoin>(
        account: &signer,
        profile_name: vector<u8>,
        amount: u64,
    ) {
        profile::ensure_for_signer(account); // ← lazy init (friend call)
        let coin = fa_to_coin_wrapper::fa_to_coin<WCoin>(account, amount);
        deposit_and_repay_for<WCoin>(signer::address_of(account), &string::utf8(profile_name), coin);
    }

    /// Need to have a corresponding Wrapped Coin.
    public entry fun withdraw_fa<WCoin>(
        account: &signer,
        profile_name: vector<u8>,
        amount: u64,
        allow_borrow: bool,
    ) {
        withdraw<WCoin>(account, profile_name, amount, allow_borrow);
        // In the case when `WCoin` is "leaked", it might cause more `WCoin` gets converted to FA.
        let amount = coin::balance<WCoin>(signer::address_of(account));
        let coin = coin::withdraw<WCoin>(account, amount);
        fa_to_coin_wrapper::coin_to_fa<WCoin>(coin, account);
    }

    public entry fun add_reserve<Coin0>(admin: &signer) {
        controller_config::assert_is_admin(signer::address_of(admin));
        // TODO: change to use `lp_store` since it won't always be the same as the `admin`.
        // TODO: change to custom configuration.
        reserve::create<Coin0>(
            admin,
            decimal::one(),
            reserve_config::default_config(),
            interest_rate_config::default_config()
        );
        tranche_manager::init_for<Coin0>(admin);

        event::emit(AddReserveEvent<Coin0> {
            signer_addr: signer::address_of(admin),
            initial_exchange_rate_decimal: decimal::raw(decimal::one()),
            reserve_conf: reserve_config::default_config(),
            interest_rate_conf: interest_rate_config::default_config()
        });
    }

    #[test_only]
    public entry fun add_reserve_for_test<Coin0>(admin: &signer) {
        controller_config::assert_is_admin(signer::address_of(admin));
        reserve::create<Coin0>(
            admin,
            decimal::one(),
            reserve_config::default_test_config(),
            interest_rate_config::default_config()
        );
        tranche_manager::init_for<Coin0>(admin)
    }

    /// Register the user and also create a default `Profile` with the given name.
    /// We requires that a name is given instead of a default name such as "main" because it might be
    /// possible for user to already have a `ResourceAccount` that collides with our default name.
    public entry fun register_user(
        account: &signer,
        default_profile_name: vector<u8>
    ) {
        // Only one profile per user:
        profile::init(account);

        // You can keep the event for telemetry (the name is no longer used on-chain)
        event::emit(RegisterUserEvent {
            user_addr: signer::address_of(account),
            default_profile_name: string::utf8(default_profile_name),
        })
    }
    /// Mint yield bearing LP tokens for a given user. The minted LP tokens does not increase the borrowing power.
    /// Instead it will be return to user's wallet. If the users would like to increase their borrowing power,
    /// they should use the `deposit` entry function below.
    public entry fun mint<Coin0>(
        account: &signer,
        amount: u64,
    ) {
        let coin = coin::withdraw<Coin0>(account, amount);
        let lp_coin = reserve::mint<Coin0>(coin);
        let lp_amount = coin::value(&lp_coin);

        utils::deposit_coin<LP<Coin0>>(account, lp_coin);

        event::emit(MintLPShareEvent<Coin0> {
            user_addr: signer::address_of(account),
            amount: amount,
            lp_amount: lp_amount,
        })
    }

    /// Redeem the yield bearing LP tokens from a given user.
    public entry fun redeem<Coin0>(
        account: &signer,
        amount: u64,
    ) {
        let lp_coin = coin::withdraw<LP<Coin0>>(account, amount);
        let coin = reserve::redeem<Coin0>(lp_coin);
        let coin_amount = coin::value(&coin);

        utils::deposit_coin<Coin0>(account, coin);

        event::emit(RedeemLPShareEvent<Coin0> {
            user_addr: signer::address_of(account),
            amount: coin_amount,
            lp_amount: amount,
        })
    }

    /// Contribute the yield bearing tokens to increase user's borrowing power.
    /// This function should rarely be used. Use `deposit` directly for simplicity.
    public entry fun add_collateral<Coin0>(
        account: &signer,
        amount: u64,
    ) {
        let addr = signer::address_of(account);

        // Book-keeping in Profile (unique profile)
        profile::add_collateral(addr, reserve::type_info<Coin0>(), amount);

        // Move the user's LPs to the reserve
        let lp_coin = coin::withdraw<LP<Coin0>>(account, amount);
        reserve::add_collateral<Coin0>(lp_coin);

        event::emit(AddLPShareEvent<Coin0> {
            user_addr: addr,
            lp_amount: amount,
        });
    }

    /// Withdraw the yield bearing tokens to user's wallet.
    /// This function should rarely be used. Use `withdraw` directly for simplicity.
    public entry fun remove_collateral<Coin0>(
        account: &signer,
        profile_name: vector<u8>,
        amount: u64,
    ) {
        let addr = signer::address_of(account);

        profile::remove_collateral(addr, reserve::type_info<Coin0>(), amount);

        let lp_coin = reserve::remove_collateral<Coin0>(amount);
        utils::deposit_coin<LP<Coin0>>(account, lp_coin);

        event::emit(RemoveLPShareEvent<Coin0> {
            user_addr: addr,
            profile_name: string::utf8(profile_name),
            lp_amount: amount,
        })
    }
    /// Deposit funds into the Aries protocol, this can result in two scenarios:
    ///
    /// 1. User has an existing `Coin0` loan: the amount will first used to repay the loan then the
    ///    remaining part contribute to the collateral.
    ///
    /// 2. User doesn't have an existing loan: all the amount will be contributed to collateral.
    ///
    /// When the amount is `u64::max`, we will repay all the debt without deposit to Aries. This is
    /// so that we don't leave any dust when users try to repay all.
    public entry fun deposit<Coin0>(
        account: &signer,
        profile_name: vector<u8>,
        amount: u64,
        repay_only: bool,
    ) {
        assert!(amount > 0, ECONTROLLER_DEPOSIT_ZERO_AMOUNT);
        // Lazy init (solo el dueño puede crear su Profile)
        profile::ensure_for_signer(account);
        let addr = signer::address_of(account);
        deposit_for<Coin0>(account, profile_name, amount, addr, repay_only);
    }

    /// Deposit fund on behalf of someone else, useful when a given profile is insolvent
    /// and a third party can step in to repay on behalf of the owner.
    public fun deposit_for<Coin0>(
        account: &signer,
        profile_name: vector<u8>,
        amount: u64,
        receiver_addr: address,
        repay_only: bool,
    ) {
        let (repay_amount, deposit_amount) = profile::deposit(
            receiver_addr,
            reserve::type_info<Coin0>(),
            amount,
            repay_only
        );

        if (repay_amount > 0) {
            let repay_coin = coin::withdraw<Coin0>(account, repay_amount);
            let remaining = reserve::repay<Coin0>(repay_coin);
            let actual_repay = repay_amount - coin::value(&remaining);
            utils::deposit_coin<Coin0>(account, remaining);
            if (actual_repay > 0) {
                credit_manager::on_repay(receiver_addr, reserve::type_info<Coin0>(), actual_repay);
            };
            let (p, l, j, b) = tranche_manager::sync_and_get<Coin0>();
            apply_tranche_effects<Coin0>(p, l, j, b);
        };

        if (deposit_amount > 0) {
            let deposit_coin = coin::withdraw<Coin0>(account, deposit_amount);
            let lp = reserve::mint<Coin0>(deposit_coin);
            reserve::add_collateral<Coin0>(lp);
        };

        event::emit(DepositEvent<Coin0> {
            sender: signer::address_of(account),
            receiver: receiver_addr,
            profile_name: string::utf8(profile_name),
            amount_in: amount,
            repay_only: repay_only,
            repay_amount: repay_amount,
            deposit_amount: deposit_amount,
        });
    }

    public fun deposit_and_repay_for<Coin0>(
        addr: address,
        profile_name: &string::String,
        coin: Coin<Coin0>,
    ): (u64, u64) {
        // We will disable `repay_only` in this case. 
        // Because it would cause remaining coins to be reclaimed after repay. 
        // We cannot drop them and would not add a new address parameter to reclaim them. 
        let (repay_amount, deposit_amount) = profile::deposit(
            addr,
            reserve::type_info<Coin0>(),
            coin::value(&coin),
            false
        );
        let repay_coin = coin::extract(&mut coin, repay_amount);
        assert!(coin::value(&coin) == deposit_amount, 0);
        deposit_coin_to_reserve<Coin0>(repay_coin, coin);

        event::emit(DepositRepayForEvent<Coin0> {
            receiver: addr,
            receiver_profile_name: *profile_name,
            deposit_amount: deposit_amount,
            repay_amount: repay_amount,
        });

        (deposit_amount, repay_amount)
    }

    fun deposit_coin_to_reserve<Coin0>(
        repay_coin: Coin<Coin0>,
        deposit_coin: Coin<Coin0>,
    ) {
        let repay_remaining_coin = reserve::repay<Coin0>(repay_coin);
        coin::destroy_zero<Coin0>(repay_remaining_coin);

        let (p, l, j, b) = tranche_manager::sync_and_get<Coin0>();
        apply_tranche_effects<Coin0>(p, l, j, b);

        if (coin::value(&deposit_coin) > 0) {
            let lp_coin = reserve::mint<Coin0>(deposit_coin);
            reserve::add_collateral<Coin0>(lp_coin);
        } else {
            coin::destroy_zero(deposit_coin);
        }
    }


    /// Withdraw fund into the Aries protocol, there are two scenarios:
    ///
    /// 1. User have an existing `Coin0` deposit: the existing deposit will be withdrawn first, if
    /// it is not enough and user `allow_borrow`, a loan will be taken out.
    ///
    /// 2. User doesn't have an existing `Coin0` deposit: if user `allow_borrow`, a loan will be taken out.
    ///
    /// When the amount is `u64::max`, we will repay all the deposited funds from Aries. This is so
    /// that we don't leave any dust when users try to withdraw all.
    public entry fun withdraw<Coin0>(
        account: &signer,
        profile_name: vector<u8>,
        amount: u64,
        allow_borrow: bool,
    ) {
        let addr = signer::address_of(account);
        let (withdraw_amount, borrow_amount) = profile::withdraw(
            addr, reserve::type_info<Coin0>(), amount, allow_borrow
        );


        let withdraw_coin = withdraw_from_reserve<Coin0>(withdraw_amount, borrow_amount);


        let actual_withdraw_amount = coin::value(&withdraw_coin);
        utils::deposit_coin<Coin0>(account, withdraw_coin);

        event::emit(WithdrawEvent<Coin0> {
            sender: signer::address_of(account),
            profile_name: string::utf8(profile_name),
            amount_in: amount,
            allow_borrow: allow_borrow,
            withdraw_amount: actual_withdraw_amount,
            borrow_amount: borrow_amount,
        });
    }

    fun withdraw_from_reserve<Coin0>(
        withdraw_amount: u64,
        borrow_amount: u64,
    ): Coin<Coin0> {
        let withdraw_coin = if (withdraw_amount == 0) {
            coin::zero()
        } else {
            let lp_coin = reserve::remove_collateral<Coin0>(withdraw_amount);
            reserve::redeem<Coin0>(lp_coin)
        };

        let borrowed_coin = if (borrow_amount == 0) {
            coin::zero()
        } else {
            reserve::borrow<Coin0>(borrow_amount)
        };
        coin::merge<Coin0>(&mut borrowed_coin, withdraw_coin);
        borrowed_coin
    }
    
    /// Admin-only: updates the on-chain **ReserveConfig** for `Coin0`.
    /// This adjusts LTV, liquidation params, protocol fee ratios, deposit/borrow limits,
    /// and collateral/redeem permissions. Emits `UpdateReserveConfigEvent<Coin0>`.
    public entry fun update_reserve_config<Coin0>(
        admin: &signer,
        loan_to_value: u8,
        liquidation_threshold: u8,
        liquidation_bonus_bips: u64,
        liquidation_fee_hundredth_bips: u64,
        borrow_factor: u8,
        reserve_ratio: u8,
        borrow_fee_hundredth_bips: u64,
        withdraw_fee_hundredth_bips: u64,
        deposit_limit: u64,
        borrow_limit: u64,
        allow_collateral: bool,
        allow_redeem: bool,
    ) {
        controller_config::assert_is_admin(signer::address_of(admin));
        let new_reserve_config = reserve_config::new_reserve_config(
            loan_to_value,
            liquidation_threshold,
            liquidation_bonus_bips,
            liquidation_fee_hundredth_bips,
            borrow_factor,
            reserve_ratio,
            borrow_fee_hundredth_bips,
            withdraw_fee_hundredth_bips,
            deposit_limit,
            borrow_limit,
            allow_collateral,
            allow_redeem,
        );
        reserve::update_reserve_config<Coin0>(new_reserve_config);

        event::emit(UpdateReserveConfigEvent<Coin0> {
            signer_addr: signer::address_of(admin),
            config: new_reserve_config,
        });
    }

    /// Admin-only: forces `total_cash_available` in reserve details to match
    /// the actual on-chain balance in the reserve’s coin store for `Coin0`.
    public entry fun admin_sync_available_cash<Coin0>(admin: &signer) {
        controller_config::assert_is_admin(signer::address_of(admin));
        reserve::sync_cash_available<Coin0>();
    }

    /// Admin-only: updates the **InterestRateConfig** (interest model) for `Coin0`.
    /// Sets min/optimal/max borrow rates and the optimal utilization kink. Emits
    /// `UpdateInterestRateConfigEvent<Coin0>`.
    public entry fun update_interest_rate_config<Coin0>(
        admin: &signer,
        min_borrow_rate: u64,
        optimal_borrow_rate: u64,
        max_borrow_rate: u64,
        optimal_utilization: u64
    ) {
        controller_config::assert_is_admin(signer::address_of(admin));
        let new_interest_rate_config = interest_rate_config::new_interest_rate_config(
            min_borrow_rate,
            optimal_borrow_rate,
            max_borrow_rate,
            optimal_utilization
        );
        reserve::update_interest_rate_config<Coin0>(new_interest_rate_config);

        event::emit(UpdateInterestRateConfigEvent<Coin0> {
            signer_addr: signer::address_of(admin),
            config: new_interest_rate_config,
        });
    }

    /// Admin-only: withdraws accumulated **borrow fees** for `Coin0` to the admin account.
    /// After moving the fees, it triggers tranche sync/apply so junior/senior accounting
    /// reflects any profit realized by the pool.
    public entry fun withdraw_borrow_fee<Coin0>(
        admin: &signer
    ) {
        controller_config::assert_is_admin(signer::address_of(admin));
        let fee_coin = reserve::withdraw_borrow_fee<Coin0>();
        utils::deposit_coin<Coin0>(admin, fee_coin);

        let (p, l, j, b) = tranche_manager::sync_and_get<Coin0>();
        apply_tranche_effects<Coin0>(p, l, j, b);
    }

    /// Admin-only: withdraws accrued **reserve fees** (protocol reserve) for `Coin0`
    /// to the admin account. Then runs tranche sync/apply to propagate the effects
    /// to junior/senior according to the configured split.
    public entry fun withdraw_reserve_fee<Coin0>(
        admin: &signer
    ) {
        controller_config::assert_is_admin(signer::address_of(admin));
        let fee_coin = reserve::withdraw_reserve_fee<Coin0>();
        utils::deposit_coin<Coin0>(admin, fee_coin);

        let (p, l, j, b) = tranche_manager::sync_and_get<Coin0>();
        apply_tranche_effects<Coin0>(p, l, j, b);
    }

    /// Keeper-only: reports realized **profit** and/or **loss** in underlying assets for `Coin0`.
    /// Losses are first absorbed by the junior tranche by burning their LP (first-loss).
    /// Any shortfall beyond junior’s balance is applied as an external asset loss.
    /// Profits are shared to junior by minting LP according to `tranche_bps`.
    public entry fun report<Coin0>(keeper: &signer, profit: u64, loss: u64) {
        controller_config::assert_is_admin(signer::address_of(keeper));
        let (junior_addr, tranche_bps) = tranche_config::for_coin<Coin0>();

        if (loss > 0) {
            let lp_to_burn = reserve::get_lp_amount_from_underlying_amount(reserve::type_info<Coin0>(), loss);
            if (lp_to_burn > 0) {
                let burned_lp = junior::pull_and_burn<Coin0>(junior_addr, lp_to_burn);
                if (burned_lp < lp_to_burn) {
                    let remaining_lp = lp_to_burn - burned_lp;
                    let remaining_assets =
                        reserve::get_underlying_amount_from_lp_amount(reserve::type_info<Coin0>(), remaining_lp);
                    if (remaining_assets > 0) {
                        reserve::apply_external_loss_assets<Coin0>(remaining_assets);
                    };
                };
            };
        };

        if (profit > 0 && tranche_bps > 0) {
            reserve::mint_tranche_fee_shares<Coin0>(junior_addr, profit, tranche_bps);
        };
    }


}
