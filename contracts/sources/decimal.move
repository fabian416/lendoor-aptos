module decimal::decimal {
    use aptos_std::math128;
    
    /// Decimal fijo con escala 1e9 (9 decimales).
    /// Es simple pero suficiente para lo que usa tu código.
    struct Decimal has copy, drop, store { v: u128 }

    const SCALE: u128 = 1_000_000_000;

    // constructores / conversores
    public fun zero(): Decimal { Decimal { v: 0 } }
    public fun one(): Decimal { from_u64(1) }
    public fun from_u64(x: u64): Decimal { Decimal { v: (x as u128) * SCALE } }
    public fun from_percentage(pct: u128): Decimal { Decimal { v: pct * SCALE / 100 } }            // 100 => 1.0
    public fun from_bips(bips: u128): Decimal { Decimal { v: bips * SCALE / 10_000 } }             // 10_000 => 1.0
    public fun from_millionth(mu: u128): Decimal { Decimal { v: mu * SCALE / 1_000_000 } }         // 1_000_000 => 1.0
    public fun from_scaled_val(raw: u128): Decimal { Decimal { v: raw } }
    public fun raw(d: Decimal): u128 { d.v }
    public fun as_u64(d: Decimal): u64 { (d.v / SCALE) as u64 }
    public fun floor_u64(d: Decimal): u64 { as_u64(d) }
    public fun ceil_u64(d: Decimal): u64 {
        let q = d.v / SCALE;
        if (d.v % SCALE == 0) (q as u64) else ((q + 1) as u64)
    }

    // aritmética
    public fun add(a: Decimal, b: Decimal): Decimal { Decimal { v: a.v + b.v } }
    public fun sub(a: Decimal, b: Decimal): Decimal { Decimal { v: a.v - b.v } }
    public fun mul(a: Decimal, b: Decimal): Decimal { Decimal { v: (a.v * b.v) / SCALE } }
    public fun div(a: Decimal, b: Decimal): Decimal { Decimal { v: (a.v * SCALE) / b.v } }
    public fun mul_u64(a: Decimal, x: u64): Decimal { Decimal { v: a.v * (x as u128) } }
    public fun mul_u128(a: Decimal, x: u128): Decimal { Decimal { v: a.v * x } }

    // comparadores / utilidades
    public fun min(a: Decimal, b: Decimal): Decimal { if (a.v <= b.v) a else b }
    public fun max(a: Decimal, b: Decimal): Decimal { if (a.v >= b.v) a else b }
    public fun lte(a: Decimal, b: Decimal): bool { a.v <= b.v }
    public fun gte(a: Decimal, b: Decimal): bool { a.v >= b.v }
    public fun lt(a: Decimal, b: Decimal): bool { a.v < b.v }
    public fun gt(a: Decimal, b: Decimal): bool { a.v > b.v }
    public fun eq(a: Decimal, b: Decimal): bool { a.v == b.v }

    public fun from_u128(x: u128): Decimal {
        Decimal { v: x * SCALE }
    }

    public fun as_u128(d: Decimal): u128 {
        d.v / SCALE
    }

    /// (a * b) / c en espacio Decimal, evitando overflow
    public fun mul_div(a: Decimal, b: Decimal, c: Decimal): Decimal {
        // Como R = (a.v/S)*(b.v/S)/(c.v/S)  => result.v = (a.v * b.v) / c.v
        Decimal { v: math128::mul_div(a.v, b.v, c.v) }
    }
}
