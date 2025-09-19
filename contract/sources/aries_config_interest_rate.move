module aries_config::interest_rate_config {
    use decimal::decimal::{Self as dec, Decimal};

    /// Config mínima para curva de interés. Tu `reserve_details` puede leer estos campos.
    struct InterestRateConfig has copy, drop, store {
        min_borrow_rate: u64,
        optimal_borrow_rate: u64,
        max_borrow_rate: u64,
        optimal_utilization: u64,
    }

    public fun default_config(): InterestRateConfig {
        // valores placeholder
        InterestRateConfig {
            min_borrow_rate: 0,
            optimal_borrow_rate: 200,   // 2.00% si tu motor interpreta “x/100”
            max_borrow_rate: 400,       // 4.00%
            optimal_utilization: 80,    // 80%
        }
    }

    public fun new_interest_rate_config(
        min_borrow_rate: u64,
        optimal_borrow_rate: u64,
        max_borrow_rate: u64,
        optimal_utilization: u64
    ): InterestRateConfig {
        InterestRateConfig {
            min_borrow_rate,
            optimal_borrow_rate,
            max_borrow_rate,
            optimal_utilization
        }
    }

    /// Convierte "hundredth percent" (ej. 200 = 2.00%) a Decimal fraccional (0.02)
    fun hundredth_percent_to_decimal(x: u64): Decimal {
        // 1 hundredth percent = 1 / 10_000
        // Decimal tiene escala 1e9, usamos millionths helper: 0.02 -> 20_000 millionths
        dec::from_millionth((x as u128) * 100)
    }

    /// Devuelve el factor de interés acumulado en `time_delta` segundos (no la tasa anual).
    public fun get_borrow_rate_for_seconds(
        time_delta: u64,
        cfg: &InterestRateConfig,
        total_borrowed: Decimal,
        total_cash_available: u128,
        _reserve_amount: Decimal
    ): Decimal {
        // Utilización = borrowed / (borrowed + cash)
        let cash_dec = dec::from_u128(total_cash_available);
        let denom = dec::add(total_borrowed, cash_dec);
        if (dec::eq(denom, dec::zero())) {
            return dec::zero()
        };

        let util = dec::div(total_borrowed, denom);
        let u_opt = dec::from_percentage((cfg.optimal_utilization as u128));

        let r_min = hundredth_percent_to_decimal(cfg.min_borrow_rate);
        let r_opt = hundredth_percent_to_decimal(cfg.optimal_borrow_rate);
        let r_max = hundredth_percent_to_decimal(cfg.max_borrow_rate);

        // Interpolación piecewise: [0, u_opt] va de r_min -> r_opt, (u_opt,1] va de r_opt -> r_max
        let annual_rate = if (dec::lte(util, u_opt)) {
            let t = dec::div(util, u_opt);
            dec::add(r_min, dec::mul(dec::sub(r_opt, r_min), t))
        } else {
            let one_minus = dec::sub(dec::one(), u_opt);
            if (dec::eq(one_minus, dec::zero())) {
                r_max
            } else {
                let t = dec::div(dec::sub(util, u_opt), one_minus);
                dec::add(r_opt, dec::mul(dec::sub(r_max, r_opt), t))
            }
        };

        // Pasar de tasa anual a factor por `time_delta` segundos.
        let seconds_per_year: u64 = 365 * 24 * 60 * 60;
        let per_second = dec::div(annual_rate, dec::from_u64(seconds_per_year));
        dec::mul(per_second, dec::from_u64(time_delta))
    }

    // getters
    public fun min_borrow_rate(c: &InterestRateConfig): u64 { c.min_borrow_rate }
    public fun optimal_borrow_rate(c: &InterestRateConfig): u64 { c.optimal_borrow_rate }
    public fun max_borrow_rate(c: &InterestRateConfig): u64 { c.max_borrow_rate }
    public fun optimal_utilization(c: &InterestRateConfig): u64 { c.optimal_utilization }
}
