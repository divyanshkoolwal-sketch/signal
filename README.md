# SIGNAL

Real-time market microstructure trading terminal. SIGNAL ingests live order-book data from the Liquid exchange and surfaces information-asymmetry signals — VPIN, OFI, BVC, spread regimes, phase classification — through a Bloomberg-style dark UI.

Built for the UC Berkeley Hackathon 2026.

## What it does

- **Live tick + order book ingest** via Liquid REST/WebSocket
- **Microstructure signals** computed in-process:
  - Volume-Synchronized Probability of Informed Trading (VPIN)
  - Order Flow Imbalance (OFI)
  - Bulk Volume Classification (BVC)
  - Volume-Volatility Index (VVI)
  - Time-Adjusted Return (TAR), spread regime, phase classifier
- **Information timeline** correlating price moves with detected information events
- **Order entry** routed through the Liquid trading API

## Stack

- **Backend** — Node.js + Express, Liquid REST + WebSocket client, signal pipeline (`backend/src/signals/`)
- **Frontend** — React + Vite, dark Bloomberg-style terminal UI

## Run locally

```bash
# Backend
cd backend
cp .env.example .env   # then fill in LIQUID_API_KEY / LIQUID_API_SECRET
npm install
npm run dev            # http://localhost:4000

# Frontend
cd frontend
npm install
npm run dev            # http://localhost:3000
```

Or use the provided helper:

```bash
./start.sh
```

## Environment

`backend/.env` — never commit. Required keys:

```
PORT=4000
LIQUID_API_KEY=...
LIQUID_API_SECRET=...
CORS_ORIGIN=http://localhost:3000
FORCE_SIMULATION=false
```

`FORCE_SIMULATION=true` runs the terminal against a synthetic order-book feed if the API is unreachable.

## Layout

```
backend/
  src/
    api/routes/      auth, markets, orders
    signals/         vpin, ofi, bvc, vvi, tar, spread, phaseClassifier
    liquidTap.js     WebSocket client
    marketState.js   in-memory book + recent trades
    server.js        Express entry
frontend/
  src/components/    MainStage, MarketGrid, PhaseCard, OrderBook…
```

## License

Private — all rights reserved.
