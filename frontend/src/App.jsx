import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { contractAbi, contractAddress } from "./contract";

const initialMintForm = { recipient: "", tokenUri: "", royaltyPercentage: "10" };
const initialUpdateForm = { tokenId: "", tokenUri: "" };
const initialProposalForm = { title: "", description: "", duration: "3600" };

function formatAddress(address) {
  if (!address) return "Wallet ulanmagan";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(timestamp) {
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

function formatRemaining(deadline) {
  const diffMs = Number(deadline) * 1000 - Date.now();
  if (diffMs <= 0) return "Ovoz berish yopilgan";

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} kun ${hours} soat qoldi`;
  if (hours > 0) return `${hours} soat ${minutes} daqiqa qoldi`;
  return `${minutes} daqiqa qoldi`;
}

function getProposalState(proposal) {
  const isClosed = Date.now() >= Number(proposal.deadline) * 1000;

  if (proposal.status === 1) return "Passed";
  if (proposal.status === 2) return "Failed";
  if (proposal.status === 3) return "Executed";
  if (proposal.status === 4) return "Cancelled";
  return isClosed ? "Ready to review" : "Open";
}

export default function App() {
  const [walletAddress, setWalletAddress] = useState("");
  const [status, setStatus] = useState("Walletni ulang va NFT studio bilan ishlashni boshlang.");
  const [stats, setStats] = useState({
    mintPrice: "0",
    totalMinted: "0",
    totalProposals: "0",
    holderBalance: "0",
    totalVolumeETH: "0",
    proposalQuorum: "0",
    votingDuration: "0",
  });
  const [proposals, setProposals] = useState([]);
  const [mintForm, setMintForm] = useState(initialMintForm);
  const [updateForm, setUpdateForm] = useState(initialUpdateForm);
  const [proposalForm, setProposalForm] = useState(initialProposalForm);
  const [isBusy, setIsBusy] = useState(false);

  const holderBalanceNumber = Number(stats.holderBalance || 0);
  const isHolder = holderBalanceNumber > 0;

  const heroHighlights = useMemo(
    () => [
      { label: "Mint narxi", value: `${stats.mintPrice} ETH` },
      { label: "Hamjamiyat hajmi", value: `${stats.totalMinted} NFT` },
      { label: "Treasury volume", value: `${stats.totalVolumeETH} ETH` },
    ],
    [stats.mintPrice, stats.totalMinted, stats.totalVolumeETH]
  );

  async function getEthereum() {
    if (!window.ethereum) {
      throw new Error("MetaMask topilmadi. Brauzerga wallet kengaytmasini o'rnating.");
    }
    if (!contractAddress) {
      throw new Error("Frontend .env ichida VITE_CONTRACT_ADDRESS ko'rsatilmagan.");
    }
    return window.ethereum;
  }

  async function getContract(withSigner = false) {
    const ethereum = await getEthereum();
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = withSigner ? await provider.getSigner() : null;
    return new ethers.Contract(contractAddress, contractAbi, withSigner ? signer : provider);
  }

  async function loadData(activeAddress = walletAddress) {
    try {
      const contract = await getContract();
      const [mintPrice, totalMinted, totalProposals, totalVolumeETH, proposalQuorum, votingDuration] = await Promise.all([
        contract.mintPrice(),
        contract.totalMinted(),
        contract.totalProposals(),
        contract.totalVolumeETH(),
        contract.proposalQuorum(),
        contract.votingDuration(),
      ]);

      let holderBalance = 0n;
      if (activeAddress) {
        holderBalance = await contract.balanceOf(activeAddress);
      }

      const proposalCount = Number(totalProposals);
      const proposalEntries = await Promise.all(
        Array.from({ length: proposalCount }, async (_, index) => {
          const proposal = await contract.proposals(index + 1);
          return {
            id: proposal.id.toString(),
            title: proposal.title,
            description: proposal.description,
            deadline: proposal.deadline.toString(),
            yesVotes: proposal.yesVotes.toString(),
            noVotes: proposal.noVotes.toString(),
            status: Number(proposal.status),
            exists: proposal.exists,
            proposer: proposal.proposer,
            createdAt: proposal.createdAt.toString(),
          };
        })
      );

      setStats({
        mintPrice: ethers.formatEther(mintPrice),
        totalMinted: totalMinted.toString(),
        totalProposals: totalProposals.toString(),
        holderBalance: holderBalance.toString(),
        totalVolumeETH: ethers.formatEther(totalVolumeETH),
        proposalQuorum: proposalQuorum.toString(),
        votingDuration: votingDuration.toString(),
      });
      setProposals(proposalEntries.filter((proposal) => proposal.exists).reverse());
    } catch (error) {
      setStatus(error.message || "On-chain ma'lumotlarni yuklashda xatolik yuz berdi.");
    }
  }

  useEffect(() => {
    if (!window.ethereum) {
      return;
    }

    window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
      if (accounts[0]) {
        setWalletAddress(accounts[0]);
        loadData(accounts[0]);
      }
    });

    const handleAccountsChanged = (accounts) => {
      const nextAddress = accounts[0] || "";
      setWalletAddress(nextAddress);
      loadData(nextAddress);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    return () => window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
  }, []);

  async function handleAction(action, successMessage) {
    try {
      setIsBusy(true);
      setStatus("Tranzaksiya yuborilmoqda...");
      await action();
      setStatus(successMessage);
      await loadData();
    } catch (error) {
      setStatus(error.reason || error.shortMessage || error.message || "Xatolik yuz berdi.");
    } finally {
      setIsBusy(false);
    }
  }

  async function connectWallet() {
    try {
      const ethereum = await getEthereum();
      const accounts = await ethereum.request({ method: "eth_requestAccounts" });
      setWalletAddress(accounts[0] || "");
      setStatus("Wallet muvaffaqiyatli ulandi.");
      await loadData(accounts[0] || "");
    } catch (error) {
      setStatus(error.message || "Wallet ulanmagan.");
    }
  }

  async function mintNFT(event) {
    event.preventDefault();

    await handleAction(async () => {
      const contract = await getContract(true);
      const tx = await contract.safeMint(
        mintForm.recipient || walletAddress,
        mintForm.tokenUri,
        Number(mintForm.royaltyPercentage),
        { value: ethers.parseEther(stats.mintPrice || "0") }
      );
      await tx.wait();
      setMintForm(initialMintForm);
    }, "NFT muvaffaqiyatli mint qilindi.");
  }

  async function updateMetadata(event) {
    event.preventDefault();

    await handleAction(async () => {
      const contract = await getContract(true);
      const tx = await contract.updateTokenURI(updateForm.tokenId, updateForm.tokenUri);
      await tx.wait();
      setUpdateForm(initialUpdateForm);
    }, "Token metadata yangilandi.");
  }

  async function createProposal(event) {
    event.preventDefault();

    await handleAction(async () => {
      const contract = await getContract(true);
      const tx = await contract.createProposal(
        proposalForm.title,
        proposalForm.description,
        Number(proposalForm.duration)
      );
      await tx.wait();
      setProposalForm(initialProposalForm);
    }, "Proposal yaratildi.");
  }

  async function vote(proposalId, support) {
    await handleAction(async () => {
      const contract = await getContract(true);
      const tx = await contract.voteOnProposal(proposalId, support);
      await tx.wait();
    }, support ? "Yes vote yuborildi." : "No vote yuborildi.");
  }

  async function executeProposal(proposalId) {
    await handleAction(async () => {
      const contract = await getContract(true);
      const tx = await contract.executeProposal(proposalId);
      await tx.wait();
    }, "Proposal natijasi chain'da yangilandi.");
  }

  return (
    <div className="app-shell">
      <div className="bg-grid" />
      <div className="glow glow-one" />
      <div className="glow glow-two" />

      <header className="hero">
        <div className="hero-copy-block">
          <p className="eyebrow">Creator Collective / NFT Studio</p>
          <h1>NFT mint, metadata va governance bir sahifada.</h1>
          <p className="hero-copy">
            Creatorlar uchun tezkor Web3 boshqaruv paneli. Mint qiling, token ma'lumotlarini yangilang va holderlar
            bilan takliflar ustida ovoz bering.
          </p>

          <div className="hero-actions">
            <button onClick={connectWallet} disabled={isBusy}>
              {walletAddress ? "Walletni yangilash" : "Wallet ulash"}
            </button>
            <button type="button" className="secondary" onClick={() => loadData()}>
              On-chain yangilash
            </button>
          </div>

          <div className="hero-highlights">
            {heroHighlights.map((item) => (
              <article className="mini-stat" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </div>
        </div>

        <aside className="hero-panel">
          <div className="wallet-row">
            <span className="wallet-pill">{formatAddress(walletAddress)}</span>
            <span className={isHolder ? "badge badge-success" : "badge"}>{isHolder ? "Holder" : "Guest"}</span>
          </div>

          <p className="status">{status}</p>

          <div className="info-stack">
            <div>
              <span>Proposal quorum</span>
              <strong>{stats.proposalQuorum} ovoz</strong>
            </div>
            <div>
              <span>Standart voting</span>
              <strong>{Math.floor(Number(stats.votingDuration || 0) / 3600)} soat</strong>
            </div>
            <div>
              <span>Sizdagi NFT</span>
              <strong>{stats.holderBalance}</strong>
            </div>
          </div>
        </aside>
      </header>

      <section className="stats-ribbon">
        <article className="stat-card">
          <span>Mint qilingan NFT</span>
          <strong>{stats.totalMinted}</strong>
        </article>
        <article className="stat-card">
          <span>Faol proposal oqimi</span>
          <strong>{stats.totalProposals}</strong>
        </article>
        <article className="stat-card">
          <span>Treasury volume</span>
          <strong>{stats.totalVolumeETH} ETH</strong>
        </article>
        <article className="stat-card">
          <span>Wallet status</span>
          <strong>{walletAddress ? "Connected" : "Disconnected"}</strong>
        </article>
      </section>

      <main className="content-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Mint engine</p>
              <h2>Yangi NFT chiqarish</h2>
            </div>
          </div>

          <form onSubmit={mintNFT}>
            <label>
              Recipient address
              <input
                value={mintForm.recipient}
                onChange={(event) => setMintForm({ ...mintForm, recipient: event.target.value })}
                placeholder="0x... bo'sh qoldirilsa o'zingizga mint bo'ladi"
              />
            </label>

            <label>
              Token URI
              <input
                value={mintForm.tokenUri}
                onChange={(event) => setMintForm({ ...mintForm, tokenUri: event.target.value })}
                placeholder="ipfs://your-nft-metadata.json"
                required
              />
            </label>

            <label>
              Royalty foizi
              <input
                type="number"
                min="0"
                max="100"
                value={mintForm.royaltyPercentage}
                onChange={(event) => setMintForm({ ...mintForm, royaltyPercentage: event.target.value })}
                required
              />
            </label>

            <button type="submit" disabled={isBusy || !walletAddress}>
              NFT mint qilish
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Metadata control</p>
              <h2>Token URI yangilash</h2>
            </div>
          </div>

          <form onSubmit={updateMetadata}>
            <label>
              Token ID
              <input
                type="number"
                min="1"
                value={updateForm.tokenId}
                onChange={(event) => setUpdateForm({ ...updateForm, tokenId: event.target.value })}
                required
              />
            </label>

            <label>
              Yangi Token URI
              <input
                value={updateForm.tokenUri}
                onChange={(event) => setUpdateForm({ ...updateForm, tokenUri: event.target.value })}
                placeholder="ipfs://updated-metadata.json"
                required
              />
            </label>

            <button type="submit" disabled={isBusy || !walletAddress}>
              Metadata yangilash
            </button>
          </form>
        </section>

        <section className="panel panel-wide">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Governance lab</p>
              <h2>Yangi proposal yaratish</h2>
            </div>
            <span className={isHolder ? "badge badge-success" : "badge"}>{isHolder ? "Ovoz bera oladi" : "Holder kerak"}</span>
          </div>

          <form onSubmit={createProposal}>
            <label>
              Sarlavha
              <input
                value={proposalForm.title}
                onChange={(event) => setProposalForm({ ...proposalForm, title: event.target.value })}
                placeholder="Masalan: Yangi kolleksiya relizi"
                required
              />
            </label>

            <label>
              Tavsif
              <textarea
                value={proposalForm.description}
                onChange={(event) => setProposalForm({ ...proposalForm, description: event.target.value })}
                rows="5"
                required
              />
            </label>

            <label>
              Davomiylik (sekund)
              <input
                type="number"
                min="60"
                max="2592000"
                value={proposalForm.duration}
                onChange={(event) => setProposalForm({ ...proposalForm, duration: event.target.value })}
                required
              />
            </label>

            <button type="submit" disabled={isBusy || !walletAddress || !isHolder}>
              Proposal yuborish
            </button>
          </form>
        </section>

        <section className="panel panel-wide proposals-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Voting board</p>
              <h2>Hamjamiyat takliflari</h2>
            </div>
            <button type="button" className="secondary" onClick={() => loadData()}>
              Qayta yuklash
            </button>
          </div>

          <div className="proposal-list">
            {proposals.length === 0 ? (
              <div className="empty-state">Hali proposal yo'q. Birinchi governance taklifini shu yerdan boshlang.</div>
            ) : (
              proposals.map((proposal) => {
                const isClosed = Date.now() >= Number(proposal.deadline) * 1000;
                const currentState = getProposalState(proposal);
                const canExecute = isClosed && proposal.status === 0;

                return (
                  <article className="proposal-card" key={proposal.id}>
                    <div className="proposal-header">
                      <div>
                        <span className="proposal-id">Proposal #{proposal.id}</span>
                        <h3>{proposal.title}</h3>
                      </div>
                      <span className={currentState === "Open" ? "badge badge-success" : "badge"}>{currentState}</span>
                    </div>

                    <p>{proposal.description}</p>

                    <div className="proposal-meta">
                      <span>Proposer: {formatAddress(proposal.proposer)}</span>
                      <span>Yaratilgan: {formatTimestamp(proposal.createdAt)}</span>
                      <span>Deadline: {formatTimestamp(proposal.deadline)}</span>
                      <span>{formatRemaining(proposal.deadline)}</span>
                    </div>

                    <div className="vote-strip">
                      <div>
                        <span>Yes</span>
                        <strong>{proposal.yesVotes}</strong>
                      </div>
                      <div>
                        <span>No</span>
                        <strong>{proposal.noVotes}</strong>
                      </div>
                    </div>

                    <div className="proposal-actions">
                      <button type="button" onClick={() => vote(proposal.id, true)} disabled={isBusy || !walletAddress || !isHolder || isClosed}>
                        Yes vote
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => vote(proposal.id, false)}
                        disabled={isBusy || !walletAddress || !isHolder || isClosed}
                      >
                        No vote
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => executeProposal(proposal.id)}
                        disabled={isBusy || !walletAddress || !canExecute}
                      >
                        Execute review
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
