// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICLM { function creditLimit(address) external view returns (uint256); }

contract CreditScoreCLM is ICLM {
    address public owner;
    mapping(address => uint8) public scoreOf;          // 0..255
    uint256[256] public limitForScore;                 // límite por score (asset units)

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event ScoreSet(address indexed account, uint8 score);
    event LimitsBatchSet(uint256 count);

    modifier onlyOwner(){ require(msg.sender==owner,"not owner"); _; }
    constructor(address _owner){ owner = _owner==address(0)? msg.sender:_owner; }

    function setOwner(address n) external onlyOwner { require(n!=address(0)); emit OwnerChanged(owner,n); owner=n; }

    function setScore(address account, uint8 s) external onlyOwner {
        require(account!=address(0), "acct=0");
        scoreOf[account] = s;
        emit ScoreSet(account, s);
    }

    function batchSetLimits(uint8[] calldata scores, uint256[] calldata limits) external onlyOwner {
        require(scores.length==limits.length, "len");
        for (uint256 i; i<scores.length; ++i) { limitForScore[scores[i]] = limits[i]; }
        emit LimitsBatchSet(scores.length);
    }

    function creditLimit(address account) external view returns (uint256) {
        return limitForScore[ scoreOf[account] ];
    }
}