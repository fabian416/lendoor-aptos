module lendoor::tranche_config {
    use std::signer;
    use aptos_std::table::{Self, Table};
    use aptos_std::type_info::{TypeInfo, type_of};
    
    use lendoor::controller_config;

    const E_NOT_SET: u64 = 1;

    struct TrancheCfg has copy, drop, store {
        junior_addr: address,
        tranche_bps: u16,
    }

    struct TrancheByAsset has key {
        map: Table<TypeInfo, TrancheCfg>,
    }

    public entry fun init(admin: &signer) {
        controller_config::assert_is_admin(signer::address_of(admin));
        if (!exists<TrancheByAsset>(@lendoor)) {
            move_to(admin, TrancheByAsset { map: table::new() });
        }
    }

    public entry fun set_for<Coin0>(
        admin: &signer,
        junior_addr: address,
        tranche_bps: u16
    ) acquires TrancheByAsset {
        controller_config::assert_is_admin(signer::address_of(admin));
        let s = borrow_global_mut<TrancheByAsset>(@lendoor);
        let key = type_of<Coin0>();

        if (table::contains(&s.map, key)) {
            let cfg_ref = table::borrow_mut(&mut s.map, key);
            *cfg_ref = TrancheCfg { junior_addr, tranche_bps };
        } else {
            table::add(&mut s.map, key, TrancheCfg { junior_addr, tranche_bps });
        };
    }

    public fun for_coin<Coin0>(): (address, u16) acquires TrancheByAsset {
        let s = borrow_global<TrancheByAsset>(@lendoor);
        let ti = type_of<Coin0>();
        assert!(table::contains(&s.map, ti), E_NOT_SET);
        let c = table::borrow(&s.map, ti);
        (c.junior_addr, c.tranche_bps)
    }
}
