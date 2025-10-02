module lendoor_config::reserve_config {
    struct ReserveConfig has copy, drop, store {
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
    }

    public fun default_config(): ReserveConfig {
        ReserveConfig {
            loan_to_value: 50,
            liquidation_threshold: 60,
            liquidation_bonus_bips: 500,
            liquidation_fee_hundredth_bips: 0,
            borrow_factor: 100,
            reserve_ratio: 10,
            borrow_fee_hundredth_bips: 0,
            withdraw_fee_hundredth_bips: 0,
            deposit_limit: 18446744073709551615,
            borrow_limit: 18446744073709551615,
            allow_collateral: true,
            allow_redeem: true,
        }
    }

    public fun new_reserve_config(
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
    ): ReserveConfig {
        ReserveConfig {
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
        }
    }

    // getters
    public fun loan_to_value(c: &ReserveConfig): u8 { c.loan_to_value }
    public fun liquidation_threshold(c: &ReserveConfig): u8 { c.liquidation_threshold }
    public fun liquidation_bonus_bips(c: &ReserveConfig): u64 { c.liquidation_bonus_bips }
    public fun liquidation_fee_hundredth_bips(c: &ReserveConfig): u64 { c.liquidation_fee_hundredth_bips }
    public fun borrow_factor(c: &ReserveConfig): u8 { c.borrow_factor }
    public fun reserve_ratio(c: &ReserveConfig): u8 { c.reserve_ratio }
    public fun borrow_fee_hundredth_bips(c: &ReserveConfig): u64 { c.borrow_fee_hundredth_bips }
    public fun withdraw_fee_hundredth_bips(c: &ReserveConfig): u64 { c.withdraw_fee_hundredth_bips }
    public fun deposit_limit(c: &ReserveConfig): u64 { c.deposit_limit }
    public fun borrow_limit(c: &ReserveConfig): u64 { c.borrow_limit }
    public fun allow_collateral(c: &ReserveConfig): bool { c.allow_collateral }
    public fun allow_redeem(c: &ReserveConfig): bool { c.allow_redeem }
}
