module lendoor::credit_manager {
    use aptos_std::type_info::{Self, TypeInfo};
    use util_types::iterable_table::{Self as itab, IterableTable};
    use aptos_framework::signer;
    use lendoor::controller_config;

    const E_NOT_INITIALIZED: u64 = 1;
    const E_LIMIT_EXCEEDED: u64 = 2;

    struct UserBook has store, drop {
        limits: IterableTable<TypeInfo, u64>,
        usage:  IterableTable<TypeInfo, u64>,
        paused: bool,
    }

    struct GlobalCredit has key {
        users: IterableTable<address, UserBook>,
    }

    public entry fun init(account: &signer) {
        // guardar el libro global en la address del paquete (@lendoor)
        assert!(!exists<GlobalCredit>(@lendoor), 0);
        move_to(account, GlobalCredit { users: itab::new() });
    }

    fun gc_mut(): &mut GlobalCredit {
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        borrow_global_mut<GlobalCredit>(@lendoor)
    }
    fun gc(): &GlobalCredit {
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        borrow_global<GlobalCredit>(@lendoor)
    }

    public entry fun admin_set_limit(
        admin: &signer,
        user: address,
        asset: TypeInfo,
        limit: u64
    ) {
        controller_config::assert_is_admin(signer::address_of(admin));
        let g = gc_mut();
        let book = itab::borrow_mut_with_default(
            &mut g.users,
            &user,
            UserBook { limits: itab::new(), usage: itab::new(), paused: false }
        );
        itab::upsert<TypeInfo, u64>(&mut book.limits, &asset, limit);
    }

    public entry fun admin_pause_user(admin: &signer, user: address, paused: bool) {
        controller_config::assert_is_admin(signer::address_of(admin));
        let g = gc_mut();
        let book = itab::borrow_mut_with_default(
            &mut g.users,
            &user,
            UserBook { limits: itab::new(), usage: itab::new(), paused: false }
        );
        book.paused = paused;
    }

    public fun can_borrow(user: address, asset: TypeInfo, amount: u64): bool {
        let g = gc();
        if (!itab::contains(&g.users, &user)) { return false };
        let book = itab::borrow(&g.users, &user);
        if (book.paused) { return false };
        let limit = if (itab::contains(&book.limits, &asset)) { *itab::borrow(&book.limits, &asset) } else { 0 };
        let used  = if (itab::contains(&book.usage,  &asset)) { *itab::borrow(&book.usage,  &asset) } else { 0 };
        limit >= used + amount
    }

    public fun on_borrow(user: address, asset: TypeInfo, amount: u64) {
        let g = gc_mut();
        let book = itab::borrow_mut_with_default(
            &mut g.users,
            &user,
            UserBook { limits: itab::new(), usage: itab::new(), paused: false }
        );
        let limit = if (itab::contains(&book.limits, &asset)) { *itab::borrow(&book.limits, &asset) } else { 0 };
        let used_ref = itab::borrow_mut_with_default<TypeInfo, u64>(&mut book.usage, &asset, 0);
        assert!(*used_ref + amount <= limit && !book.paused, E_LIMIT_EXCEEDED);
        *used_ref = *used_ref + amount;
    }

    public fun on_repay(user: address, asset: TypeInfo, amount: u64) {
        let g = gc_mut();
        if (!itab::contains(&g.users, &user)) { return };
        let book = itab::borrow_mut(&mut g.users, &user);
        let used_ref = itab::borrow_mut_with_default<TypeInfo, u64>(&mut book.usage, &asset, 0);
        if (*used_ref > amount) { *used_ref = *used_ref - amount } else { *used_ref = 0 };
    }

    #[view]
    public fun get_limit(user: address, asset: TypeInfo): u64 {
        let g = gc();
        if (!itab::contains(&g.users, &user)) { 0 } else {
            let book = itab::borrow(&g.users, &user);
            if (!itab::contains(&book.limits, &asset)) { 0 } else { *itab::borrow(&book.limits, &asset) }
        }
    }

    #[view]
    public fun get_usage(user: address, asset: TypeInfo): u64 {
        let g = gc();
        if (!itab::contains(&g.users, &user)) { 0 } else {
            let book = itab::borrow(&g.users, &user);
            if (!itab::contains(&book.usage, &asset)) { 0 } else { *itab::borrow(&book.usage, &asset) }
        }
    }
}