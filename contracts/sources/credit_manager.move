module lendoor::credit_manager {
    use std::signer;
    use aptos_std::type_info::{Self as type_info, TypeInfo};
    use util_types::iterable_table::{Self as itab, IterableTable};
    use aptos_std::simple_map::{Self as ref_map, SimpleMap};
    use lendoor::controller_config;

    // Lo usa profile
    friend lendoor::profile;

    const E_NOT_INITIALIZED: u64 = 1;
    const E_LIMIT_EXCEEDED: u64 = 2;

    /// Libro por usuario (solo `store`; NO `drop` porque contiene IterableTable)
    struct UserBook has store {
        limits: IterableTable<TypeInfo, u64>, // límite por activo
        usage:  IterableTable<TypeInfo, u64>, // usado por activo
        paused: bool,
    }

    /// Recurso global @lendoor con user -> UserBook
    struct GlobalCredit has key {
        users: SimpleMap<address, UserBook>,
    }

    /// Inicialización (cuenta admin = @lendoor)
    public entry fun init(account: &signer) {
        controller_config::assert_is_admin(signer::address_of(account));
        assert!(!exists<GlobalCredit>(@lendoor), 0);
        move_to(account, GlobalCredit {
            users: ref_map::create<address, UserBook>(),
        });
    }

    /// Helper: asegura que exista el UserBook y devuelve &mut
    fun ensure_user_book(g: &mut GlobalCredit, user: address): &mut UserBook {
        if (!ref_map::contains_key<address, UserBook>(&g.users, &user)) {
            let empty = UserBook {
                limits: itab::new<TypeInfo, u64>(),
                usage:  itab::new<TypeInfo, u64>(),
                paused: false,
            };
            ref_map::add<address, UserBook>(&mut g.users, user, empty);
        };
        ref_map::borrow_mut<address, UserBook>(&mut g.users, &user)
    }

    /// Admin: setea (reemplaza) el límite por activo (genérica para evitar pasar TypeInfo)
    public entry fun admin_set_limit<AssetType>(
        admin: &signer,
        user: address,
        limit: u64
    ) acquires GlobalCredit {
        controller_config::assert_is_admin(signer::address_of(admin));
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        let g = borrow_global_mut<GlobalCredit>(@lendoor);
        let book = ensure_user_book(g, user);
        let asset = type_info::type_of<AssetType>();
        let entry = itab::borrow_mut_with_default<TypeInfo, u64>(&mut book.limits, &asset, 0);
        *entry = limit;
    }

    /// Admin: pausar / despausar usuario
    public entry fun admin_pause_user(
        admin: &signer,
        user: address,
        paused: bool
    ) acquires GlobalCredit {
        controller_config::assert_is_admin(signer::address_of(admin));
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        let g = borrow_global_mut<GlobalCredit>(@lendoor);
        let book = ensure_user_book(g, user);
        book.paused = paused;
    }

    /************ Hooks/APIs internas para profile (pueden recibir TypeInfo) ************/

    /// ¿Puede pedir prestado `amount` de `asset`? (friend)
    public(friend) fun can_borrow(
        user: address,
        asset: TypeInfo,
        amount: u64
    ): bool acquires GlobalCredit {
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        let g = borrow_global<GlobalCredit>(@lendoor);

        if (!ref_map::contains_key<address, UserBook>(&g.users, &user)) { return false };
        let book = ref_map::borrow<address, UserBook>(&g.users, &user);
        if (book.paused) { return false };

        let limit = if (itab::contains<TypeInfo, u64>(&book.limits, &asset)) {
            *itab::borrow<TypeInfo, u64>(&book.limits, &asset)
        } else { 0 };

        let used  = if (itab::contains<TypeInfo, u64>(&book.usage, &asset)) {
            *itab::borrow<TypeInfo, u64>(&book.usage, &asset)
        } else { 0 };

        used + amount <= limit
    }

    /// Hook: se llama cuando el borrow se materializa (incrementa uso). (friend)
    public(friend) fun on_borrow(
        user: address,
        asset: TypeInfo,
        amount: u64
    ) acquires GlobalCredit {
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        let g = borrow_global_mut<GlobalCredit>(@lendoor);
        let book = ensure_user_book(g, user);

        let limit = if (itab::contains<TypeInfo, u64>(&book.limits, &asset)) {
            *itab::borrow<TypeInfo, u64>(&book.limits, &asset)
        } else { 0 };

        let used_ref = itab::borrow_mut_with_default<TypeInfo, u64>(&mut book.usage, &asset, 0);
        assert!(*used_ref + amount <= limit && !book.paused, E_LIMIT_EXCEEDED);
        *used_ref = *used_ref + amount;
    }

    /// Hook: repago (reduce el “used”). (friend)
    public(friend) fun on_repay(
        user: address,
        asset: TypeInfo,
        amount: u64
    ) acquires GlobalCredit {
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        let g = borrow_global_mut<GlobalCredit>(@lendoor);
        if (!ref_map::contains_key<address, UserBook>(&g.users, &user)) { return };
        let book = ref_map::borrow_mut<address, UserBook>(&mut g.users, &user);
        let used_ref = itab::borrow_mut_with_default<TypeInfo, u64>(&mut book.usage, &asset, 0);
        if (*used_ref > amount) { *used_ref = *used_ref - amount } else { *used_ref = 0 };
    }

    /************************ Vistas públicas (genéricas) ************************/

    #[view]
    public fun get_limit<AssetType>(user: address): u64 acquires GlobalCredit {
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        let g = borrow_global<GlobalCredit>(@lendoor);
        if (!ref_map::contains_key<address, UserBook>(&g.users, &user)) { 0 } else {
            let book = ref_map::borrow<address, UserBook>(&g.users, &user);
            let asset = type_info::type_of<AssetType>();
            if (!itab::contains<TypeInfo, u64>(&book.limits, &asset)) { 0 } else {
                *itab::borrow<TypeInfo, u64>(&book.limits, &asset)
            }
        }
    }

    #[view]
    public fun get_usage<AssetType>(user: address): u64 acquires GlobalCredit {
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        let g = borrow_global<GlobalCredit>(@lendoor);
        if (!ref_map::contains_key<address, UserBook>(&g.users, &user)) { 0 } else {
            let book = ref_map::borrow<address, UserBook>(&g.users, &user);
            let asset = type_info::type_of<AssetType>();
            if (!itab::contains<TypeInfo, u64>(&book.usage, &asset)) { 0 } else {
                *itab::borrow<TypeInfo, u64>(&book.usage, &asset)
            }
        }
    }
}