module lendoor::tranche_manager {
    use util_types::decimal;
    use lendoor::reserve;
    use lendoor::reserve_details;
    use lendoor::tranche_config;

    struct TrancheState<phantom Coin0> has key {
        last_total_assets: u128,
        junior_addr: address,
        tranche_bps: u16,
        initialized: bool,
    }

    /// Admin-only bootstrap for a given `Coin0`:
    /// stores current junior address & split bps and marks state uninitialized (so first sync sets baseline).
    public entry fun init_for<Coin0>(admin: &signer) {
        if (!exists<TrancheState<Coin0>>(@lendoor)) {
            let (j, bps) = tranche_config::for_coin<Coin0>();
            move_to(
                admin,
                TrancheState<Coin0> {
                    last_total_assets: 0,
                    junior_addr: j,
                    tranche_bps: bps,
                    initialized: false,
                }
            );
        }
    }

    /// Computes current TVL-like metric in underlying units (cash + borrows − reserve), as u128.
    fun current_total_assets_u128<Coin0>(): u128 {
        let det = reserve::reserve_details(reserve::type_info<Coin0>());
        let tvl_dec = reserve_details::total_user_liquidity(&mut det);
        decimal::as_u128(tvl_dec)
    }

    /// Helper: clamp a u128 down to u64 without magic constants.
    /// Calculates U64_MAX as ((1u128 << 64) - 1) and returns:
    ///  - x as u64, if x <= U64_MAX
    ///  - U64_MAX as u64, otherwise
    fun clamp_u128_to_u64(x: u128): u64 {
        let u64_max_u128 = ((1 as u128) << 64) - 1;
        if (x > u64_max_u128) {
            (u64_max_u128 as u64)
        } else {
            (x as u64)
        }
    }

    /// Syncs the state and returns (profit, loss, junior_addr, tranche_bps).
    /// On first call it only sets the baseline and returns zeros.
    public fun sync_and_get<Coin0>(): (u64, u64, address, u16) acquires TrancheState {
        assert!(exists<TrancheState<Coin0>>(@lendoor), 9002);
        let s = borrow_global_mut<TrancheState<Coin0>>(@lendoor);

        // Refresh config (junior address & split) from tranche_config on every sync.
        let (j, bps) = tranche_config::for_coin<Coin0>();
        s.junior_addr = j;
        s.tranche_bps = bps;

        let cur = current_total_assets_u128<Coin0>();
        if (!s.initialized) {
            s.last_total_assets = cur;
            s.initialized = true;
            return (0, 0, s.junior_addr, s.tranche_bps);
        };

        if (cur >= s.last_total_assets) {
            let profit_u128 = cur - s.last_total_assets;
            let profit = clamp_u128_to_u64(profit_u128);
            s.last_total_assets = cur;
            (profit, 0, s.junior_addr, s.tranche_bps)
        } else {
            let loss_u128 = s.last_total_assets - cur;
            let loss = clamp_u128_to_u64(loss_u128);
            s.last_total_assets = cur;
            (0, loss, s.junior_addr, s.tranche_bps)
        }
    }
}
