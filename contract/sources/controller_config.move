//! Controller/Market-wide config storage & access handles
module lendoor::controller_config {
    use std::signer;

    friend lendoor::controller;

    /// `ControllerConfig` is not set.
    const ECONTROLLER_NO_CONFIG: u64 = 1;

    /// Reserve admin mismatch.
    const ECONTROLLER_ADMIN_MISMATCH: u64 = 2;

    /// When the account is not Aries Markets Account.
    const ERESERVE_NOT_ARIES: u64 = 3;

    struct ControllerConfig has key {
        admin: address,
    }

    public(friend) fun init_config(account: &signer, admin: address) {
        assert!(signer::address_of(account) == @lendoor, ERESERVE_NOT_ARIES);
        move_to(
          account, 
          ControllerConfig{
            admin,
          }
        );
    }

    fun assert_config_present() {
        assert!(exists<ControllerConfig>(@lendoor), ECONTROLLER_NO_CONFIG);
    }

    #[test_only]
    public fun config_present(addr: address): bool {
        exists<ControllerConfig>(addr)
    }

    public fun is_admin(addr: address): bool acquires ControllerConfig {
        assert_config_present();
        let config = borrow_global<ControllerConfig>(@lendoor);
        return config.admin == addr
    }

    public fun assert_is_admin(addr: address) acquires ControllerConfig {
        assert!(is_admin(addr), ECONTROLLER_ADMIN_MISMATCH);
    }
}