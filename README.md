# 💳 Lendoor — The Reputation-based Money Market

<p align="center">
  <img src="frontend/public/landing.png" alt="Lendoor" style="max-width: 100%; border-radius: 12px;" />
</p>

<p align="center">
  <strong>Lendoor</strong> enables <strong>uncollateralized lending</strong> by converting zero-knowledge proofs of identity and on-chain reputation into a <strong>verifiable credit signal</strong> — preserving user privacy.
</p>

---

## 🔍 What It Does

**Lendoor** unlocks **credit without collateral**.

Borrowers prove:
- **Identity/KYC** via **zkPassport**.
- **Financial reputation** via **vLayer**:
  - **Time-Travel**: prove historical average balances or stable holdings.
  - **Teleporter**: prove cross-chain liquidity without exposing wallet addresses.

Lenders allocate capital into **tranches**:
- **Junior**: higher yield, first-loss in defaults.  
- **Senior**: lower risk, protected by junior buffer.  


---

## 🧪 How It Works

1. **Prove Identity (zkPassport)**  
   Users generate a zkPassport proof attesting to their verified identity and compliance with KYC, without revealing personal information.

2. **Prove Reputation (vLayer)**  
   - **Time-Travel proofs** show consistent on-chain balance over time.  
   - **Teleporter proofs** demonstrate liquidity across multiple chains privately.

3. **Borrow / Lend Flow**  
   - Borrowers request uncollateralized loans using their credential.  
   - Lenders choose tranches:  
     - *Junior* (high risk / high return).  
     - *Senior* (lower risk, seniority in repayment).  

---

## 🔒 Why It Matters

- **Unlocks access to credit** for users without requiring collateral.  
- **Risk-aligned incentives**: junior lenders take higher risk for higher returns, while senior lenders are protected.  

---

## 🧱 Protocol Architecture

**Smart Contracts (Solidity)**
- `Vault.sol` — Core lending vault.  
- `CreditLimitManager.sol` — Calculates borrower credit limits from ZK credentials.  
- `RiskManagerUncollat.sol` — Default & risk management for uncollateralized loans.  
- **Tranches**  
  - `JuniorERC4626.sol` — Junior tranche implementation.  
  - `SymbioticTrancheVault.sol`, `TrancheToken.sol` — tranche system & token logic.  
- **Factories & Deploy Scripts**  
  - `EVaultFactory.s.sol`, `DeployCLM.s.sol`, `DeployJuniorERC4626.s.sol` etc.  
- **Verifiers**  
  - `AverageBalanceVerifier.sol`, `Risc0Verifier.sol`, `Groth16Verifier.sol` for ZK proof verification.  

**ZK Layer (Noir + vLayer + Risc0)**  
- **AverageBalance.nr** circuit: proves historical account balances.  
- **Teleporter**: verifies cross-chain liquidity.

**Backend (NestJS + Veramo + SQLite)**  
- DID creation & management.  
- zkPassport integration.  
- User journey flows.  

**Frontend (Vite + React + Tailwind)**  
- **Borrow** and **Lend** interfaces.  
- KPI dashboards.  
- Proof composer & verification flows.  

---

## 📦 Repository Structure

```
/backend        → NestJS API (users, zk-passport, user-journey, database)
/contracts      → Solidity contracts (Vault, Tranches, CreditLimitManager, RiskManager, Factories, Verifiers)
/frontend       → Vite + React + Tailwind (Borrow / Lend UI, proof flows, dashboards)
/vlayer         → ZK circuits & proving infra (AverageBalance, Teleporter, devnet)
```

---

## 🚀 Getting Started

### 1) Clone
```bash
git clone https://github.com/lucholeonel/lendoor
cd lendoor
```

### 2) Backend
```bash
cd backend
cp .env.example .env
yarn install
yarn dev
```

### 3) Frontend
```bash
cd ../frontend
cp .env.example .env
yarn install
yarn dev
```

### 4) Smart Contracts
```bash
cd ../contracts
forge install
forge build
# Example deploy (adjust names/paths to your scripts)
forge script script/03_EVault.s.sol   --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
```

---

## 📊 Tranche Model

- **Junior Tranche (ERC4626)** 💎  
  - Higher returns.  
  - Bears first losses if borrowers default.  

- **Senior Tranche** 🛡️  
  - Safer position.  
  - Lower but more stable yield.  

This **two-tier waterfall** ensures both accessibility for borrowers and protection for conservative lenders.

---

## 🧩 Use Cases

- **Credit for the underbanked**: Borrow without collateral by proving reputation.  
- **Cross-chain DeFi**: Use proofs of liquidity across multiple chains to access loans.  
- **Capital efficiency**: Tranches balance risk and reward for lenders.

---

## 🤝 Credits

Built with ❤️ by the **Lendoor** team for the Aleph Hackathon