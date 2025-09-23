module util_types::map {
    use aptos_std::simple_map as sm;               // NOTE: it's aptos_std, not std
    use std::option::{Self as option, Option};     // Option (uppercase) in types
    use std::vector;

    // Thin map over SimpleMap, without requiring 'drop' on V (so it accepts Coin<T>, etc).
    struct Map<K: copy + drop + store, V: store> has store, drop {
        inner: sm::SimpleMap<K, V>
    }

    /// Creates an empty Map
    public fun new<K: copy + drop + store, V: store>(): Map<K, V> {
        Map { inner: sm::new<K, V>() }
    }

    /// Inserts (fails if it already exists)
    public fun add<K: copy + drop + store, V: store>(m: &mut Map<K, V>, k: K, v: V) {
        sm::add(&mut m.inner, k, v)
    }

    /// Inserts or updates
    public fun upsert<K: copy + drop + store, V: drop + store>(
        m: &mut Map<K, V>,
        k: K,
        v: V
    ) {
        if (contains(m, &k)) {
            // Replacing requires dropping the old V → that's why we ask for V: drop
            *borrow_mut(m, &k) = v;
        } else {
            add(m, k, v);
        }
    }


    /// Removes and returns the value
    public fun remove<K: copy + drop + store, V: store>(
        m: &mut Map<K, V>,
        k: &K
    ): V {
        let (_k, v) = sm::remove(&mut m.inner, k);
        v
    }

    /// Does the key exist?
    public fun contains<K: copy + drop + store, V: store>(m: &Map<K, V>, k: &K): bool {
        sm::contains_key(&m.inner, k)
    }

    /// Gets (for copyable V like u64)
    public fun get<K: copy + drop + store, V: copy + store>(m: &Map<K, V>, k: &K): V {
        *sm::borrow(&m.inner, k)
    }

    /// Immutable borrow
    public fun borrow<K: copy + drop + store, V: store>(m: &Map<K, V>, k: &K): &V {
        sm::borrow(&m.inner, k)
    }

    /// Mutable borrow
    public fun borrow_mut<K: copy + drop + store, V: store>(m: &mut Map<K, V>, k: &K): &mut V {
        sm::borrow_mut(&mut m.inner, k)
    }

    /// Number of pairs
    public fun length<K: copy + drop + store, V: store>(m: &Map<K, V>): u64 {
        vector::length(&sm::keys(&m.inner))
    }

    /// Returns all keys (copies the vector returned by SimpleMap)
    public fun keys<K: copy + drop + store, V: store>(m: &Map<K, V>): vector<K> {
        sm::keys(&m.inner)
    }

    /// First key or None
    public fun head_key<K: copy + drop + store, V: store>(m: &Map<K, V>): Option<K> {
        let ks = sm::keys(&m.inner);
        if (vector::length(&ks) == 0) option::none<K>()
        else option::some(*vector::borrow(&ks, 0))
    }

    /// "Manual" iterator over SimpleMap: given k, returns (&V, _, next_key)
    /// Note: the second value is a placeholder (u64=0) to be compatible with IterableTable type signatures.
    public fun borrow_iter<K: copy + drop + store, V: store>(
        m: &Map<K, V>,
        k: &K
    ): (&V, u64, Option<K>) {
        let v = sm::borrow(&m.inner, k);
        let ks = sm::keys(&m.inner);
        let i = index_of(&ks, k);
        let n = vector::length(&ks);
        let next =
            if (i + 1 < n) option::some(*vector::borrow(&ks, i + 1))
            else option::none<K>();
        (v, 0, next)
    }

    /// For maps with copyable V (u64, etc): returns (keys, values)
    public fun to_vec_pair<K: copy + drop + store, V: copy + store>(
        m: &Map<K, V>
    ): (vector<K>, vector<V>) {
        let ks = sm::keys(&m.inner);
        let n = vector::length(&ks);
        let vs = vector::empty<V>();
        let i = 0;
        while (i < n) {
            let k = *vector::borrow(&ks, i);
            vector::push_back(&mut vs, *sm::borrow(&m.inner, &k));
            i = i + 1;
        };
        (ks, vs)
}

    /// Searches for the position of k within the vector of keys
    fun index_of<K: copy + drop + store>(ks: &vector<K>, k: &K): u64 {
        let i = 0;
        let n = vector::length(ks);
        while (i < n) {
            if (*vector::borrow(ks, i) == *k) return i;
            i = i + 1;
        };
        n
    }
}
