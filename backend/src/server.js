/**
 * SIGNAL Backend Server
 *
 * Express + WebSocket server on port 4000.
 * Serves REST API and broadcasts real-time market state updates via WebSocket.
 */

import 'dotenv/config';
import http    from 'http';
import express from 'express';
import cors    from 'cors';
import { WebSocketServer } from 'ws';

import { LiquidTap }    from './liquidTap.js';
import { MarketEngine } from './marketState.js';
import authRouter       from './api/routes/auth.js';
import ordersRouter     from './api/routes/orders.js';
import marketsRouter, { setEngine, checkAlerts } from './api/routes/markets.js';

// ---------------------------------------------------------------------------
// Express setup
// ---------------------------------------------------------------------------

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Mount API routes
app.use('/api/auth',    authRouter);
app.use('/api/orders',  ordersRouter);
app.use('/api/markets', marketsRouter);

// Health check
app.get('/health', (req, res) => {
  const pairs = engine ? engine.getPairs() : [];
  res.json({ status: 'ok', pairs, timestamp: Date.now() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

// ---------------------------------------------------------------------------
// HTTP server + WebSocket server
// ---------------------------------------------------------------------------

const PORT   = parseInt(process.env.PORT ?? '4000', 10);
const server = http.createServer(app);

const wss = new WebSocketServer({ server });

// Connected WebSocket clients
const clients = new Set();

wss.on('connection', (ws, req) => {
  clients.add(ws);
  console.log(`[WS] Client connected (${clients.size} total). IP: ${req.socket.remoteAddress}`);

  // Send current states immediately on connect
  if (engine) {
    const allStates = engine.getAllStates();
    for (const [pair, state] of Object.entries(allStates)) {
      if (state) {
        safeSend(ws, { type: 'MARKET_UPDATE', pair, state });
      }
    }
  }

  ws.on('message', (raw) => {
    // Handle client ping
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'ping') safeSend(ws, { type: 'pong', timestamp: Date.now() });
    } catch {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected (${clients.size} remaining)`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
    clients.delete(ws);
  });
});

/**
 * Safely send a JSON message to a single WebSocket client.
 */
function safeSend(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.error('[WS] Send error:', err.message);
    }
  }
}

/**
 * Broadcast a message to all connected clients.
 */
function broadcast(payload) {
  if (clients.size === 0) return;
  const message = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(message); } catch { clients.delete(ws); }
    }
  }
}

// ---------------------------------------------------------------------------
// Market engine
// ---------------------------------------------------------------------------

const tap    = new LiquidTap();
const engine = new MarketEngine(tap);

// Inject engine into markets router
setEngine(engine);

// Register state update callback
engine.onStateUpdate((pair, state, phaseTransition) => {
  // Broadcast market update to all WS clients
  broadcast({ type: 'MARKET_UPDATE', pair, state });

  // Emit phase transition event if phase changed
  if (phaseTransition) {
    const transition = {
      type:      'PHASE_TRANSITION',
      pair,
      from:      phaseTransition.from,
      to:        phaseTransition.to,
      fromLabel: ['', 'ACCUMULATION', 'IGNITION', 'PROPAGATION', 'EXHAUSTION'][phaseTransition.from] ?? '?',
      toLabel:   ['', 'ACCUMULATION', 'IGNITION', 'PROPAGATION', 'EXHAUSTION'][phaseTransition.to]   ?? '?',
      timestamp: Date.now(),
    };
    broadcast(transition);

    // Check registered alerts
    checkAlerts(pair, phaseTransition.to);

    console.log(`[Phase] ${pair}: ${transition.fromLabel} → ${transition.toLabel}`);
  }
});

// Start market engine (connects to Liquid or starts simulation)
engine.start();

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`\n🚀 SIGNAL backend running on port ${PORT}`);
  console.log(`   REST API:  http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
  console.log(`   CORS:      ${process.env.CORS_ORIGIN ?? 'http://localhost:3000'}\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received – shutting down gracefully...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[server] SIGINT received – shutting down...');
  server.close(() => process.exit(0));
});
