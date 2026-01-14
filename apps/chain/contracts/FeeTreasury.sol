// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/draft-IERC20Permit.sol";

contract FeeTreasury is Ownable {
    IERC20 public immutable token;
    IERC20Permit public immutable tokenPermit;

    event FeesCollected(address indexed from, uint256 amount);
    event FeesCollectedWithPermit(address indexed from, uint256 amount);
    event Withdraw(address indexed to, uint256 amount);

    constructor(address token_, address owner_) {
        require(token_ != address(0), "token required");
        token = IERC20(token_);
        tokenPermit = IERC20Permit(token_);
        _transferOwnership(owner_);
    }

    function collect(uint256 amount) external {
        require(amount > 0, "amount > 0");
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");
        emit FeesCollected(msg.sender, amount);
    }

    function collectWithPermit(
        address from,
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(amount > 0, "amount > 0");
        tokenPermit.permit(from, address(this), amount, deadline, v, r, s);
        require(token.transferFrom(from, address(this), amount), "transfer failed");
        emit FeesCollectedWithPermit(from, amount);
    }

    function withdraw(address to, uint256 amount) external onlyOwner {
        require(token.transfer(to, amount), "transfer failed");
        emit Withdraw(to, amount);
    }
}
