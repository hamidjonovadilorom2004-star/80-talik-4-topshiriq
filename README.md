# 80-talik-4-topshiriq
NFT
# Creator Collective NFT dApp

Creator Collective bu NFT minting va hamjamiyat ovoz berish imkoniyatlarini birlashtirgan Web3 loyiha. Foydalanuvchi NFT mint qiladi, token metadata’ni yangilaydi va NFT holder sifatida governance proposal yaratib ovoz bera oladi.

## Arxitektura rejasi

### 1. Smart-kontrakt qatlam
- `CreatorCollectiveNFT.sol` ERC-721 asosida yozilgan.
- Har bir mint uchun `mintPrice` qo‘llanadi.
- NFT holderlar proposal yaratishi va `yes/no` ovoz berishi mumkin.
- Proposal muddatdan keyin execute qilinadi.
- Token owner o‘z NFT metadata URI sini yangilay oladi.

### 2. Frontend qatlam
- React + Vite + ethers.js
- MetaMask orqali wallet connect
- On-chain stats panel
- Mint, metadata update va proposal form’lari
- Proposal kartalari orqali vote va execute

### 3. Deploy oqimi
- Hardhat bilan compile/test
- `scripts/deploy.js` orqali Sepolia testnet deploy
- Frontend `.env` ichida kontrakt address saqlanadi

## Repo tuzilmasi

```text
contracts/
scripts/
test/
frontend/
docs/
```

## Asosiy funksiyalar

- NFT yaratish
- Token URI update qilish
- Proposal create qilish
- Proposal vote qilish
- Proposal execute qilish

## Ishga tushirish

### 1. Dependency o‘rnatish

```bash
npm install
npm run frontend:install
```

### 2. Environment sozlash

Root uchun:

```bash
copy .env.example .env
```

`SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `ETHERSCAN_API_KEY` qiymatlarini to‘ldiring.

Frontend uchun:

```bash
copy frontend\\.env.example frontend\\.env
```

`VITE_CONTRACT_ADDRESS` ga deploy qilingan kontrakt manzilini kiriting.

### 3. Compile va test

```bash
npm run compile
npm test
```

### 4. Sepolia testnet deploy

```bash
npm run deploy:sepolia
```

### 5. Frontend ishga tushirish

```bash
npm run frontend:dev
```

## Smart-kontrakt arxitekturasi

### State
- `mintPrice`
- `contractMetadataURI`
- `_tokenIds`
- `_proposalIds`
- `proposals`
- `hasVoted`

### Core metodlar
- `safeMint(address to, string tokenURI_)`
- `updateTokenURI(uint256 tokenId, string newTokenURI)`
- `createProposal(string title, string description, uint256 durationInSeconds)`
- `voteOnProposal(uint256 proposalId, bool support)`
- `executeProposal(uint256 proposalId)`
- `withdraw()`

## Test qamrovi

- Mint va token URI tekshiruvi
- Proposal yaratish
- Ovoz berish
- Duplicate vote bloklanishi
- Deadline’dan keyin execute
- Metadata update

## Demo slayd

`docs/presentation.md` ichida qisqa demo slayd matni tayyorlangan.

## GitHub va deploy holati

Bu repoda loyiha kodi, README va demo materiallari tayyorlandi. GitHub push va real Sepolia deploy uchun sizning RPC URL, private key va Git remote ma’lumotlaringiz kerak bo‘ladi.
