module lendoor::junior_vault {
    use std::signer;
    use aptos_framework::coin;

    /// Share token del junior (sUSD3)
    struct S<phantom X> has store, drop, key {}  // X = LP<Coin0>

    /// Recurso global por (X) para contabilizar supply/shares/etc.
    struct JVault<X> has key {
        admin: address,
        // si quieres, registra ratios/locks/etc.
    }

    /// init una vez por activo
    public entry fun init_for<X>(admin: &signer) { /* move_to JVault<X> y coin::register<S<X>> para @lendoor */ }

    /// Depositar USD3 (o sea, LP<Coin0]) y recibir sUSD3
    public entry fun deposit<X>(
        user: &signer,
        amount_usd3: u64
    ) acquires JVault<X> {
        // transferir USD3 (LP<Coin0>) del usuario a @lendoor (o addr del módulo)
        // shares sUSD3 = lógica 1:1 al inicio; luego usa el ratio estilo ERC-4626
        // coin::mint<S<X>>(user_addr, shares)
    }

    /// Retirar: quemar sUSD3 y devolver USD3
    public entry fun withdraw<X>(
        user: &signer,
        shares: u64
    ) acquires JVault<X> {
        // coin::burn_from<S<X>>(user, shares)
        // calcular USD3 a devolver y coin::transfer<LP<Coin0>>(user_addr, amount_usd3)
    }

    /// (Opcional) locks/cooldowns/whitelists
}