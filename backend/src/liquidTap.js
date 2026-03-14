/**
 * CoinbaseFeed – WebSocket market data via Coinbase Advanced Trade
 *
 * wss://advanced-trade-ws.coinbase.com
 *
 * Public feed — no API key required for market data.
 * Subscribes to `market_trades` and `level2` channels for all pairs.
 *
 * Falls back to simulation if the connection is unavailable
 * (or FORCE_SIMULATION=true).
 */

import WebSocket from 'ws';

const COINBASE_WS_URL = 'wss://advanced-trade-ws.coinbase.com';

// ---------------------------------------------------------------------------
// Simulation config (fallback) — keyed by Coinbase product_id format
// ---------------------------------------------------------------------------
const SIM_CONFIG = {
  'BTC-USD':  { base: 67000,  vol: 0.005, tickSize: 0.5,    lotSize: 0.001, tradeQtyBase: 0.1  },
  'ETH-USD':  { base: 3500,   vol: 0.006, tickSize: 0.1,    lotSize: 0.01,  tradeQtyBase: 0.5  },
  'SOL-USD':  { base: 140,    vol: 0.010, tickSize: 0.01,   lotSize: 1,     tradeQtyBase: 5    },
  'XRP-USD':  { base: 0.58,   vol: 0.008, tickSize: 0.0001, lotSize: 100,   tradeQtyBase: 500  },
  'DOGE-USD': { base: 0.12,   vol: 0.012, tickSize: 0.0001, lotSize: 500,   tradeQtyBase: 2000 },
  'ETH-BTC':  { base: 0.052,  vol: 0.004, tickSize: 0.00001,lotSize: 0.1,   tradeQtyBase: 0.5  },
};

const EVENT_INTERVAL_MIN_MS = 3 * 60 * 1000;
const EVENT_INTERVAL_MAX_MS = 8 * 60 * 1000;
const EVENT_DURATION_MIN_MS = 2 * 60 * 1000;
const EVENT_DURATION_MAX_MS = 5 * 60 * 1000;

function rand(min, max) { return Math.random() * (max - min) + min; }
function randChoice(arr) { return arr[Math.floor(rand(0, arr.length))]; }

// ---------------------------------------------------------------------------
// SimulatedPair
// ---------------------------------------------------------------------------
class SimulatedPair {
  constructor(productId, config) {
    this.productId = productId;
    this.config    = config;
    this.price     = config.base;

    this.inEvent       = false;
    this.eventDir      = 1;
    this.eventEndTime  = 0;
    this.nextEventTime = Date.now() + rand(EVENT_INTERVAL_MIN_MS, EVENT_INTERVAL_MAX_MS);

    this.drift  = 0;
    this.sigma  = config.base * config.vol * 0.01;
    this.spread = config.base * 0.0002;

    this.tradeCallbacks = [];
    this.bookCallbacks  = [];
    this._tradeTimer    = null;
    this._bookTimer     = null;
  }

  start() { this._scheduleTrade(); this._scheduleBook(); }
  stop()  {
    clearTimeout(this._tradeTimer);
    clearTimeout(this._bookTimer);
  }

  _scheduleTrade() {
    const delay = this.inEvent ? rand(80, 200) : rand(200, 500);
    this._tradeTimer = setTimeout(() => { this._emitTrade(); this._scheduleTrade(); }, delay);
  }

  _scheduleBook() {
    this._bookTimer = setTimeout(() => { this._emitBook(); this._scheduleBook(); }, rand(400, 700));
  }

  _updateEventState() {
    const now = Date.now();
    if (this.inEvent) {
      if (now >= this.eventEndTime) {
        this.inEvent = false;
        this.drift   = 0;
        this.nextEventTime = now + rand(EVENT_INTERVAL_MIN_MS, EVENT_INTERVAL_MAX_MS);
      }
    } else if (now >= this.nextEventTime) {
      this.inEvent      = true;
      this.eventDir     = randChoice([-1, 1]);
      this.eventEndTime = now + rand(EVENT_DURATION_MIN_MS, EVENT_DURATION_MAX_MS);
      this.drift        = this.eventDir * this.config.base * 0.0003;
    }
  }

  _emitTrade() {
    this._updateEventState();
    const noise = (Math.random() - 0.5) * 2 * this.sigma;
    this.price  = Math.max(this.config.base * 0.5, this.price + noise + this.drift);

    const takerSide = this.inEvent
      ? (Math.random() < (this.eventDir === 1 ? 0.75 : 0.25) ? 'buy' : 'sell')
      : (Math.random() < 0.5 ? 'buy' : 'sell');

    const qty = this.config.tradeQtyBase * (this.inEvent ? rand(1.5, 4) : rand(0.5, 1.5));

    for (const cb of this.tradeCallbacks) cb({
      price: parseFloat(this.price.toPrecision(8)),
      qty:   parseFloat(qty.toPrecision(6)),
      takerSide,
      timestamp: Date.now(),
    });
  }

  _emitBook() {
    const mid  = this.price;
    const half = this.spread / 2;
    const df   = this.inEvent ? 0.5 : 1.0;
    const bids = [], asks = [];

    for (let i = 0; i < 20; i++) {
      const step  = this.config.tickSize * (i + 1);
      const base  = this.config.tradeQtyBase * 10 * df * Math.exp(-0.15 * i) * rand(0.5, 1.5);
      bids.push([parseFloat((mid - half - step).toPrecision(8)), parseFloat(base.toPrecision(6))]);
      asks.push([parseFloat((mid + half + step).toPrecision(8)), parseFloat(base.toPrecision(6))]);
    }

    if (this.inEvent) {
      const thin = () => rand(0.3, 0.7);
      if (this.eventDir === 1) asks.forEach(a => a[1] *= thin());
      else                     bids.forEach(b => b[1] *= thin());
    }

    for (const cb of this.bookCallbacks) cb({ bids, asks, timestamp: Date.now() });
  }
}

// ---------------------------------------------------------------------------
// CoinbaseFeed  (exported as LiquidTap for drop-in compatibility)
// ---------------------------------------------------------------------------
export class LiquidTap {
  constructor() {
    this._tradeCallbacks = {};   // productId -> [fn]
    this._bookCallbacks  = {};   // productId -> [fn]
    this._simPairs       = {};   // productId -> SimulatedPair
    this._simMode        = process.env.FORCE_SIMULATION === 'true';

    // One shared WebSocket connection for all pairs
    this._ws             = null;
    this._wsReady        = false;
    this._pendingSubs    = new Set();   // pairs not yet subscribed
    this._books          = {};          // productId -> { bids: Map<price,qty>, asks: Map<price,qty> }
    this._reconnectDelay = 2000;
    this._connecting     = false;
    this._destroyed      = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  connect(productId) {
    if (this._simMode) { this._startSimulation(productId); return; }

    // Register pair for subscription
    this._pendingSubs.add(productId);
    this._books[productId] = { bids: new Map(), asks: new Map() };

    // Open shared connection on first call
    if (!this._ws && !this._connecting) this._openConnection();
    else if (this._wsReady)             this._subscribePending();
  }

  onTrade(productId, callback) {
    if (!this._tradeCallbacks[productId]) this._tradeCallbacks[productId] = [];
    this._tradeCallbacks[productId].push(callback);
    if (this._simPairs[productId]) this._simPairs[productId].tradeCallbacks = this._tradeCallbacks[productId];
  }

  onBookUpdate(productId, callback) {
    if (!this._bookCallbacks[productId]) this._bookCallbacks[productId] = [];
    this._bookCallbacks[productId].push(callback);
    if (this._simPairs[productId]) this._simPairs[productId].bookCallbacks = this._bookCallbacks[productId];
  }

  disconnect(productId) {
    if (this._simPairs[productId]) { this._simPairs[productId].stop(); delete this._simPairs[productId]; }
    delete this._tradeCallbacks[productId];
    delete this._bookCallbacks[productId];
    delete this._books[productId];
    this._pendingSubs.delete(productId);
  }

  isSimulating(productId) { return !!this._simPairs[productId]; }

  // ── WebSocket management ──────────────────────────────────────────────────

  _openConnection() {
    if (this._destroyed) return;
    this._connecting = true;

    let ws;
    try { ws = new WebSocket(COINBASE_WS_URL); }
    catch (err) {
      console.warn(`[Coinbase] Could not create WebSocket: ${err.message}. Falling back to simulation.`);
      this._fallbackAll();
      return;
    }

    this._ws = ws;

    const timeout = setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn('[Coinbase] Connection timeout. Falling back to simulation.');
        ws.terminate();
        this._fallbackAll();
      }
    }, 10000);

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log('[Coinbase] WebSocket connected.');
      this._wsReady    = true;
      this._connecting = false;
      this._reconnectDelay = 2000;
      this._subscribePending();
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      this._handleMessage(msg);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      console.warn(`[Coinbase] WS error: ${err.message}`);
    });

    ws.on('close', () => {
      this._wsReady    = false;
      this._ws         = null;
      this._connecting = false;
      console.warn(`[Coinbase] WS closed. Reconnecting in ${this._reconnectDelay}ms…`);
      // Re-queue all active pairs for resubscription
      for (const pid of Object.keys(this._books)) this._pendingSubs.add(pid);
      setTimeout(() => this._openConnection(), this._reconnectDelay);
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
    });
  }

  _subscribePending() {
    if (!this._wsReady || this._pendingSubs.size === 0) return;
    const ids = [...this._pendingSubs];
    this._pendingSubs.clear();

    console.log(`[Coinbase] Subscribing to: ${ids.join(', ')}`);

    // Subscribe to trades
    this._ws.send(JSON.stringify({
      type:        'subscribe',
      channel:     'market_trades',
      product_ids: ids,
    }));

    // Subscribe to level2 order book
    this._ws.send(JSON.stringify({
      type:        'subscribe',
      channel:     'level2',
      product_ids: ids,
    }));
  }

  // ── Message parsing ───────────────────────────────────────────────────────

  _handleMessage(msg) {
    const ch = msg.channel;

    if (ch === 'market_trades') {
      for (const event of (msg.events ?? [])) {
        for (const trade of (event.trades ?? [])) {
          const productId = trade.product_id;
          const price     = parseFloat(trade.price);
          const qty       = parseFloat(trade.size);
          const side      = (trade.side ?? '').toLowerCase();  // 'BUY' or 'SELL' → lowercase
          if (!productId || isNaN(price) || isNaN(qty)) continue;

          const t = {
            price,
            qty,
            takerSide: side === 'buy' ? 'buy' : 'sell',
            timestamp: trade.time ? new Date(trade.time).getTime() : Date.now(),
          };
          for (const cb of (this._tradeCallbacks[productId] ?? [])) cb(t);
        }
      }
      return;
    }

    if (ch === 'l2_data') {
      for (const event of (msg.events ?? [])) {
        const productId = event.product_id;
        if (!productId || !this._books[productId]) continue;

        const book = this._books[productId];

        if (event.type === 'snapshot') {
          // Full replace
          book.bids.clear();
          book.asks.clear();
        }

        for (const u of (event.updates ?? [])) {
          const price = parseFloat(u.price_level);
          const qty   = parseFloat(u.new_quantity);
          if (isNaN(price) || isNaN(qty)) continue;

          const side = u.side === 'bid' ? book.bids : book.asks;
          if (qty === 0) side.delete(price);
          else           side.set(price, qty);
        }

        this._emitBook(productId);
      }
      return;
    }

    // Subscriptions-confirmed, heartbeats, etc. — ignore
  }

  _emitBook(productId) {
    const book = this._books[productId];
    if (!book) return;

    // Sort bids descending, asks ascending; emit top 10 each
    const bids = [...book.bids.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, 10);
    const asks = [...book.asks.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 10);

    if (bids.length === 0 && asks.length === 0) return;

    for (const cb of (this._bookCallbacks[productId] ?? [])) cb({ bids, asks, timestamp: Date.now() });
  }

  // ── Simulation fallback ───────────────────────────────────────────────────

  _fallbackAll() {
    this._connecting = false;
    for (const pid of [...this._pendingSubs, ...Object.keys(this._books)]) {
      this._startSimulation(pid);
    }
    this._pendingSubs.clear();
  }

  _startSimulation(productId) {
    if (this._simPairs[productId]) return;
    const cfg = SIM_CONFIG[productId];
    if (!cfg) { console.warn(`[Coinbase] No sim config for ${productId}`); return; }

    console.log(`[Coinbase] Starting simulation for ${productId}`);
    const sim = new SimulatedPair(productId, cfg);
    sim.tradeCallbacks = this._tradeCallbacks[productId] ?? [];
    sim.bookCallbacks  = this._bookCallbacks[productId]  ?? [];
    this._simPairs[productId] = sim;
    sim.start();
  }
}
