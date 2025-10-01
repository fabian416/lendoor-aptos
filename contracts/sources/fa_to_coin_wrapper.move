module lendoor::fa_to_coin_wrapper {
    use std::signer;
    use std::string;
    use std::vector;
    use std::option::{Self};
    use aptos_std::math64;

    use aptos_framework::account::{Self, SignerCapability};
    use aptos_framework::coin::{Self, Coin, MintCapability, BurnCapability, FreezeCapability};
    use aptos_framework::fungible_asset::{Self, Metadata};
    use aptos_framework::object::{Object};
    use aptos_framework::primary_fungible_store;

    use lendoor::controller_config;

    friend lendoor::controller;

    const EWRAPPER_COIN_INFO_ALREADY_EXIST: u64 = 2;
    const EWRAPPER_COIN_INFO_DOES_NOT_EXIST: u64 = 3;
    const EFA_SIGNER_DOES_NOT_EXIST: u64 = 4;
    const EAMOUNT_MISMATCH: u64 = 5;

    // Resource account que custodiará el FA y el coin envuelto
    struct FASigner has key, store {
        addr: address,
        cap: SignerCapability,
    }

    // Estado por tipo envuelto
    struct WrapperCoinInfo<phantom WCoin> has key {
        mint_capability: MintCapability<WCoin>,
        burn_capability: BurnCapability<WCoin>,
        freeze_capability: FreezeCapability<WCoin>,
        metadata: Object<Metadata>,
        fa_amount: u64,
    }

    // ---------- INIT ----------

    /// Crea el resource account SOLO si todavía no existe (idempotente).
    public(friend) fun init_if_needed(account: &signer, seed: vector<u8>) {
        controller_config::assert_is_admin(signer::address_of(account));
        let admin = controller_config::admin_addr();
        if (!exists<FASigner>(admin)) {
            let (fa_signer, cap) = account::create_resource_account(account, seed);
            move_to(account, FASigner { addr: signer::address_of(&fa_signer), cap });
        }
    }

    #[view]
    public fun fa_signer_exists(): bool {
        exists<FASigner>(controller_config::admin_addr())
    }

    #[view]
    public fun fa_signer_addr(): address acquires FASigner {
        let admin = controller_config::admin_addr();
        assert!(exists<FASigner>(admin), EFA_SIGNER_DOES_NOT_EXIST);
        borrow_global<FASigner>(admin).addr
    }

    // ---------- WRAP (FA -> Coin) ----------

    /// Inicializa el CoinInfo para WCoin y lo asocia al FA **solo si aún no existe**.
    public(friend) fun add_fa_if_needed<WCoin>(
        account: &signer,
        metadata: Object<Metadata>
    ) acquires FASigner {
        controller_config::assert_is_admin(signer::address_of(account));
        let admin = controller_config::admin_addr();
        assert!(exists<FASigner>(admin), EFA_SIGNER_DOES_NOT_EXIST);

        // 🔧 IMPORTANTE: este if como statement termina con ';'
        if (exists<WrapperCoinInfo<WCoin>>(admin)) { return; };

        let (symbol, name) = make_symbol_and_name_for_wrapped_coin(metadata);
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<WCoin>(
            account,
            name,
            symbol,
            fungible_asset::decimals(metadata),
            true
        );

        let fas = borrow_global<FASigner>(admin);
        primary_fungible_store::ensure_primary_store_exists(fas.addr, metadata);

        move_to(
            account,
            WrapperCoinInfo<WCoin> {
                mint_capability: mint_cap,
                burn_capability: burn_cap,
                freeze_capability: freeze_cap,
                metadata,
                fa_amount: 0,
            }
        );
    }

    public fun fa_to_coin<WCoin>(account: &signer, amount: u64): Coin<WCoin> acquires WrapperCoinInfo, FASigner {
        let admin = controller_config::admin_addr();
        assert!(exists<FASigner>(admin), EFA_SIGNER_DOES_NOT_EXIST);
        assert!(exists<WrapperCoinInfo<WCoin>>(admin), EWRAPPER_COIN_INFO_DOES_NOT_EXIST);

        let fas = borrow_global_mut<FASigner>(admin);
        let w   = borrow_global_mut<WrapperCoinInfo<WCoin>>(admin);

        let supply = coin::supply<WCoin>();
        if (option::is_some(&supply)) {
            assert!(*option::borrow(&supply) <= (w.fa_amount as u128), EAMOUNT_MISMATCH);
        };
        w.fa_amount = w.fa_amount + amount;
        primary_fungible_store::transfer(account, w.metadata, fas.addr, amount);
        coin::mint<WCoin>(amount, &w.mint_capability)
    }

    public fun coin_to_fa<WCoin>(wrapped_coin: Coin<WCoin>, account: &signer) acquires WrapperCoinInfo, FASigner {
        let admin = controller_config::admin_addr();
        assert!(exists<FASigner>(admin), EFA_SIGNER_DOES_NOT_EXIST);
        assert!(exists<WrapperCoinInfo<WCoin>>(admin), EWRAPPER_COIN_INFO_DOES_NOT_EXIST);

        let fas = borrow_global_mut<FASigner>(admin);
        let w   = borrow_global_mut<WrapperCoinInfo<WCoin>>(admin);
        let supply = coin::supply<WCoin>();
        let amount = coin::value<WCoin>(&wrapped_coin);

        if (option::is_some(&supply)) {
            assert!(*option::borrow(&supply) <= (w.fa_amount as u128), EAMOUNT_MISMATCH);
        };
        w.fa_amount = w.fa_amount - amount;
        primary_fungible_store::transfer(&account::create_signer_with_capability(&fas.cap), w.metadata, signer::address_of(account), amount);
        coin::burn(wrapped_coin, &w.burn_capability);
    }

    // ---------- VIEWS ----------

    #[view]
    public fun is_fa_wrapped_coin<WCoin>(): bool {
        exists<WrapperCoinInfo<WCoin>>(controller_config::admin_addr())
    }

    #[view]
    public fun is_ready<WCoin>(): bool {
        fa_signer_exists() && is_fa_wrapped_coin<WCoin>()
    }

    #[view]
    public fun wrapped_amount<WCoin>(): u64 acquires WrapperCoinInfo {
        let admin = controller_config::admin_addr();
        assert!(exists<WrapperCoinInfo<WCoin>>(admin), EWRAPPER_COIN_INFO_DOES_NOT_EXIST);
        borrow_global<WrapperCoinInfo<WCoin>>(admin).fa_amount
    }

    // ---------- Helpers ----------
    fun make_symbol_and_name_for_wrapped_coin(metadata: Object<Metadata>): (string::String, string::String) {
        let symbol0 = fungible_asset::symbol(metadata);
        let mut_sym = vector::empty();
        vector::append(&mut mut_sym, b"W");
        vector::append(&mut mut_sym, *string::bytes(&symbol0));
        let symbol_str = string::utf8(mut_sym);

        let name0 = fungible_asset::name(metadata);
        let mut_nm = b"Wrapped ";
        vector::append(&mut mut_nm, *string::bytes(&name0));
        let name_str = string::utf8(mut_nm);

        (
            string::sub_string(&symbol_str, 0, math64::min(string::length(&symbol_str), 10)),
            string::sub_string(&name_str,   0, math64::min(string::length(&name_str),   32)),
        )
    }

    // --- Aliases no-idempotentes (compat) ---
    public(friend) fun init(account: &signer) {
        // Usa una seed por defecto; cambia la seed en cada re-deploy si es necesario
        init_if_needed(account, b"FASigner");
    }

    public(friend) fun add_fa<WCoin>(account: &signer, metadata: Object<Metadata>) acquires FASigner {
        add_fa_if_needed<WCoin>(account, metadata);
    }
}