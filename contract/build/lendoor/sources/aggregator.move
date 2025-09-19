module hippo_aggregator::aggregator {
    use std::option::{Self, Option};
    use aptos_framework::coin::{Self, Coin};

    /// Stub mínimo: no hace swap real.
    /// Retorna:
    ///  - option_coin1 = Some(input_coin) para que el caller lo “deposite” como polvo
    ///  - option_coin2 = None
    ///  - option_coin3 = None
    ///  - output_coin  = Coin<OutCoin> cero
    public fun swap_direct<
        InCoin, Y, Z, OutCoin, E1, E2, E3
    >(
        _num_steps: u8,
        _first_dex_type: u8,
        _first_pool_type: u64,
        _first_is_x_to_y: bool,
        _second_dex_type: u8,
        _second_pool_type: u64,
        _second_is_x_to_y: bool,
        _third_dex_type: u8,
        _third_pool_type: u64,
        _third_is_x_to_y: bool,
        input_coin: Coin<InCoin>
    ): (Option<Coin<InCoin>>, Option<Coin<Y>>, Option<Coin<Z>>, Coin<OutCoin>) {
        (
            option::some(input_coin),
            option::none(),
            option::none(),
            coin::zero<OutCoin>()
        )
    }
}
