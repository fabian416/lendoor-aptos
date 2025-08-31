# 💳 Lendoor — The Reputation-based Money Market

<p align="center">
  <img src="frontend/public/landing.png" alt="Lendoor" style="max-width: 100%; border-radius: 12px;" />
</p>

<p align="center">
  <strong>Lendoor</strong> is a decentralized money market that enables <strong>uncollateralized lending</strong> across LatAm, powered by zero-knowledge proofs of identity and on-chain reputation.
</p>

---

## 🔍 What It Does

**Lendoor** unlocks **credit without collateral**.

Borrowers prove:
- **Identity/KYC** via **zkPassport**.
- **Financial reputation** via **vLayer**:
  - **Time-Travel**: prove historical average balances or stable holdings.
  - **Teleporter**: prove liquidity across chains without exposing wallet addresses (currently focused on Ethereum; multi-chain support to be added later).

Lenders allocate capital into **tranches**:
- **Senior (sUSDC)**: lower risk, priority in repayments, protected by junior buffer.  
- **Junior (jUSDC)**: higher yield, higher risk, absorbs first losses.  

---

## 🧪 How It Works

1. **Identity Verification (zkPassport)**  
   Users generate a zkPassport proof attesting to their verified identity and compliance with KYC, without revealing personal data.  

2. **Reputation Proofs (vLayer)**  
   - **Time-Travel proofs** show consistent on-chain balance over the last 12 months.  
   - **Teleporter proofs** demonstrate liquidity across Ethereum (and will extend to more chains in the future).  

3. **Credit Line Allocation**  
   - The **CreditLimitManager** maps verified reputation signals into **borrow limits** and **risk-adjusted interest rates**.  
   - Borrowers receive a credit line sized by their ZK-backed score.  

4. **Borrow / Lend Flow**  
   - Borrowers request uncollateralized loans using their credential.  
   - Lenders choose tranches:  
     - *Junior* (high risk / high return).  
     - *Senior* (lower risk, seniority in repayment).  

---

## 🔒 Why It Matters

- **Unlocks access to credit** for users without requiring collateral.  
- **Risk-aligned incentives**: junior lenders take higher risk for higher returns, while senior lenders are protected.  
- **Ethereum-native**: live on **Ethereum Mainnet**, with future plans for cross-chain expansion.  

---

## 📊 Key Financial Primitives (UI)

- **Base APY** — Baseline borrowing rate for the market. Final borrow APY = Base APY ± risk spread (depends on score, utilization, and term).  
- **Borrow Limit** — Your current credit line and remaining capacity. `available = limit − outstanding principal − pending pulls`.  
- **Credit Score** — Reputation-based score (history, utilization & delinquencies, account age; verified backing can boost it).  
- **Average Balance (12m)** — Time-weighted average of the wallet’s balance over the last year.  
- **Cross-chain Balance (current)** — Aggregated balance across supported networks (Ethereum focus to start).  
- **sUSDC (Senior) APY** — ~80% of pool, lower risk; permissionless USDC → sUSDC deposits (ERC‑4626). Senior claim on interest and real-time liquidity subject to reserves.  
- **jUSDC (Junior) APY** — ~20% of pool, higher risk; levered yield by staking senior liquidity (USDC→sUSDC→jUSDC). Absorbs first losses; includes cooldown before migrating back to Senior.  
- **Backing TVV** — Total Verified Value backing credit lines (on-chain DeFi + optional off-chain bank assets).  
- **sUSDC/USDC, jUSDC/sUSDC** — Conversions derived from ERC‑4626 share price (subject to reserves, fees, cooldowns).  

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
- **Teleporter**: verifies cross-chain liquidity on Ethereum (multi-chain later).  

**Backend (NestJS + Veramo + SQLite)**  
- DID creation & management.  
- zkPassport integration.  
- User journey flows.  

**Frontend (Vite + React + Tailwind)**  
- **Borrow** and **Lend** interfaces.  
- KPI dashboards (Base APY, Borrow Limits, Credit Score, TVV, Tranche balances).  
- Proof composer & verification flows.  

---

## 🧰 Risk Tranches & Waterfall

- **Pool caps**: target composition is **80% Senior** and **20% Junior** of total TVL.  
- **Waterfall**: interest and principal repayments **pay Senior first**, then Junior.  
- **Loss absorption**: **Junior absorbs first losses** on defaults and net recoveries before impacting Senior.  
- **Variable Junior APY**: Junior yield floats based on the stability of Senior APY and the pool’s net P&L; it can **outperform** when spreads are wide and **turn negative** if losses exceed buffer.  
- **Cooldown**: migrating **from Junior back to Senior** can require a **cooldown period** to prevent instant flight-to-safety during stress.  
- **Redemptions**: always **subject to reserves and market conditions** (e.g., ERC‑4626 share price/PPS, pending pulls, cooldowns).  

### 📎 Numerical Mini‑Example (with idle & spreads)

Assume fixed/variable loans across two borrowers **A** and **B** in the period; idle liquidity earns an external base (e.g., Aave).

- Idle external rate: \( IR_{\text{idle}} = 5\% \)  
- Utilization: \( U = 70\% \) (70% lent out, 30% idle)  
- IRM base at that utilization: \( IR_{\text{base}} = 8\% \)  
- Spreads: user A = +3%, user B = +12%  
  - \( IR_A = 11\% \), \( IR_B = 20\% \)  
- Weights in lent principal: \( W_A = 60\% \), \( W_B = 40\% \)

Borrow-side weighted rate:  
\[ \sum W_n IR_n = 0.6\cdot 11\% + 0.4\cdot 20\% = 14.4\% \]

Pool gross rate for the period:  
\[ IR_{\text{pool}} = (1-U)\cdot IR_{\text{idle}} + U\cdot 14.4\% = 0.3\cdot 5\% + 0.7\cdot 14.4\% = 11.58\% \]

Assume a **10% protocol fee on interest** → net to LPs:  
\[ IR_{\text{net}} \approx 10.42\% \]

If **Senior APY** is set to **10%**, then **Junior** sees the residual:  
\[ IR_{\text{jun}} \approx \frac{IR_{\text{net}} - 0.8\cdot IR_{\text{sen}}}{0.2} = \frac{10.42\% - 0.8\cdot 10\%}{0.2} \approx 12.1\% \]

> Notes:  
> • Junior can be **negative** if defaults or shortfalls exceed the buffer (waterfall).  
> • Figures are **illustrative**; real rates depend on utilization, spreads, fees, reserves, and realized P&L in the period.  

---

## 📁 Repository Structure

```
/backend        → NestJS API (users, zk-passport, user-journey, database)
/contracts      → Solidity contracts (Vault, Tranches, CreditLimitManager, RiskManager, Factories, Verifiers)
/frontend       → Vite + React + Tailwind (Borrow / Lend UI, proof flows, dashboards)
/vlayer         → ZK circuits & proving infra (AverageBalance, Teleporter, devnet, Risc0 integration)
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

**Example `.env` variables**
```dotenv
# Database
DATABASE_URL=sqlite:./database.sqlite

# zkPassport
ZK_PASSPORT_DOMAIN=your-domain.com
ZK_PASSPORT_API_KEY=your_api_key

# Blockchain
CHAIN_ID=1
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/<your-key>

# Auth
JWT_SECRET=change_me
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
# Example deploy (adjust script names/paths)
forge script script/03_EVault.s.sol   --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
```

### 5) ZK Circuits
```bash
cd ../vlayer
pnpm install   # or yarn install / npm install

# Compile Noir circuits
nargo compile

# Generate a proof (example: AverageBalance circuit)
bb prove -b ./target/AverageBalance.json          -w ./target/AverageBalance.wtns          -o ./target          --oracle_hash keccak
```

---

## 🌍 Use Cases

- **Uncollateralized loans** for individuals in emerging markets.  
- **Fair lending** through reputation-based pricing.  
- **Tranche markets** that align incentives between risk-tolerant and risk-averse lenders.  

---

## 🤝 Credits

Built with ❤️ by the **Lendoor** team for the **Aleph Hackathon**.  