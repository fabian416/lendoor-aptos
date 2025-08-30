// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Interface consumed by RiskManagerUncollat
interface ICLM {
    function creditLimit(address account) external view returns (uint256);
}

/// @title CreditLimitManager
/// @notice On-chain registry of credit lines in asset units (e.g., USDC 6 dec)
contract CreditLimitManager is ICLM {
    address public owner;

    struct Line {
        uint128 limit;       // amount in asset units
        uint64  validUntil;  // timestamp; 0 = no expiration
        bool    kycOk;       // optional: passes KYC/PoP/risk
    }

    mapping(address => Line) public lines;

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event LineSet(address indexed account, uint256 limit, uint64 validUntil, bool kycOk);
    event LineCleared(address indexed account);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    constructor(address _owner) {
        owner = _owner == address(0) ? msg.sender : _owner;
    }

    function setOwner(address n) external onlyOwner {
        require(n != address(0), "owner=0");
        emit OwnerChanged(owner, n);
        owner = n;
    }

    /// @notice sets/updates the credit line of `account`
    function setLine(address account, uint256 limit, uint64 validUntil, bool kycOk)
        public
        onlyOwner
    {
        require(account != address(0), "acct=0");
        lines[account] = Line(uint128(limit), validUntil, kycOk);
        emit LineSet(account, limit, validUntil, kycOk);
    }
    /// @notice clears the line (equivalent to 0 / invalid)
    function clearLine(address account) external onlyOwner {
        delete lines[account];
        emit LineCleared(account);
    }

    /// @inheritdoc ICLM
    /// @dev RiskManagerUncollat will ONLY consume this method.
    function creditLimit(address account) external view returns (uint256) {
        Line memory l = lines[account];
        if (!l.kycOk) return 0;
        if (l.validUntil != 0 && block.timestamp > l.validUntil) return 0;
        return uint256(l.limit);
    }

    /// Convenience: batch setters
    struct LineUpdate { address account; uint256 limit; uint64 validUntil; bool kycOk; }
    
    function batchSet(LineUpdate[] calldata ups) external onlyOwner {
        for (uint256 i; i < ups.length; ++i) {
            setLine(ups[i].account, ups[i].limit, ups[i].validUntil, ups[i].kycOk);
        }
    }
}