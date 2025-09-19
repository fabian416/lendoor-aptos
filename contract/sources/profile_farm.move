//! A module that is used to record liquidity mining rewards.

module aries::profile_farm {
    use std::option::{Self as option, Option};
    use std::vector;

    use aptos_std::type_info::TypeInfo;
    use aptos_std::math128;

    use aries::reserve_farm::{Self as reserve_farm, Reward as ReserveReward};
    use decimal::decimal::{Self as decimal, Decimal};
    use util_types::map::{Self as map, Map};
    use util_types::iterable_table::{Self as iterable_table, IterableTable};

    friend aries::profile;

    /// When there is no reward entry for a coin type in the profile farm
    const EPROFILE_FARM_REWARD_NOT_FOUND: u64 = 2;

    /// When trying to remove more share than existing
    const EPROFILE_FARM_NEGATIVE_SHARE: u64 = 3;

    /// Struct to support distributing rewards.
    /// Each `ProfileFarm` corresponds to *one* deposit or borrow position.
    struct ProfileFarm has store {
        /// Total shares del perfil para este farming.
        share: u128,
        /// Recompensas del perfil por tipo.
        rewards: IterableTable<TypeInfo, Reward>,
    }

    struct Reward has store, drop {
        /// Recompensa aún no reclamada (Decimal).
        unclaimed_amount: Decimal,
        /// Último reward_per_share observado (snapshot).
        last_reward_per_share: Decimal,
    }

    struct ProfileFarmRaw has copy, drop, store {
        share: u128,
        reward_type: vector<TypeInfo>,
        rewards: vector<RewardRaw>,
    }

    struct RewardRaw has copy, store, drop {
        unclaimed_amount_decimal: u128,
        last_reward_per_share_decimal: u128,
    }

    /// Crea el farm del perfil a partir del snapshot de `reserve_rewards`.
    /// Inicializa `last_reward_per_share` con el valor actual del reserve,
    /// dejando `unclaimed_amount = 0`.
    public fun new(reserve_rewards: &Map<TypeInfo, ReserveReward>): ProfileFarm {
        let pf = ProfileFarm { share: 0, rewards: iterable_table::new() };

        // Iteramos el Map con sus helpers (NO IterableTable aquí).
        let key: Option<TypeInfo> = map::head_key(reserve_rewards);
        let k = key;
        while (option::is_some(&k)) {
            let ti = *option::borrow(&k);
            let (reserve_reward, _, next) = map::borrow_iter(reserve_rewards, &ti);

            let init_rps = reserve_farm::reward_per_share(reserve_reward);
            // Pre-cargamos el reward del perfil con el snapshot.
            iterable_table::add(&mut pf.rewards, ti, new_reward(init_rps));

            k = next;
        };

        pf
    }

    public fun new_reward(init_reward_per_share: Decimal): Reward {
        Reward {
            unclaimed_amount: decimal::zero(),
            last_reward_per_share: init_reward_per_share,
        }
    }

    public fun has_reward(farm: &ProfileFarm, type_info: TypeInfo): bool {
        iterable_table::contains(&farm.rewards, &type_info)
    }

    public fun get_share(profile_farm: &ProfileFarm): u128 {
        profile_farm.share
    }
    
    public fun get_reward_balance(profile_farm: &ProfileFarm, type_info: TypeInfo): Decimal {
        if (!has_reward(profile_farm, type_info)) {
            decimal::zero()
        } else {
            let reward = iterable_table::borrow(&profile_farm.rewards, &type_info);
            reward.unclaimed_amount
        }
    }

    public fun get_reward_detail(
        profile_farm: &ProfileFarm,
        type_info: TypeInfo
    ): (Decimal, Decimal) {
        if (!has_reward(profile_farm, type_info)) {
            (decimal::zero(), decimal::zero())
        } else {
            let reward = iterable_table::borrow(&profile_farm.rewards, &type_info);
            (reward.unclaimed_amount, reward.last_reward_per_share)
        }
    }

    public fun get_claimable_amount(profile_farm: &ProfileFarm, type_info: TypeInfo): u64 {
        decimal::floor_u64(get_reward_balance(profile_farm, type_info))
    }

    /// Sincroniza el farm del perfil con el último estado de `reserve_rewards`.
    /// - Si aparece un tipo nuevo en el reserve, se crea con `last_reward_per_share = 0`
    ///   y se acumula lo correspondiente por el período transcurrido.
    public fun update(
        profile_farm: &mut ProfileFarm,
        reserve_rewards: &Map<TypeInfo, ReserveReward>
    ) {
        let key: Option<TypeInfo> = map::head_key(reserve_rewards);
        let k = key;
        while (option::is_some(&k)) {
            let type_info = *option::borrow(&k);
            let (reserve_reward, _, next) = map::borrow_iter(reserve_rewards, &type_info);
            let current_reward_per_share = reserve_farm::reward_per_share(reserve_reward);

            let reward = iterable_table::borrow_mut_with_default(
                &mut profile_farm.rewards, 
                &type_info,
                new_reward(decimal::zero())
            );

            let diff = decimal::sub(current_reward_per_share, reward.last_reward_per_share);
            let new_unclaimed_amount = decimal::mul_u128(diff, profile_farm.share);

            reward.unclaimed_amount = decimal::add(reward.unclaimed_amount, new_unclaimed_amount);
            reward.last_reward_per_share = current_reward_per_share;

            k = next;
        }
    }

    /// Limpia `unclaimed_amount` y devuelve el monto reclamable (u64).
    public fun claim_reward(
        profile_farm: &mut ProfileFarm,
        reserve_rewards: &Map<TypeInfo, ReserveReward>,
        reward_type: TypeInfo
    ): u64 {
        update(profile_farm, reserve_rewards);
        assert!(has_reward(profile_farm, reward_type), EPROFILE_FARM_REWARD_NOT_FOUND);

        let reward = iterable_table::borrow_mut(&mut profile_farm.rewards, &reward_type);
        let claimed_reward = decimal::floor_u64(reward.unclaimed_amount);
        reward.unclaimed_amount = decimal::sub(reward.unclaimed_amount, decimal::from_u64(claimed_reward));
        claimed_reward
    }

    /// Suma shares y mantiene rewards alineados con el reserve.
    public fun add_share(
        profile_farm: &mut ProfileFarm, 
        reserve_rewards: &Map<TypeInfo, ReserveReward>,
        amount: u128
    ) {
        update(profile_farm, reserve_rewards);
        profile_farm.share = profile_farm.share + amount;
    }

    /// Resta (hasta) `amount` shares. Devuelve lo efectivamente removido.
    public fun try_remove_share(
        profile_farm: &mut ProfileFarm, 
        reserve_rewards: &Map<TypeInfo, ReserveReward>,
        amount: u128
    ): u128 {
        update(profile_farm, reserve_rewards);
        let removed_share = math128::min(amount, profile_farm.share);
        profile_farm.share = profile_farm.share - removed_share;
        removed_share
    }

    public fun get_all_claimable_rewards(profile_farm: &ProfileFarm): Map<TypeInfo, u64> {
        let res = map::new<TypeInfo, u64>();
        aggregate_all_claimable_rewards(profile_farm, &mut res);
        res
    }

    /// Agrega a `claimable_rewards` los montos reclamables por cada reward_type.
    public fun aggregate_all_claimable_rewards(
        profile_farm: &ProfileFarm,
        claimable_rewards: &mut Map<TypeInfo, u64>
    ) {
        let key: Option<TypeInfo> = iterable_table::head_key(&profile_farm.rewards);
        let k = key;
        while (option::is_some(&k)) {
            let reward_type = *option::borrow(&k);

            // monto disponible para reclamar de este tipo
            let reward = iterable_table::borrow(&profile_farm.rewards, &reward_type);
            let reward_amount = decimal::floor_u64(reward.unclaimed_amount);

            if (map::contains(claimable_rewards, &reward_type)) {
                let cur = map::get(claimable_rewards, &reward_type);
                *map::borrow_mut(claimable_rewards, &reward_type) = cur + reward_amount;
            } else {
                map::add(claimable_rewards, reward_type, reward_amount);
            };

            let (_, _, next) = iterable_table::borrow_iter(&profile_farm.rewards, &reward_type);
            k = next;
        };
    }

    public fun profile_farm_raw(profile_farm: &ProfileFarm): ProfileFarmRaw {
        let raw = ProfileFarmRaw {
            share: profile_farm.share,
            reward_type: vector::empty(),
            rewards: vector::empty(),
        };
        let key: Option<TypeInfo> = iterable_table::head_key(&profile_farm.rewards);
        let k = key;
        while (option::is_some(&k)) {
            let reward_type = *option::borrow(&k);
            let (reward, _, next)= iterable_table::borrow_iter(&profile_farm.rewards, &reward_type);

            vector::push_back(&mut raw.reward_type, reward_type);
            vector::push_back(&mut raw.rewards, RewardRaw {
                unclaimed_amount_decimal: decimal::raw(reward.unclaimed_amount),
                last_reward_per_share_decimal: decimal::raw(reward.last_reward_per_share),
            });

            k = next;
        };

        raw
    }

    public fun profile_farm_reward_raw(profile_farm: &ProfileFarm, reward_type: TypeInfo): RewardRaw {
        if (iterable_table::contains(&profile_farm.rewards, &reward_type)) {
            let reward = iterable_table::borrow(&profile_farm.rewards, &reward_type);
            RewardRaw {
                unclaimed_amount_decimal: decimal::raw(reward.unclaimed_amount),
                last_reward_per_share_decimal: decimal::raw(reward.last_reward_per_share),
            }
        } else {
            RewardRaw {
                unclaimed_amount_decimal: 0,
                last_reward_per_share_decimal: 0,
            }
        }
    }

    public(friend) fun accumulate_profile_farm_raw(
        profile_farm: &mut ProfileFarmRaw, 
        reserve_rewards: &Map<TypeInfo, ReserveReward>
    ) {
        let reward_idx = 0;
        let reward_len = vector::length(&profile_farm.reward_type);
        while (reward_idx < reward_len) {
            let reward_type: TypeInfo = *vector::borrow(&profile_farm.reward_type, reward_idx);
            let reward = vector::borrow_mut(&mut profile_farm.rewards, reward_idx);

            if (map::contains(reserve_rewards, &reward_type)) {
                let reserve_reward = map::borrow(reserve_rewards, &reward_type);
                accumulate_profile_reward_raw(
                    reward,
                    profile_farm.share,
                    reserve_farm::reward_per_share(reserve_reward)
                );
            };

            reward_idx = reward_idx + 1;
        };
    }

    public(friend) fun accumulate_profile_reward_raw(
        farm_reward: &mut RewardRaw,
        farm_share: u128,
        current_reward_per_share: Decimal
    ) {
        let diff = decimal::sub(
            current_reward_per_share,
            decimal::from_scaled_val(farm_reward.last_reward_per_share_decimal),
        );
        let new_unclaimed_amount = decimal::mul_u128(diff, farm_share);
        // sumar al acumulado y dejar el last_reward_per_share intacto en Raw
        farm_reward.unclaimed_amount_decimal = decimal::raw(
            decimal::add(
                decimal::from_scaled_val(farm_reward.unclaimed_amount_decimal), 
                new_unclaimed_amount
            )
        );
    }

    public fun unwrap_profile_farm_raw(farm_raw: ProfileFarmRaw): (u128, vector<TypeInfo>, vector<RewardRaw>) {
        let ProfileFarmRaw {share, reward_type, rewards} = farm_raw;
        (share, reward_type, rewards)
    }

    public fun unwrap_profile_reward_raw(reward: RewardRaw): (u128, u128) {
        let RewardRaw { unclaimed_amount_decimal, last_reward_per_share_decimal } = reward;
        (unclaimed_amount_decimal, last_reward_per_share_decimal)
    }
}
