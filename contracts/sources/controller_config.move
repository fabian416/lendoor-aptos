//! Controller/Market-wide config storage & access handles
module lendoor::controller_config {
    use std::signer;
    use aptos_framework::object::{Self, ObjectCore};

    friend lendoor::controller;

    // `ControllerConfig` is not set.
    const ECONTROLLER_NO_CONFIG: u64 = 1;
    // Admin mismatch.
    const ECONTROLLER_ADMIN_MISMATCH: u64 = 2;
    // Only the package owner (object owner or @lendoor itself) may perform this action.
    const EONLY_PACKAGE_OWNER: u64 = 3;
    // When init_config is called with an admin different from the caller.
    const EADMIN_MUST_EQUAL_CALLER: u64 = 4;

    // Global controller config.
    // We store who is the admin, and which on-chain address acts as "host"
    // (where singleton resources like Reserves will live).
    struct ControllerConfig has key {
        admin: address,
        host: address,
    }

    // True if `sender` controls the published package address `@lendoor`.
    // Works both for packages published under an Object and under a plain account.
    public fun is_package_owner(sender: address): bool {
        if (object::is_object(@lendoor)) {
            let core = object::address_to_object<ObjectCore>(@lendoor);
            object::is_owner(core, sender)
        } else {
            sender == @lendoor
        }
    }

    // One-time initialization. Must be called by the package owner.
    // Sets the runtime `admin` and the `host` address where singletons will be stored.
    //
    // IMPORTANT:
    // - We require `admin == signer::address_of(account)` to make the config discoverable
    //   under a deterministic address (the caller/admin address). This avoids relying on
    //   @lendoor when the package is published under an Object address.
    public entry fun init_config(account: &signer, admin: address) acquires ControllerConfig {
        assert!(is_package_owner(signer::address_of(account)), EONLY_PACKAGE_OWNER);
        assert!(admin == signer::address_of(account), EADMIN_MUST_EQUAL_CALLER);

        let where_ = signer::address_of(account);
        if (!exists<ControllerConfig>(where_)) {
            move_to(account, ControllerConfig { admin, host: where_ });
        } else {
            // Already exists: validate that the admin matches the caller,
            // so we don't break the previous configuration.
            let cfg = borrow_global<ControllerConfig>(where_);
            assert!(cfg.admin == admin, ECONTROLLER_ADMIN_MISMATCH);
        }
    }

    public(friend) entry fun init_if_needed(account: &signer, admin: address) acquires ControllerConfig {
        // Reuse the idempotent logic of init_config.
        init_config(account, admin);
    }

    #[view]
    // Returns true iff a ControllerConfig resource exists at `addr`.
    public fun config_present_at(addr: address): bool {
        exists<ControllerConfig>(addr)
    }

    #[view]
    // Returns true if config exists under @lendoor (account-published setups).
    public fun config_present(): bool {
        exists<ControllerConfig>(@lendoor)
    }

    // ==== Accessors (do not return references) ====

    #[view]
    public fun admin_addr(): address acquires ControllerConfig {
        if (exists<ControllerConfig>(@lendoor)) {
            let cfg = borrow_global<ControllerConfig>(@lendoor);
            cfg.admin
        } else {
            abort ECONTROLLER_NO_CONFIG
        }
    }

    #[view]
    public fun host_addr(): address acquires ControllerConfig {
        if (exists<ControllerConfig>(@lendoor)) {
            let cfg = borrow_global<ControllerConfig>(@lendoor);
            cfg.host
        } else {
            abort ECONTROLLER_NO_CONFIG
        }
    }

    // Admin check that other modules should call.
    public fun assert_is_admin(addr: address) acquires ControllerConfig {
        assert!(addr == admin_addr(), ECONTROLLER_ADMIN_MISMATCH);
    }
}