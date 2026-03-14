/**
 * Markets routes
 *
 * GET  /api/markets            - All current market states
 * GET  /api/markets/alerts     - List active alerts
 * POST /api/markets/alerts     - Register a phase alert
 * GET  /api/markets/:pair      - Specific pair state
 */

import express from 'express';

const router = express.Router();

// In-memory alert store
const _alerts = new Map();  // alertId -> { pair, targetPhase, createdAt, triggered: bool }
let _alertIdCounter = 1;

// MarketEngine reference – injected by server.js via router.locals or passed directly.
// We expose a setter so server.js can wire it in after creating the engine.
let _engine = null;

export function setEngine(engine) {
  _engine = engine;
}

// ---------------------------------------------------------------------------
// GET /api/markets
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  if (!_engine) {
    return res.status(503).json({ error: 'Market engine not ready' });
  }

  const states = _engine.getAllStates();

  // Strip heavy arrays if ?slim=true
  if (req.query.slim === 'true') {
    for (const key of Object.keys(states)) {
      const s = states[key];
      if (s) {
        delete s.recentTrades;
        delete s.metricHistory;
        delete s.orderBook;
      }
    }
  }

  res.json({ markets: states });
});

// ---------------------------------------------------------------------------
// GET /api/markets/alerts  (must be before /:pair to avoid shadowing)
// ---------------------------------------------------------------------------
router.get('/alerts', (req, res) => {
  const alerts = Array.from(_alerts.values());
  res.json({ alerts });
});

// ---------------------------------------------------------------------------
// POST /api/markets/alerts
// ---------------------------------------------------------------------------
router.post('/alerts', (req, res) => {
  const { pair, targetPhase } = req.body ?? {};

  if (!pair || !targetPhase) {
    return res.status(400).json({ error: 'pair and targetPhase are required' });
  }

  const phase = Number(targetPhase);
  if (![1, 2, 3, 4].includes(phase)) {
    return res.status(400).json({ error: 'targetPhase must be 1, 2, 3, or 4' });
  }

  const id = _alertIdCounter++;
  const alert = {
    id,
    pair:        pair.toUpperCase(),
    targetPhase: phase,
    createdAt:   Date.now(),
    triggered:   false,
  };

  _alerts.set(id, alert);

  // Check if already in target phase
  if (_engine) {
    const state = _engine.getState(pair.toUpperCase());
    if (state && state.phase === phase) {
      alert.triggered   = true;
      alert.triggeredAt = Date.now();
    }
  }

  res.json({ alert });
});

// ---------------------------------------------------------------------------
// Internal: called by server.js when a phase transition fires
// ---------------------------------------------------------------------------
export function checkAlerts(pair, newPhase) {
  for (const alert of _alerts.values()) {
    if (!alert.triggered && alert.pair === pair && alert.targetPhase === newPhase) {
      alert.triggered   = true;
      alert.triggeredAt = Date.now();
    }
  }
}

// ---------------------------------------------------------------------------
// GET /api/markets/:pair
// ---------------------------------------------------------------------------
router.get('/:pair', (req, res) => {
  if (!_engine) {
    return res.status(503).json({ error: 'Market engine not ready' });
  }

  const pair  = req.params.pair.toUpperCase();
  const state = _engine.getState(pair);

  if (!state) {
    return res.status(404).json({ error: `Unknown pair: ${pair}` });
  }

  res.json(state);
});

export default router;
