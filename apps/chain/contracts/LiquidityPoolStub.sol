// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

contract LiquidityPoolStub is ReentrancyGuard {
    IERC20 public immutable token;
    IERC20Permit public immutable tokenPermit;
    uint256 public totalLiquidity;

    mapping(address => uint256) public shares;

    event Deposit(address indexed provider, uint256 amount);
    event Withdraw(address indexed provider, uint256 amount);

    constructor(address token_) {
        require(token_ != address(0), "token required");
        token = IERC20(token_);
        tokenPermit = IERC20Permit(token_);
    }

    function deposit(uint256 amount) external nonReentrant {
        require(amount > 0, "amount > 0");
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");
        shares[msg.sender] += amount;
        totalLiquidity += amount;
        emit Deposit(msg.sender, amount);
    }

    function depositWithPermit(
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        require(amount > 0, "amount > 0");
        tokenPermit.permit(msg.sender, address(this), amount, deadline, v, r, s);
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");
        shares[msg.sender] += amount;
        totalLiquidity += amount;
        emit Deposit(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "amount > 0");
        require(shares[msg.sender] >= amount, "insufficient shares");
        shares[msg.sender] -= amount;
        totalLiquidity -= amount;
        require(token.transfer(msg.sender, amount), "transfer failed");
        emit Withdraw(msg.sender, amount);
    }
}
