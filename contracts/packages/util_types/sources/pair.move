module util_types::pair {
    struct Pair<A: copy + drop + store, B: copy + drop + store> has copy, drop, store {
        first: A,
        second: B,
    }

    public fun new<A: copy + drop + store, B: copy + drop + store>(a: A, b: B): Pair<A, B> {
        Pair { first: a, second: b }
    }

    public fun first<A: copy + drop + store, B: copy + drop + store>(p: &Pair<A,B>): A { p.first }
    public fun second<A: copy + drop + store, B: copy + drop + store>(p: &Pair<A,B>): B { p.second }
}
