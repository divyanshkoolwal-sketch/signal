/**
 * Orders routes
 *
 * POST /api/orders/create     - Submit a new order to Liquid
 * GET  /api/orders/positions  - List open positions with P&L
 * POST /api/orders/close      - Close a position by order ID
 */

import express from 'express';
import fetch   from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import { hasCredentials, buildLiquidHeaders } from './auth.js';

const router = express.Router();

const LIQUID_BASE = 'https://api.liquid.com';

// In-memory order store for demo/simulation mode
const _orders = new Map();  // orderId -> orderObject

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireAuth(res) {
  if (!hasCredentials()) {
    res.status(401).json({ error: 'Not authenticated. Call /api/auth/connect first.' });
    return false;
  }
  return true;
}

async function liquidFetch(method, path, body = null) {
  const headers = buildLiquidHeaders(path);
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const response = await fetch(`${LIQUID_BASE}${path}`, opts);
  const text = await response.text();

  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  return { status: response.status, ok: response.ok, data };
}

// Map SIGNAL bet types to Liquid order sides
function betTypeToSide(betType, explicitSide) {
  if (explicitSide) return explicitSide.toLowerCase();
  switch ((betType ?? '').toUpperCase()) {
    case 'RIDE': return 'buy';   // Ride the momentum
    case 'FADE': return 'sell';  // Fade the move
    case 'WAIT': return null;    // No action
    default:     return 'buy';
  }
}

// ---------------------------------------------------------------------------
// POST /api/orders/create
// ---------------------------------------------------------------------------
router.post('/create', async (req, res) => {
  if (!requireAuth(res)) return;

  const { pair, betType, size, stopLoss, side } = req.body ?? {};

  if (!pair || !size) {
    return res.status(400).json({ error: 'pair and size are required' });
  }

  const orderSide = betTypeToSide(betType, side);
  if (!orderSide) {
    return res.json({ success: true, message: 'WAIT – no order placed', betType });
  }

  // Build Liquid order payload
  // product_id is expected as a number in Liquid; use a common mapping
  const productIdMap = {
    BTCUSD: 1, ETHUSD: 27, SOLUSD: 761, XRPUSD: 83, BTCJPY: 5, ETHBTC: 37,
  };
  const productId = productIdMap[pair.toUpperCase()];
  if (!productId) {
    return res.status(400).json({ error: `Unknown pair: ${pair}` });
  }

  const liquidOrder = {
    order: {
      order_type:    'market',
      product_id:    productId,
      side:          orderSide,
      quantity:      String(size),
    },
  };

  try {
    const { ok, status, data } = await liquidFetch('POST', '/orders', liquidOrder);

    if (ok) {
      const order = {
        id:          data.id ?? uuidv4(),
        pair,
        betType:     betType ?? 'MANUAL',
        side:        orderSide,
        size,
        stopLoss,
        status:      'open',
        createdAt:   Date.now(),
        fillPrice:   data.price ?? null,
        liquidOrder: data,
      };
      _orders.set(String(order.id), order);
      return res.json({ success: true, order });
    }

    console.error('[orders/create] Liquid error:', status, data);

    // Simulation fallback: create a simulated order
    const simOrder = {
      id:        uuidv4(),
      pair,
      betType:   betType ?? 'MANUAL',
      side:      orderSide,
      size,
      stopLoss,
      status:    'open',
      createdAt: Date.now(),
      fillPrice: null,
      simulated: true,
    };
    _orders.set(simOrder.id, simOrder);
    return res.json({ success: true, order: simOrder, simulated: true });

  } catch (err) {
    console.error('[orders/create] Error:', err.message);

    // Simulation fallback on network error
    const simOrder = {
      id:        uuidv4(),
      pair,
      betType:   betType ?? 'MANUAL',
      side:      orderSide,
      size,
      stopLoss,
      status:    'open',
      createdAt: Date.now(),
      fillPrice: null,
      simulated: true,
    };
    _orders.set(simOrder.id, simOrder);
    return res.json({ success: true, order: simOrder, simulated: true });
  }
});

// ---------------------------------------------------------------------------
// GET /api/orders/positions
// ---------------------------------------------------------------------------
router.get('/positions', async (req, res) => {
  if (!requireAuth(res)) return;

  try {
    const { ok, data } = await liquidFetch('GET', '/trades?status=open');

    if (ok && Array.isArray(data.models ?? data)) {
      const trades = data.models ?? data;
      const positions = trades.map(t => ({
        id:          t.id,
        pair:        t.currency_pair_code,
        side:        t.side,
        size:        parseFloat(t.quantity),
        entryPrice:  parseFloat(t.open_price),
        currentPrice: parseFloat(t.close_price ?? t.open_price),
        pnl:         parseFloat(t.pnl ?? 0),
        createdAt:   t.created_at * 1000,
        status:      t.status,
      }));
      return res.json({ positions });
    }

    // Return in-memory simulated positions with computed P&L
    const positions = Array.from(_orders.values())
      .filter(o => o.status === 'open')
      .map(o => ({
        id:           o.id,
        pair:         o.pair,
        betType:      o.betType,
        side:         o.side,
        size:         o.size,
        entryPrice:   o.fillPrice,
        currentPrice: null,  // frontend should resolve from market state
        stopLoss:     o.stopLoss,
        createdAt:    o.createdAt,
        simulated:    o.simulated ?? false,
        status:       'open',
      }));

    return res.json({ positions });

  } catch (err) {
    console.error('[orders/positions] Error:', err.message);

    const positions = Array.from(_orders.values())
      .filter(o => o.status === 'open')
      .map(o => ({
        id:          o.id,
        pair:        o.pair,
        betType:     o.betType,
        side:        o.side,
        size:        o.size,
        entryPrice:  o.fillPrice,
        stopLoss:    o.stopLoss,
        createdAt:   o.createdAt,
        simulated:   true,
        status:      'open',
      }));

    return res.json({ positions });
  }
});

// ---------------------------------------------------------------------------
// POST /api/orders/close
// ---------------------------------------------------------------------------
router.post('/close', async (req, res) => {
  if (!requireAuth(res)) return;

  const { orderId } = req.body ?? {};
  if (!orderId) {
    return res.status(400).json({ error: 'orderId is required' });
  }

  // Check in-memory store first
  const localOrder = _orders.get(String(orderId));

  try {
    const { ok, data } = await liquidFetch('PUT', `/trades/${orderId}/close`, {});

    if (ok) {
      if (localOrder) localOrder.status = 'closed';
      return res.json({ success: true, data });
    }

    // Fallback: close locally
    if (localOrder) {
      localOrder.status = 'closed';
      return res.json({ success: true, simulated: true });
    }

    return res.status(404).json({ error: `Order ${orderId} not found` });

  } catch (err) {
    console.error('[orders/close] Error:', err.message);
    if (localOrder) {
      localOrder.status = 'closed';
      return res.json({ success: true, simulated: true });
    }
    return res.status(500).json({ error: err.message });
  }
});

export default router;
