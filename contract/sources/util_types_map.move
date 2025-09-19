module util_types::map {
    use aptos_std::simple_map as sm;               // OJO: es aptos_std, no std
    use std::option::{Self as option, Option};     // Option (mayúscula) en tipos
    use std::vector;

    // Mapa delgado sobre SimpleMap, sin exigir 'drop' en V (así acepta Coin<T>, etc).
    struct Map<K: copy + drop + store, V: store> has store, drop {
        inner: sm::SimpleMap<K, V>
    }

    /// Crea un Map vacío
    public fun new<K: copy + drop + store, V: store>(): Map<K, V> {
        Map { inner: sm::new<K, V>() }
    }

    /// Inserta (falla si ya existe)
    public fun add<K: copy + drop + store, V: store>(m: &mut Map<K, V>, k: K, v: V) {
        sm::add(&mut m.inner, k, v)
    }

    /// Inserta o actualiza
    public fun upsert<K: copy + drop + store, V: drop + store>(
        m: &mut Map<K, V>,
        k: K,
        v: V
    ) {
        if (contains(m, &k)) {
            // Reemplazar requiere dropear el viejo V → por eso pedimos V: drop
            *borrow_mut(m, &k) = v;
        } else {
            add(m, k, v);
        }
    }


    /// Elimina y devuelve el valor
    public fun remove<K: copy + drop + store, V: store>(
        m: &mut Map<K, V>,
        k: &K
    ): V {
        let (_k, v) = sm::remove(&mut m.inner, k);
        v
    }

    /// ¿Existe la clave?
    public fun contains<K: copy + drop + store, V: store>(m: &Map<K, V>, k: &K): bool {
        sm::contains_key(&m.inner, k)
    }

    /// Obtiene (para V copiables como u64)
    public fun get<K: copy + drop + store, V: copy + store>(m: &Map<K, V>, k: &K): V {
        *sm::borrow(&m.inner, k)
    }

    /// Borrow inmutable
    public fun borrow<K: copy + drop + store, V: store>(m: &Map<K, V>, k: &K): &V {
        sm::borrow(&m.inner, k)
    }

    /// Borrow mutable
    public fun borrow_mut<K: copy + drop + store, V: store>(m: &mut Map<K, V>, k: &K): &mut V {
        sm::borrow_mut(&mut m.inner, k)
    }

    /// Cantidad de pares
    public fun length<K: copy + drop + store, V: store>(m: &Map<K, V>): u64 {
        vector::length(&sm::keys(&m.inner))
    }

    /// Devuelve todas las claves (copia el vector devuelto por SimpleMap)
    public fun keys<K: copy + drop + store, V: store>(m: &Map<K, V>): vector<K> {
        sm::keys(&m.inner)
    }

    /// Primera clave o None
    public fun head_key<K: copy + drop + store, V: store>(m: &Map<K, V>): Option<K> {
        let ks = sm::keys(&m.inner);
        if (vector::length(&ks) == 0) option::none<K>()
        else option::some(*vector::borrow(&ks, 0))
    }

    /// Iterador “a mano” sobre SimpleMap: dado k, devuelve (&V, _, next_key)
    /// Nota: el segundo valor es un placeholder (u64=0) para ser compatible con firmas tipo IterableTable.
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

    /// Para mapas con V copiables (u64, etc): devuelve (keys, values)
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

    /// Busca la posición de k dentro del vector de claves
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
