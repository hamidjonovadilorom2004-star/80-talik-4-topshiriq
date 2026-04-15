// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title CreatorCollectiveNFT
 * @dev Enhanced NFT contract with governance, royalties, and creator support
 * @notice This contract combines NFT creation with decentralized governance
 */
contract CreatorCollectiveNFT is ERC721URIStorage, ERC721Burnable, Ownable {
    enum ProposalStatus { Active, Passed, Failed, Executed, Cancelled }

    struct Proposal {
        uint256 id;
        string title;
        string description;
        uint256 deadline;
        uint256 yesVotes;
        uint256 noVotes;
        ProposalStatus status;
        bool exists;
        address proposer;
        uint256 createdAt;
    }

    struct TokenMetadata {
        address creator;
        uint256 royaltyPercentage;
        uint256 mintedAt;
    }

    // Core state variables
    uint256 private _tokenIds;
    uint256 private _proposalIds;
    uint256 public totalVolumeETH;

    // Pricing and configuration
    uint256 public mintPrice;
    string public contractMetadataURI;
    uint256 public proposalQuorum = 2; // Minimum votes required
    uint256 public votingDuration = 86400; // Default 24 hours

    // Mappings
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => TokenMetadata) public tokenMetadata;
    mapping(address => uint256) public creatorEarnings;
    mapping(address => uint256) public memberNFTCount;

    // Events
    event NFTMinted(
        address indexed minter,
        address indexed creator,
        uint256 indexed tokenId,
        string tokenURI,
        uint256 timestamp
    );
    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        string title,
        uint256 deadline
    );
    event ProposalVoted(
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 timestamp
    );
    event ProposalExecuted(
        uint256 indexed proposalId,
        ProposalStatus status,
        uint256 timestamp
    );
    event MintPriceUpdated(uint256 oldPrice, uint256 newPrice, uint256 timestamp);
    event ContractMetadataUpdated(string metadataURI, uint256 timestamp);
    event EarningsWithdrawn(address indexed creator, uint256 amount);
    event RoyaltyPaid(address indexed creator, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 mintPrice_,
        string memory metadataURI_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        require(mintPrice_ >= 0, "Mint price cannot be negative");
        require(bytes(metadataURI_).length > 0, "Metadata URI required");

        mintPrice = mintPrice_;
        contractMetadataURI = metadataURI_;
        totalVolumeETH = 0;
    }

    modifier onlyTokenHolder() {
        require(balanceOf(msg.sender) > 0, "Only NFT holder can call");
        _;
    }

    modifier validAddress(address addr) {
        require(addr != address(0), "Invalid address");
        _;
    }

    /**
     * @dev Mint a new NFT with metadata
     * @param to Recipient address
     * @param tokenURI_ Token metadata URI (IPFS or external)
     * @param royaltyPercentage_ Royalty percentage for creator (0-100)
     * @return newTokenId The ID of the newly minted NFT
     */
    function safeMint(
        address to,
        string memory tokenURI_,
        uint256 royaltyPercentage_
    ) external payable validAddress(to) returns (uint256) {
        require(msg.value >= mintPrice, "Insufficient mint fee");
        require(bytes(tokenURI_).length > 0, "Token URI required");
        require(royaltyPercentage_ <= 100, "Royalty too high");

        _tokenIds += 1;
        uint256 newTokenId = _tokenIds;

        // Track creator and royalty
        tokenMetadata[newTokenId] = TokenMetadata({
            creator: msg.sender,
            royaltyPercentage: royaltyPercentage_,
            mintedAt: block.timestamp
        });

        // Update member NFT count
        if (balanceOf(to) == 0) {
            memberNFTCount[to] = 1;
        } else {
            memberNFTCount[to]++;
        }

        // Update total volume
        totalVolumeETH += msg.value;

        // Track creator earnings
        creatorEarnings[msg.sender] += msg.value;

        _safeMint(to, newTokenId);
        _setTokenURI(newTokenId, tokenURI_);

        emit NFTMinted(msg.sender, msg.sender, newTokenId, tokenURI_, block.timestamp);
        return newTokenId;
    }

    /**
     * @dev Create a new governance proposal
     * @param title Proposal title
     * @param description Proposal description
     * @param durationInSeconds Voting duration in seconds
     * @return proposalId The ID of the newly created proposal
     */
    function createProposal(
        string memory title,
        string memory description,
        uint256 durationInSeconds
    ) external onlyTokenHolder returns (uint256) {
        require(bytes(title).length > 0, "Title required");
        require(bytes(description).length > 0, "Description required");
        require(durationInSeconds >= 60, "Duration too short");
        require(durationInSeconds <= 30 days, "Duration too long");

        _proposalIds += 1;
        uint256 proposalId = _proposalIds;

        proposals[proposalId] = Proposal({
            id: proposalId,
            title: title,
            description: description,
            deadline: block.timestamp + durationInSeconds,
            yesVotes: 0,
            noVotes: 0,
            status: ProposalStatus.Active,
            exists: true,
            proposer: msg.sender,
            createdAt: block.timestamp
        });

        emit ProposalCreated(proposalId, msg.sender, title, proposals[proposalId].deadline);
        return proposalId;
    }

    /**
     * @dev Vote on an active proposal
     * @param proposalId Proposal to vote on
     * @param support True for yes, false for no
     */
    function voteOnProposal(uint256 proposalId, bool support) external onlyTokenHolder {
        Proposal storage proposal = proposals[proposalId];

        require(proposal.exists, "Proposal not found");
        require(proposal.status == ProposalStatus.Active, "Voting not active");
        require(block.timestamp < proposal.deadline, "Voting closed");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            proposal.yesVotes += 1;
        } else {
            proposal.noVotes += 1;
        }

        emit ProposalVoted(proposalId, msg.sender, support, block.timestamp);
    }

    /**
     * @dev Execute a proposal after voting period ends
     * @param proposalId Proposal to execute
     */
    function executeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];

        require(proposal.exists, "Proposal not found");
        require(proposal.status == ProposalStatus.Active, "Already executed");
        require(block.timestamp >= proposal.deadline, "Voting still active");

        uint256 totalVotes = proposal.yesVotes + proposal.noVotes;
        require(totalVotes >= proposalQuorum, "Quorum not reached");

        if (proposal.yesVotes > proposal.noVotes) {
            proposal.status = ProposalStatus.Passed;
        } else {
            proposal.status = ProposalStatus.Failed;
        }

        emit ProposalExecuted(proposalId, proposal.status, block.timestamp);
    }

    /**
     * @dev Update token URI
     * @param tokenId Token to update
     * @param newTokenURI New metadata URI
     */
    function updateTokenURI(uint256 tokenId, string memory newTokenURI) external {
        require(ownerOf(tokenId) == msg.sender, "Not token owner");
        require(bytes(newTokenURI).length > 0, "URI required");
        _setTokenURI(tokenId, newTokenURI);
    }

    /**
     * @dev Update mint price (owner only)
     * @param newMintPrice New mint price in Wei
     */
    function updateMintPrice(uint256 newMintPrice) external onlyOwner {
        uint256 oldPrice = mintPrice;
        mintPrice = newMintPrice;
        emit MintPriceUpdated(oldPrice, newMintPrice, block.timestamp);
    }

    /**
     * @dev Set contract metadata URI
     * @param metadataURI_ New metadata URI
     */
    function setContractMetadataURI(string memory metadataURI_) external onlyOwner {
        require(bytes(metadataURI_).length > 0, "URI required");
        contractMetadataURI = metadataURI_;
        emit ContractMetadataUpdated(metadataURI_, block.timestamp);
    }

    /**
     * @dev Update quorum requirement
     * @param newQuorum New minimum votes required
     */
    function setProposalQuorum(uint256 newQuorum) external onlyOwner {
        require(newQuorum > 0, "Quorum must be positive");
        proposalQuorum = newQuorum;
    }

    /**
     * @dev Update voting duration
     * @param newDuration New duration in seconds
     */
    function setVotingDuration(uint256 newDuration) external onlyOwner {
        require(newDuration >= 60 && newDuration <= 30 days, "Invalid duration");
        votingDuration = newDuration;
    }

    /**
     * @dev Withdraw creator earnings
     */
    function withdrawEarnings() external validAddress(msg.sender) {
        uint256 earnings = creatorEarnings[msg.sender];
        require(earnings > 0, "No earnings to withdraw");

        creatorEarnings[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: earnings}("");
        require(success, "Withdraw failed");

        emit EarningsWithdrawn(msg.sender, earnings);
    }

    /**
     * @dev Withdraw contract balance (owner only)
     */
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        (bool success, ) = owner().call{value: balance}("");
        require(success, "Withdraw failed");
    }

    /**
     * @dev Get total minted tokens
     */
    function totalMinted() external view returns (uint256) {
        return _tokenIds;
    }

    /**
     * @dev Get total proposals
     */
    function totalProposals() external view returns (uint256) {
        return _proposalIds;
    }

    /**
     * @dev Get proposal details
     * @param proposalId Proposal ID
     */
    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        require(proposals[proposalId].exists, "Proposal not found");
        return proposals[proposalId];
    }

    /**
     * @dev Get token metadata
     * @param tokenId Token ID
     */
    function getTokenMetadata(uint256 tokenId) external view returns (TokenMetadata memory) {
        require(_safeOwnerOf(tokenId) != address(0), "Token not found");
        return tokenMetadata[tokenId];
    }

    /**
     * @dev Get creator earnings
     * @param creator Creator address
     */
    function getCreatorEarnings(address creator) external view returns (uint256) {
        return creatorEarnings[creator];
    }

    /**
     * @dev Get proposal status text
     * @param proposalId Proposal ID
     */
    function getProposalStatusText(uint256 proposalId) external view returns (string memory) {
        Proposal memory p = proposals[proposalId];
        if (p.status == ProposalStatus.Active) {
            if (block.timestamp >= p.deadline) return "Ready to Execute";
            return "Active";
        }
        if (p.status == ProposalStatus.Passed) return "Passed";
        if (p.status == ProposalStatus.Failed) return "Failed";
        if (p.status == ProposalStatus.Executed) return "Executed";
        return "Cancelled";
    }

    /**
     * @dev Get token URI
     */
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    /**
     * @dev Check interface support
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Get owner of token (internal helper)
     */
    function _safeOwnerOf(uint256 tokenId) internal view returns (address) {
        try this.ownerOf(tokenId) returns (address owner) {
            return owner;
        } catch {
            return address(0);
        }
    }
}
