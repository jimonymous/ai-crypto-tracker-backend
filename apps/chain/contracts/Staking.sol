// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Staking is ReentrancyGuard {
    IERC20 public immutable stakingToken;

    mapping(address => uint256) public balances;
    uint256 public totalStaked;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);

    constructor(address token) {
        require(token != address(0), "token required");
        stakingToken = IERC20(token);
    }

    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "amount > 0");
        require(stakingToken.transferFrom(msg.sender, address(this), amount), "transfer failed");
        balances[msg.sender] += amount;
        totalStaked += amount;
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant {
        require(amount > 0, "amount > 0");
        require(balances[msg.sender] >= amount, "insufficient stake");
        balances[msg.sender] -= amount;
        totalStaked -= amount;
        require(stakingToken.transfer(msg.sender, amount), "transfer failed");
        emit Unstaked(msg.sender, amount);
    }
}
