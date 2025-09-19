//! A module that is used to record liquidity mining rewards.

module aries::reserve_farm {
    use std::option::{Self as option, Option};
    use std::vector;

    use aptos_std::type_info::TypeInfo;
    use aptos_std::math128;

    // FIX: importar el módulo, no `Self`
    use aptos_framework::timestamp;

    use util_types::iterable_table::{Self as iterable_table, IterableTable};
    use util_types::map::{Self as map, Map};
    use decimal::decimal::{Self as decimal, Decimal};

    friend aries::reserve;

    const ERESERVE_FARM_REWARD_NOT_FOUND: u64 = 1;
    const ERESERVE_FARM_NEGATIVE_REWARD_BALANCE: u64 = 2;
    const ERESERVE_FARM_NEGATIVE_SHARE: u64 = 3;

    const SECONDS_PER_DAY: u128 = 24 * 60 * 60;

    /// Struct to support distributing rewards.
    struct ReserveFarm has store {
        /// Last timestamp that the data is updated.
        timestamp: u64,
        /// The total number of shares that is in the farm.
        share: u128,
        /// Rewards distribuidas por tipo (TypeInfo).
        rewards: IterableTable<TypeInfo, Reward>,
    }

    struct ReserveFarmRaw has copy, drop, store {
        timestamp: u64,
        share: u128,
        reward_types: vector<TypeInfo>,
        rewards: vector<RewardRaw>,
    }

    struct RewardRaw has copy, drop, store {
        reward_per_day: u128,
        remaining_reward: u128,
        reward_per_share_decimal: u128,
    }

    struct Reward has copy, store, drop {
        reward_config: RewardConfig,
        /// The total remaining reward that is to be distributed.
        remaining_reward: u128,
        /// The reward per share (monótonamente creciente).
        reward_per_share: Decimal,
    }

    struct RewardConfig has store, copy, drop {
        /// The number of reward tokens to be distributed per day.
        reward_per_day: u128
    }

    public fun new(): ReserveFarm {
        ReserveFarm {
            timestamp: timestamp::now_seconds(),
            share: 0,
            rewards: iterable_table::new()
        }
    }

    public fun self_update(farm: &mut ReserveFarm) {
        let time_diff = get_time_diff(farm);

        // 1) Colecciono las keys para no mantener un borrow activo mientras mutamos
        let keys = vector::empty<TypeInfo>();
        let key: Option<TypeInfo> = iterable_table::head_key(&farm.rewards); // <-- tipado explícito
        let k = key;
        while (option::is_some(&k)) {
            let ti = *option::borrow(&k);
            let (_, _, next) = iterable_table::borrow_iter(&farm.rewards, &ti);
            vector::push_back(&mut keys, ti);
            k = next;
        };

        // 2) Ahora sí, mutamos cada reward por clave
        let i = 0;
        let n = vector::length(&keys);
        while (i < n) {
            let ti = *vector::borrow(&keys, i);
            let reward = iterable_table::borrow_mut(&mut farm.rewards, &ti);
            update_reward(reward, time_diff, farm.share);
            i = i + 1;
        };

        farm.timestamp = timestamp::now_seconds();
    }

    fun get_time_diff(farm: &ReserveFarm): u64 {
        let current_ts = timestamp::now_seconds();
        assert!(current_ts >= farm.timestamp, 0);
        current_ts - farm.timestamp
    }

    public fun add_share(farm: &mut ReserveFarm, amount: u128) {
        self_update(farm);
        farm.share = farm.share + amount;
    }

    public fun remove_share(farm: &mut ReserveFarm, amount: u128) {
        self_update(farm);
        assert!(farm.share >= amount, ERESERVE_FARM_NEGATIVE_SHARE);
        farm.share = farm.share - amount;
    }

    public fun add_reward(farm: &mut ReserveFarm, type_info: TypeInfo, amount: u128) {
        self_update(farm);
        let time_diff = get_time_diff(farm);
        let reward = iterable_table::borrow_mut_with_default(
            &mut farm.rewards,
            &type_info,
            new_reward()
        );
        update_reward(reward, time_diff, farm.share);
        reward.remaining_reward = reward.remaining_reward + amount;
    }

    public fun has_reward(farm: &ReserveFarm, reward_type: TypeInfo): bool {
        iterable_table::contains(&farm.rewards, &reward_type)
    }

    public fun borrow_reward(farm: &ReserveFarm, reward_type: &TypeInfo): &Reward {
        assert!(has_reward(farm, *reward_type), ERESERVE_FARM_REWARD_NOT_FOUND);
        iterable_table::borrow(&farm.rewards, reward_type)
    }

    fun borrow_reward_mut(farm: &mut ReserveFarm, reward_type: &TypeInfo): &mut Reward {
        assert!(has_reward(farm, *reward_type), ERESERVE_FARM_REWARD_NOT_FOUND);
        iterable_table::borrow_mut(&mut farm.rewards, reward_type)
    }

    public fun remove_reward(farm: &mut ReserveFarm, type_info: TypeInfo, amount: u128) {
        self_update(farm);
        let time_diff = get_time_diff(farm);
        let share = get_share(farm);
        let reward = borrow_reward_mut(farm, &type_info);
        update_reward(reward, time_diff, share);
        assert!(reward.remaining_reward >= amount, ERESERVE_FARM_NEGATIVE_REWARD_BALANCE);
        reward.remaining_reward = reward.remaining_reward - amount;
    }

    public fun update_reward_config(
        farm: &mut ReserveFarm,
        type_info: TypeInfo,
        new_config: RewardConfig
    ) {
        self_update(farm);
        let reward = borrow_reward_mut(farm, &type_info);
        reward.reward_config = new_config;
    }

    public fun get_share(farm: &ReserveFarm): u128 {
        farm.share
    }

    public fun get_timestamp(farm: &ReserveFarm): u64 {
        farm.timestamp
    }

    // FIX: antes devolvía vector, ahora devuelve un Map con los valores *ya actualizados*.
    public fun get_rewards(farm: &mut ReserveFarm): Map<TypeInfo, Reward> {
        self_update(farm);
        let res = map::new<TypeInfo, Reward>();
        let keys = rewards_keys(&farm.rewards);
        let i = 0;
        let n = vector::length(&keys);
        while (i < n) {
            let ti = *vector::borrow(&keys, i);
            let r = *iterable_table::borrow(&farm.rewards, &ti);
            map::add(&mut res, ti, r);
            i = i + 1;
        };
        res
    }

    public fun get_reward_remaining(farm: &ReserveFarm, type_info: TypeInfo): u128 {
        let reward = borrow_reward(farm, &type_info);
        reward.remaining_reward
    }

    public fun get_reward_per_day(farm: &ReserveFarm, type_info: TypeInfo): u128 {
        let reward = borrow_reward(farm, &type_info);
        reward.reward_config.reward_per_day
    }

    public fun get_reward_per_share(farm: &ReserveFarm, type_info: TypeInfo): Decimal {
        let reward = borrow_reward(farm, &type_info);
        reward.reward_per_share
    }

    public fun new_reward(): Reward {
        Reward {
            reward_config: new_reward_config(0),
            remaining_reward: 0,
            reward_per_share: decimal::zero(),
        }
    }

    public fun new_reward_config(reward_per_day: u128): RewardConfig {
        RewardConfig { reward_per_day }
    }

    fun update_reward(reward: &mut Reward, time_diff: u64, share: u128) {
        if (time_diff == 0 || share == 0) { return };

        let acquired_reward_amount = math128::min(
            reward.reward_config.reward_per_day * (time_diff as u128) / SECONDS_PER_DAY,
            reward.remaining_reward
        );
        let reward_per_share_diff = decimal::div(
            decimal::from_u128(acquired_reward_amount),
            decimal::from_u128(share)
        );

        reward.remaining_reward = reward.remaining_reward - acquired_reward_amount;
        reward.reward_per_share = decimal::add(reward.reward_per_share, reward_per_share_diff);
    }

    public fun reward_per_share(reward: &Reward): Decimal { reward.reward_per_share }
    public fun remaining_reward(reward: &Reward): u128 { reward.remaining_reward }
    public fun reward_per_day(reward: &Reward): u128 { reward.reward_config.reward_per_day }

    // Devuelve un "snapshot" actualizado como Map<TypeInfo, Reward>
    public(friend) fun get_latest_reserve_farm_view(farm: &ReserveFarm): Map<TypeInfo, Reward> {
        let latest = map::new<TypeInfo, Reward>();

        // 1) recolectar claves
        let keys = rewards_keys(&farm.rewards);

        // 2) congelar las recompensas “al último estado” en 'latest'
        let i = 0;
        let n = vector::length(&keys);
        let time_diff = get_time_diff(farm);
        while (i < n) {
            let ti = *vector::borrow(&keys, i);
            let r = *iterable_table::borrow(&farm.rewards, &ti);
            update_reward(&mut r, time_diff, farm.share);
            map::add(&mut latest, ti, r);
            i = i + 1;
        };

        latest
    }


    public(friend) fun get_latest_reserve_reward_view(
        farm: &ReserveFarm,
        reward_type: TypeInfo
    ): Reward {
        assert!(has_reward(farm, reward_type), ERESERVE_FARM_REWARD_NOT_FOUND);

        let time_diff = get_time_diff(farm);
        let reward = *iterable_table::borrow(&farm.rewards, &reward_type);
        update_reward(&mut reward, time_diff, farm.share);
        reward
    }

    public fun reserve_farm_raw(farm: &ReserveFarm): ReserveFarmRaw {
        let latest = get_latest_reserve_farm_view(farm);
        let (reward_types, rewards) = map::to_vec_pair(&latest);

        // FIX: Move no tiene `vector::map`, lo hacemos a mano
        let rewards_raw = vector::empty<RewardRaw>();
        let i = 0;
        let n = vector::length(&rewards);
        while (i < n) {
            let r = *vector::borrow(&rewards, i);
            vector::push_back(
                &mut rewards_raw,
                RewardRaw {
                    reward_per_day: reward_per_day(&r),
                    remaining_reward: remaining_reward(&r),
                    reward_per_share_decimal: decimal::raw(reward_per_share(&r)),
                }
            );
            i = i + 1;
        };

        ReserveFarmRaw {
            timestamp: farm.timestamp,
            share: farm.share,
            reward_types,
            rewards: rewards_raw,
        }
    }

    public fun unwrap_reserve_farm_raw(farm: ReserveFarmRaw): (u64, u128, vector<TypeInfo>, vector<RewardRaw>) {
        let ReserveFarmRaw {timestamp, share, reward_types, rewards} = farm;
        (timestamp, share, reward_types, rewards)
    }

    public fun unwrap_reserve_reward_raw(reward: RewardRaw): (u128, u128, u128) {
        let RewardRaw {reward_per_share_decimal, remaining_reward, reward_per_day} = reward;
        (reward_per_share_decimal, remaining_reward, reward_per_day)
    }

    // Recolecta las keys del IterableTable para iterar sin mantener borrows activos.
    fun rewards_keys(rewards: &IterableTable<TypeInfo, Reward>): vector<TypeInfo> {
        let out = vector::empty<TypeInfo>();
        let key: Option<TypeInfo> = iterable_table::head_key(rewards);
        let k = key;
        while (option::is_some(&k)) {
            let ti = *option::borrow(&k);
            let (_, _, next) = iterable_table::borrow_iter(rewards, &ti);
            vector::push_back(&mut out, ti);
            k = next;
        };
        out
    }
}
