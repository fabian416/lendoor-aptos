<p align="center">
  <img src="frontend/public/landing.png" alt="Lendoor" style="max-width: 100%; border-radius: 12px;" />
</p>

<h1 align="center">Lendoor — Reputation‑Based Money Market</h1>

<p align="center">
  <strong>Lendoor</strong> is a decentralized money market on <strong>Aptos</strong> that enables <strong>uncollateralized lending</strong> using <strong>zkMe</strong> proof‑of‑identity and a built‑in <strong>credit score</strong>. Capital is split into <strong>risk tranches</strong> (Senior / Junior) with a configurable waterfall.
</p>

> This repository contains:
> - **Move packages** (core protocol + configs + utilities)
> - **Frontend** (Vite + React)
> - **Backend** (NestJS API; integrates with zkMe for proof handling)

---

## 🚀 Deployed Contracts (Aptos **Testnet**)

> These are live testnet addresses you can use end‑to‑end.

- **Lendoor package (core modules)**: `0x9ffa31f2da2afe48612e1d04b37733987130df53db211cecbd26002b0832441a`
- **USDC (testnet)**: `0xa8fffd614c952e1b8febb99c4e6a8f394cda619c1591ac12256b33f2df73c7b9`
- **Wrapped USDC type (WUSDC)**: `0x9ffa31f2da2afe48612e1d04b37733987130df53db211cecbd26002b0832441a::wusdc::WUSDC`

Keep these in sync with your `.env` files (see **Configuration**).

---

## 🔍 What It Does (Essentials)

- **Borrowers**: submit zkMe proofs (identity/KYC + score) to unlock a credit line **without collateral**.
- **Lenders**: supply to **Senior** (lower risk) or **Junior** (first‑loss) tranches and earn risk‑adjusted yield.
- **Protocol**: on‑chain, modular Move code with configurable **interest model**, **reserve params**, and **tranche split**.

---

## 🧪 How It Works (Short)

1. **zkMe identity & score** → backend verifies; frontend gates borrow based on score/limits.
2. **On‑chain configs** → admin‑gated setters for interest curve, reserve params, and per‑asset tranche split.
3. **Accounting** → tranche manager syncs TVL deltas and mints/ burns LP to share profit or absorb losses.

---

## 🧱 Protocol Architecture (Move)

```
/contracts
├─ Move.toml
├─ sources/                         ← core (lendoor) modules
│  ├─ controller.move               ← entrypoints (deposit/withdraw/borrow), events, admin ops
│  ├─ controller_config.move        ← admin & host discovery; access control
│  ├─ credit_manager.move           ← per‑user credit lines & scores (uncollateralized limits)
│  ├─ fa_to_coin_wrapper.move       ← FA <-> Coin wrapper (resource account)
│  ├─ junior_vault.move             ← junior vault (jUSD shares) & first‑loss logic
│  ├─ profile.move                  ← user books: collateral LP & borrowed shares
│  ├─ reserve.move                  ← mint/redeem LP, borrow/repay, fees
│  ├─ reserve_details.move          ← interest accrual & math (1e9 fixed‑point)
│  ├─ tranche_config.move           ← per‑asset junior addr + bps
│  └─ tranche_manager.move          ← profit/loss sync, fee share mint/burn
└─ packages/
   ├─ util_types/                   ← decimal, maps, iterable table, math utils, pair
   └─ lendoor_config/               ← config types & setters (reserve + interest)
```

### Why it’s safe(‑ish) to operate
- **Admin gating**: `controller_config.assert_is_admin` guards all config/keeper paths.
- **Reserves**: singletons live at `host_addr()`; accounting enforces supply/cash/LP integrity.
- **Tranches**: junior takes first loss; profits flow via `mint_tranche_fee_shares` bps to junior.

---

## 🧰 Dev Environment

### Prerequisites
- Node 22+ & Yarn
- Aptos toolchain (via `@aptos-labs/ts-sdk`)

### Contracts — publish & ops
Two options:

**One‑shot pipeline**
```bash
cd contracts
yarn install
cp .env.example .env   # fill variables below
yarn move:publish
```
**Manual scripts** (useful while iterating)
```bash
cd contracts
node scripts/move/publish_util_types.js
node scripts/move/publish_config.js
node scripts/move/publish_lendoor.js
node scripts/move/init.js           # bootstrap controller host/admin
# other helpers:
node scripts/move/deposit_fa.js
node scripts/move/withdraw_fa.js
node scripts/move/borrow.js
node scripts/move/upgrade.js
```

> The **`contracts/scripts/move/`** directory is intentionally included so you can trigger common on‑chain actions without the UI during local/testnet testing.

### Frontend
```bash
cd frontend
yarn install
cp .env.example .env   # set backend URL & contract addresses
yarn dev
```
- Minimal app with **Borrow**/**Lend** flows and KPIs (Base APY, Limits, Scores, Sr/ Jr APY).
- **Hooks** live under `src/hooks/**` and encapsulate **all Aptos interactions** (reads/transactions), e.g.:
  - `hooks/borrow/*` for borrowing/repay
  - `hooks/senior/*` and `hooks/junior/*` for LP deposit/withdraw, yields
  - Shared providers in `src/providers/*` (wallet, user, move module)

### Backend (NestJS)
```bash
cd backend
yarn install
cp .env.example .env   # zkMe credentials + addresses
yarn dev
```
- Handles the zkMe flow (issue/verify/store) and exposes status so the UI can gate borrowing.

---

## ⚙️ Configuration

### Contracts `.env` (under `contracts/`)
Use these **variable names** (matches our scripts). Do **not** commit real secrets.

```dotenv
# basic
PROJECT_NAME=lendoor-aptos
VITE_APP_NETWORK=testnet        # devnet | testnet | mainnet
VITE_APTOS_API_KEY=""           # optional

# publisher account (local dev only)
VITE_MODULE_PUBLISHER_ACCOUNT_ADDRESS=0x...
VITE_MODULE_PUBLISHER_ACCOUNT_PRIVATE_KEY=0x...    # DO NOT COMMIT REAL KEYS

# FA / module
VITE_FA_CREATOR_ADDRESS=0x...
VITE_FA_ADDRESS=0x...           # fill after creating a fungible asset (optional flow)
VITE_MODULE_ADDRESS=0x...       # package addr if needed by tooling

# misc flags
VITE_SKIP_IRYS=true
VITE_PLACEHOLDER_ICON=https://placehold.co/512x512
SKIP_SIMULATION=1

# populated by scripts after publish
VITE_UTIL_TYPES_ADDRESS=0x...
VITE_CONFIG_ADDRESS=0x...
VITE_LENDOOR_ADDRESS=0x...
VITE_FA_METADATA_OBJECT=0x...
```

> **Testnet addresses to reuse** (see “Deployed Contracts”):  
> `VITE_LENDOOR_ADDRESS=0x9ffa31f2da2afe48612e1d04b37733987130df53db211cecbd26002b0832441a`

### Frontend `.env` (under `frontend/`)
```dotenv
VITE_PUBLIC_BACKEND_URL=http://localhost:5001

# contracts (testnet)
VITE_LENDOOR_ADDRESS=0x9ffa31f2da2afe48612e1d04b37733987130df53db211cecbd26002b0832441a
VITE_USDC_ADDRESS=0xa8fffd614c952e1b8febb99c4e6a8f394cda619c1591ac12256b33f2df73c7b9

# zkMe
VITE_ZK_ME_APP_ID=...
VITE_ZK_ME_PROGRAM_NO=...
```

### Backend `.env` (under `backend/`)
```dotenv
BASE_URL=http://localhost:5001

# contracts (testnet)
LENDOOR_CONTRACT=0x9ffa31f2da2afe48612e1d04b37733987130df53db211cecbd26002b0832441a
USDC_ADDRESS=0xa8fffd614c952e1b8febb99c4e6a8f394cda619c1591ac12256b33f2df73c7b9
USDC_MODULE_ADDRESS=0x5e0116b73251d84452a32c12ec854abf1b6671684a7bcafa15ffe3b0327075d6
WUSDC_TYPE=0x9ffa31f2da2afe48612e1d04b37733987130df53db211cecbd26002b0832441a::wusdc::WUSDC
WUSDC_DECIMALS=6

# local signer (dev only)
PRIVATE_KEY=0x...

# zkMe
ZK_ME_APP_ID=...
ZK_ME_PROGRAM_NO=...
ZK_ME_API_KEY=...
ZK_ME_API_MODE_PERMISSION=1
```

---

## 📁 Monorepo at a Glance

```
/backend        → NestJS API (zkMe integration, proof flow)
/contracts      → Move packages (core + config + utils) + scripts to publish & test
/frontend       → Vite + React + Tailwind (Borrow / Lend UI, KPIs)
```

---

## 🔑 Key Smart‑Contract Notes (just the useful bits)

- **Access control**: all mutating admin/keeper calls are gated by `controller_config::assert_is_admin`.
- **Reserves**: LP mint/redeem uses a TVL‑based exchange rate; fees: borrow, withdraw, liquidation. Integrity checks ensure on‑chain cash and LP supply match accounting.
- **Credit lines**: `credit_manager` stores per‑user **score** and **per‑asset limits**; hooks are called on borrow/repay to keep usage in sync.
- **Tranches**: `tranche_config` defines junior address & bps; `tranche_manager` measures P&L and applies **first‑loss** to junior or mints fee LP for profits.
- **FA wrapper**: `fa_to_coin_wrapper` bridges FA <-> Coin for wrapped assets; uses a resource account signer and metadata object.

---

## ⚠️ Security & Disclaimers

- This is research/experimental code on **testnet**. **Do not** use with real funds.
- Never commit private keys or zkMe credentials. Use `.env` and secrets management.
- Run audits and add rate‑limits/role separation before mainnet.

---

## 🤝 Credits

Built with ❤️ by the **Lendoor** team for the **Aptos Control + Move** hackathon.