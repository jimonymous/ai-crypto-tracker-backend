// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RewardsMerkle is Ownable, ReentrancyGuard {
    IERC20 public immutable rewardsToken;

    // epoch => merkleRoot
    mapping(uint256 => bytes32) public merkleRoots;
    // epoch => claimed[address]
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    event MerkleRootUpdated(uint256 indexed epoch, bytes32 merkleRoot);
    event Claimed(uint256 indexed epoch, address indexed account, uint256 amount);

    constructor(address tokenAddress, address owner_) {
        require(tokenAddress != address(0), "token required");
        rewardsToken = IERC20(tokenAddress);
        _transferOwnership(owner_);
    }

    function setMerkleRoot(uint256 epoch, bytes32 root) external onlyOwner {
        require(root != bytes32(0), "invalid root");
        merkleRoots[epoch] = root;
        emit MerkleRootUpdated(epoch, root);
    }

    function isClaimed(uint256 epoch, address account) public view returns (bool) {
        return hasClaimed[epoch][account];
    }

    function claim(uint256 epoch, uint256 amount, bytes32[] calldata proof) external nonReentrant {
        require(!isClaimed(epoch, msg.sender), "already claimed");
        bytes32 root = merkleRoots[epoch];
        require(root != bytes32(0), "root not set");

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        require(MerkleProof.verify(proof, root, leaf), "invalid proof");

        hasClaimed[epoch][msg.sender] = true;
        require(rewardsToken.transfer(msg.sender, amount), "transfer failed");

        emit Claimed(epoch, msg.sender, amount);
    }
}
