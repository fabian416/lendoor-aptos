module oracle::oracle {
    use std::signer;
    use aptos_std::simple_map::{Self as simple_map, SimpleMap};
    use aptos_std::type_info::{Self as type_info, TypeInfo};
    use decimal::decimal::{Self as dec, Decimal};

    const EADMIN_MISMATCH: u64 = 1;
    const ENOT_INIT: u64 = 2;

    struct OracleStore has key {
        admin: address,
        prices: SimpleMap<TypeInfo, Decimal>,
    }

    /// Guarda el store en @aries (mismo signer que el resto de singletons).
    public fun init(account: &signer, admin: address) {
        assert!(signer::address_of(account) == @aries, EADMIN_MISMATCH);
        move_to(account, OracleStore { admin, prices: simple_map::new() });
    }

    fun assert_init() { assert!(exists<OracleStore>(@aries), ENOT_INIT) }

    public fun is_admin(a: address): bool acquires OracleStore {
        assert_init();
        borrow_global<OracleStore>(@aries).admin == a
    }

    /// Setea precio por TypeInfo (admin only).
    public fun set_price_t(admin: &signer, key: TypeInfo, price: Decimal) acquires OracleStore {
        assert!(is_admin(signer::address_of(admin)), EADMIN_MISMATCH);
        let s = borrow_global_mut<OracleStore>(@aries);
        if (simple_map::contains_key(&s.prices, &key)) {
            *simple_map::borrow_mut(&mut s.prices, &key) = price;
        } else {
            simple_map::add(&mut s.prices, key, price);
        }
    }

    /// Setea precio por tipo fantasma.
    public fun set_price<OracleKey>(admin: &signer, price: Decimal) acquires OracleStore {
        set_price_t(admin, type_info::type_of<OracleKey>(), price)
    }

    /// -------- LECTURAS --------

    /// Versión interna para otros módulos ON-CHAIN: acepta TypeInfo.
    /// (No es #[view], así evitamos el error de “TypeInfo no soportado como parámetro de transacción”.)
    public fun get_price_ti(key: TypeInfo): Decimal acquires OracleStore {
        if (!exists<OracleStore>(@aries)) {
            dec::one()
        } else {
            let s = borrow_global<OracleStore>(@aries);
            if (simple_map::contains_key(&s.prices, &key)) {
                *simple_map::borrow(&s.prices, &key)
            } else {
                dec::one()
            }
        }
    }

    /// Versión pública para llamadas externas / vistas: genérica, sin TypeInfo como parámetro.
    #[view]
    public fun get_price<OracleKey>(): Decimal acquires OracleStore {
        get_price_ti(type_info::type_of<OracleKey>())
    }
}
