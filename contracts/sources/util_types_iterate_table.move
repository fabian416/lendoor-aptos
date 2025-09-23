module util_types::iterable_table {
    use aptos_std::simple_map::{Self as sm, SimpleMap};
    use std::option::{Self as option, Option};
    use std::vector;

    struct IterableTable<K: copy + drop + store, V: store> has store {
        inner: SimpleMap<K, V>
    }

    public fun new<K: copy + drop + store, V: store>(): IterableTable<K, V> {
        IterableTable { inner: sm::new<K, V>() }
    }

    // KEY by reference (consistency with the rest)
    public fun contains<K: copy + drop + store, V: store>(t: &IterableTable<K, V>, k: &K): bool {
        sm::contains_key(&t.inner, k)
    }

    public fun add<K: copy + drop + store, V: store>(t: &mut IterableTable<K, V>, k: K, v: V) {
        sm::add(&mut t.inner, k, v)
    }

    // remove from SimpleMap returns (K, V). We destructure.
    // We ask for drop in V to release correctly.
    public fun remove<K: copy + drop + store, V: drop + store>(t: &mut IterableTable<K, V>, k: &K) {
        let (_removed_k, _removed_v) = sm::remove(&mut t.inner, k);
        // _removed_v falls off the stack (has drop)
    }

    public fun borrow<K: copy + drop + store, V: store>(t: &IterableTable<K, V>, k: &K): &V {
        sm::borrow(&t.inner, k)
    }

    public fun borrow_mut<K: copy + drop + store, V: store>(t: &mut IterableTable<K, V>, k: &K): &mut V {
        sm::borrow_mut(&mut t.inner, k)
    }

    // does not ask for drop: the default moves inside if it does not exist
    public fun borrow_mut_with_default<K: copy + drop + store, V: drop + store>(
        t: &mut IterableTable<K, V>, k: &K, default: V
    ): &mut V
    {
        if (sm::contains_key(&t.inner, k)) {
            sm::borrow_mut(&mut t.inner, k)
        } else {
            let kk = *k; // we need K by value for add
            sm::add(&mut t.inner, kk, default);
            sm::borrow_mut(&mut t.inner, k)
        }
    }

    public fun length<K: copy + drop + store, V: store>(t: &IterableTable<K, V>): u64 {
        vector::length(&sm::keys(&t.inner))
    }

    public fun head_key<K: copy + drop + store, V: store>(t: &IterableTable<K, V>): Option<K> {
        let ks = sm::keys(&t.inner);
        if (vector::length(&ks) == 0) option::none<K>() else option::some(*vector::borrow(&ks, 0))
    }

    /// "Manual" iterator over SimpleMap: given k, returns (&V, _, next_key)
    /// The intermediate u64 is a placeholder (0) for compatibility with other signatures.
    public fun borrow_iter<K: copy + drop + store, V: store>(
        t: &IterableTable<K, V>, k: &K
    ): (&V, u64, Option<K>) {
        let v = sm::borrow(&t.inner, k);
        let ks = sm::keys(&t.inner);
        let i = index_of(&ks, k);
        let n = vector::length(&ks);
        let next = if ((i + 1) < n) {
            option::some(*vector::borrow(&ks, i + 1))
        } else {
            option::none<K>()
        };
        (v, 0, next)
    }

    fun index_of<K: copy + drop + store>(ks: &vector<K>, key: &K): u64 {
        let i = 0;
        let n = vector::length(ks);
        while (i < n) {
            if (*vector::borrow(ks, i) == *key) return i;
            i = i + 1;
        };
        n // if it is not there, we return n (so that there is no "next")
    }
}
