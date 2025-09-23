module lendoor::credit_manager {
    use std::signer;
    use aptos_std::type_info::{Self, TypeInfo};
    use util_types::iterable_table::{Self as itab, IterableTable};
    use lendoor::controller_config;

    const E_NOT_INITIALIZED: u64 = 1;
    const E_LIMIT_EXCEEDED: u64 = 2;

    /// Libro por usuario (valor del map global).
    /// IMPORTANTE: NO poner `drop` porque `IterableTable` no la tiene y haría fallar el struct contenedor.
    struct UserBook has store {
        limits: IterableTable<TypeInfo, u64>, // límite por activo
        usage:  IterableTable<TypeInfo, u64>, // usado por activo
        paused: bool,
    }

    /// Recurso global que vive en @lendoor con el mapeo user -> UserBook
    struct GlobalCredit has key {
        users: IterableTable<address, UserBook>,
    }

    /// Debe ejecutarse con la cuenta @lendoor (la del paquete) y ser admin.
    public entry fun init(account: &signer) {
        controller_config::assert_is_admin(signer::address_of(account));
        assert!(!exists<GlobalCredit>(@lendoor), 0);
        move_to(account, GlobalCredit {
            users: itab::new<address, UserBook>(),
        });
    }

    fun gc_mut(): &mut GlobalCredit {
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        borrow_global_mut<GlobalCredit>(@lendoor)
    }
    fun gc(): &GlobalCredit {
        assert!(exists<GlobalCredit>(@lendoor), E_NOT_INITIALIZED);
        borrow_global<GlobalCredit>(@lendoor)
    }

    /// Admin: setea (reemplaza) límite por activo para un usuario.
    public entry fun admin_set_limit(
        admin: &signer,
        user: address,
        asset: TypeInfo,
        limit: u64
    ) {
        controller_config::assert_is_admin(signer::address_of(admin));
        let g = gc_mut();
        let book = itab::borrow_mut_with_default<address, UserBook>(
            &mut g.users,
            &user,
            UserBook {
                limits: itab::new<TypeInfo, u64>(),
                usage:  itab::new<TypeInfo, u64>(),
                paused: false
            }
        );
        // No hay `upsert`: usamos borrow_mut_with_default sobre la tabla interna
        let entry = itab::borrow_mut_with_default<TypeInfo, u64>(&mut book.limits, &asset, 0);
        *entry = limit;
    }

    /// Admin: pausar / despausar a un usuario (bloquea borrow).
    public entry fun admin_pause_user(admin: &signer, user: address, paused: bool) {
        controller_config::assert_is_admin(signer::address_of(admin));
        let g = gc_mut();
        let book = itab::borrow_mut_with_default<address, UserBook>(
            &mut g.users,
            &user,
            UserBook {
                limits: itab::new<TypeInfo, u64>(),
                usage:  itab::new<TypeInfo, u64>(),
                paused: false
            }
        );
        book.paused = paused;
    }

    /// Chequeo rápido: ¿puede pedir prestado `amount` de `asset`?
    public fun can_borrow(user: address, asset: TypeInfo, amount: u64): bool {
        let g = gc();
        if (!itab::contains<address, UserBook>(&g.users, &user)) { return false };
        let book = itab::borrow<address, UserBook>(&g.users, &user);
        if (book.paused) { return false };

        let limit = if (itab::contains<TypeInfo, u64>(&book.limits, &asset)) {
            *itab::borrow<TypeInfo, u64>(&book.limits, &asset)
        } else { 0 };

        let used  = if (itab::contains<TypeInfo, u64>(&book.usage, &asset)) {
            *itab::borrow<TypeInfo, u64>(&book.usage, &asset)
        } else { 0 };

        used + amount <= limit
    }

    /// Hook de ejecución: se llama cuando el borrow se hace efectivo.
    public(friend) fun on_borrow(user: address, asset: TypeInfo, amount: u64) {
        let g = gc_mut();
        let book = itab::borrow_mut_with_default<address, UserBook>(
            &mut g.users,
            &user,
            UserBook {
                limits: itab::new<TypeInfo, u64>(),
                usage:  itab::new<TypeInfo, u64>(),
                paused: false
            }
        );

        let limit = if (itab::contains<TypeInfo, u64>(&book.limits, &asset)) {
            *itab::borrow<TypeInfo, u64>(&book.limits, &asset)
        } else { 0 };

        let used_ref = itab::borrow_mut_with_default<TypeInfo, u64>(&mut book.usage, &asset, 0);
        assert!(*used_ref + amount <= limit && !book.paused, E_LIMIT_EXCEEDED);
        *used_ref = *used_ref + amount;
    }

    /// Hook de ejecución: se llama cuando hay repago (reduce el “used”).
    public(friend) fun on_repay(user: address, asset: TypeInfo, amount: u64) {
        let g = gc_mut();
        if (!itab::contains<address, UserBook>(&g.users, &user)) { return };
        let book = itab::borrow_mut<address, UserBook>(&mut g.users, &user);
        let used_ref = itab::borrow_mut_with_default<TypeInfo, u64>(&mut book.usage, &asset, 0);
        if (*used_ref > amount) { *used_ref = *used_ref - amount } else { *used_ref = 0 };
    }

    #[view]
    public fun get_limit(user: address, asset: TypeInfo): u64 {
        let g = gc();
        if (!itab::contains<address, UserBook>(&g.users, &user)) { 0 } else {
            let book = itab::borrow<address, UserBook>(&g.users, &user);
            if (!itab::contains<TypeInfo, u64>(&book.limits, &asset)) { 0 } else {
                *itab::borrow<TypeInfo, u64>(&book.limits, &asset)
            }
        }
    }

    #[view]
    public fun get_usage(user: address, asset: TypeInfo): u64 {
        let g = gc();
        if (!itab::contains<address, UserBook>(&g.users, &user)) { 0 } else {
            let book = itab::borrow<address, UserBook>(&g.users, &user);
            if (!itab::contains<TypeInfo, u64>(&book.usage, &asset)) { 0 } else {
                *itab::borrow<TypeInfo, u64>(&book.usage, &asset)
            }
        }
    }
}