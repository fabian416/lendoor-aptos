module lendoor::junior {
    use std::signer;
    use std::option::{Self};
    use std::string;
    use aptos_framework::coin::{Self, Coin, MintCapability, BurnCapability, FreezeCapability};
    use lendoor::controller_config;
    
    use lendoor_config::utils;
    use lendoor::reserve::{Self as senior, LP};
    
    friend lendoor::controller;
    const DEC_SCALE: u128 = 1_000_000_000;

    struct S<phantom Coin0> has store, drop, key {}

    struct JVault<phantom Coin0> has key {
        admin: address,
        lp_box: Coin<LP<Coin0>>,
        s_mint: MintCapability<S<Coin0>>,
        s_burn: BurnCapability<S<Coin0>>,
        s_freeze: FreezeCapability<S<Coin0>>,
    }

    public entry fun init_for<Coin0>(admin: &signer) {
        let owner = signer::address_of(admin);
        if (exists<JVault<Coin0>>(owner)) {
            return;
        };

        let symbol = string::utf8(b"jUSD");
        let name = string::utf8(b"Junior USD Shares");

        let (burn, freeze, mint) = coin::initialize<S<Coin0>>(
            admin,
            name,
            symbol,
            coin::decimals<LP<Coin0>>(),
            true
        );
        move_to(admin, JVault<Coin0> {
            admin: owner,
            lp_box: coin::zero<LP<Coin0>>(),
            s_mint: mint,
            s_burn: burn,
            s_freeze: freeze,
        });
    }

    public entry fun deposit<Coin0>(user: &signer, amount_lp: u64) acquires JVault {
        let owner = controller_config::admin_addr();
        let v = borrow_global_mut<JVault<Coin0>>(owner);
        let lp_in = coin::withdraw<LP<Coin0>>(user, amount_lp);

        let total_shares_opt = coin::supply<S<Coin0>>();
        let total_shares: u128 = if (option::is_some(&total_shares_opt)) {
            *option::borrow(&total_shares_opt)
        } else { 0 };

        let total_lp: u64 = coin::value(&v.lp_box);

        let shares_to_mint: u64;
        if (total_shares == 0 || total_lp == 0) {
            shares_to_mint = amount_lp;
        } else {
            shares_to_mint = ((((amount_lp as u128)) * (total_shares)) / (total_lp as u128)) as u64;
        };

        coin::merge(&mut v.lp_box, lp_in);
        let s_coins = coin::mint<S<Coin0>>(shares_to_mint, &v.s_mint);
        utils::deposit_coin<S<Coin0>>(user, s_coins);
    }

    public entry fun withdraw<Coin0>(user: &signer, shares: u64) acquires JVault {
        let owner = controller_config::admin_addr();
        let v = borrow_global_mut<JVault<Coin0>>(owner);

        let s = coin::withdraw<S<Coin0>>(user, shares);
        utils::burn_coin<S<Coin0>>(s, &v.s_burn);

        let total_shares_opt = coin::supply<S<Coin0>>();
        let total_shares: u128 = if (option::is_some(&total_shares_opt)) {
            *option::borrow(&total_shares_opt)
        } else { 0 };

        let total_lp: u64 = coin::value(&v.lp_box);

        let lp_out: u64;
        if (total_shares == 0) {
            lp_out = 0;
        } else {
            lp_out = ((((shares as u128)) * (total_lp as u128)) / total_shares) as u64;
        };

        let lp = coin::extract<LP<Coin0>>(&mut v.lp_box, lp_out);
        utils::deposit_coin<LP<Coin0>>(user, lp);
    }

    public(friend) fun absorb_loss<Coin0>(admin_addr: address, loss_assets: u64) acquires JVault {
        let v = borrow_global_mut<JVault<Coin0>>(admin_addr);
        if (loss_assets == 0) return;
        let lp_to_burn = senior::get_lp_amount_from_underlying_amount(senior::type_info<Coin0>(), loss_assets);
        if (lp_to_burn == 0) return;
        let available = coin::value(&v.lp_box);
        let burn_lp_amt = if (available >= lp_to_burn) lp_to_burn else available;
        if (burn_lp_amt == 0) return;

        let lp = coin::extract<LP<Coin0>>(&mut v.lp_box, burn_lp_amt);
        senior::burn_lp<Coin0>(lp);
    }

    public(friend) fun pull_and_burn<Coin0>(admin_addr: address, lp_amount: u64): u64 acquires JVault {
        let v = borrow_global_mut<JVault<Coin0>>(admin_addr);
        let available = coin::value(&v.lp_box);
        let burn_lp_amt = if (available >= lp_amount) lp_amount else available;
        if (burn_lp_amt == 0) return 0;
        let lp = coin::extract<LP<Coin0>>(&mut v.lp_box, burn_lp_amt);
        senior::burn_lp<Coin0>(lp);
        burn_lp_amt
    }

    #[view]
    public fun pps_scaled<Coin0>(): u128 acquires JVault {
        let owner = controller_config::admin_addr();
        if (!exists<JVault<Coin0>>(owner)) {
            return DEC_SCALE;
        };

        let v = borrow_global<JVault<Coin0>>(owner);

        let total_lp: u64 = coin::value(&v.lp_box);

        let supply_opt = coin::supply<S<Coin0>>();
        let total_shares: u128 =
            if (option::is_some(&supply_opt)) { *option::borrow(&supply_opt) } else { 0 };

        if (total_lp == 0 || total_shares == 0) {
            DEC_SCALE
        } else {
            ((total_lp as u128) * DEC_SCALE) / total_shares
        }
    }
}
