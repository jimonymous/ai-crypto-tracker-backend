// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract GovernanceStub {
    struct Proposal {
        uint256 id;
        address proposer;
        string description;
        uint256 yesVotes;
        uint256 noVotes;
        uint256 createdAt;
    }

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;

    event ProposalCreated(uint256 indexed id, address indexed proposer, string description);
    event VoteCast(uint256 indexed id, address indexed voter, bool support, uint256 weight);

    function createProposal(string calldata description) external returns (uint256) {
        proposalCount += 1;
        proposals[proposalCount] = Proposal({
            id: proposalCount,
            proposer: msg.sender,
            description: description,
            yesVotes: 0,
            noVotes: 0,
            createdAt: block.timestamp
        });
        emit ProposalCreated(proposalCount, msg.sender, description);
        return proposalCount;
    }

    function vote(uint256 proposalId, bool support, uint256 weight) external {
        Proposal storage p = proposals[proposalId];
        require(p.id != 0, "proposal not found");
        if (support) {
          p.yesVotes += weight;
        } else {
          p.noVotes += weight;
        }
        emit VoteCast(proposalId, msg.sender, support, weight);
    }
}
