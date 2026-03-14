/**
 * MarketEngine – per-pair market state manager
 *
 * Manages:
 *  - Incoming trade/book data from LiquidTap
 *  - Volume bucket construction
 *  - Full signal pipeline execution every 2 seconds
 *  - Phase classification with hysteresis
 *  - State broadcast via registered callbacks
 */

import { classifyBucket, computeSigma }       from './signals/bvc.js';
import { computeVPIN, computeVPINTrend, computeVPINAcceleration } from './signals/vpin.js';
import { computeOFI }                          from './signals/ofi.js';
import { computeSpreadDecomposition }          from './signals/spread.js';
import { computeTAR }                          from './signals/tar.js';
import { computeVVI }                          from './signals/vvi.js';
import {
  computePhaseScore,
  classifyPhase,
  computeConfidence,
  PHASE_LABELS,
} from './signals/phaseClassifier.js';

// Default pairs — Coinbase product_id format
const DEFAULT_PAIRS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD', 'ETH-BTC'];

// Target bucket volume per pair (roughly calibrated to ~1000 "units")
const TARGET_BUCKET_VOLUME = {
  'BTC-USD':  0.5,
  'ETH-USD':  5,
  'SOL-USD':  50,
  'XRP-USD':  5000,
  'DOGE-USD': 20000,
  'ETH-BTC':  5,
};

const TRADE_BUFFER_MAX  = 500;
const BUCKET_BUFFER_MAX = 50;
const METRIC_HISTORY_MAX = 300;
const SPREAD_HISTORY_MAX = 200;
const VPIN_HISTORY_MAX   = 100;

const PIPELINE_INTERVAL_MS = 2000;

// ---------------------------------------------------------------------------
// Per-pair state factory
// ---------------------------------------------------------------------------
function createPairState(pair) {
  return {
    pair,
    tradeBuffer:          [],
    volumeBuckets:        [],
    orderBook:            { bids: [], asks: [], timestamp: Date.now() },
    previousBook:         null,   // snapshot from previous pipeline cycle (2s ago)
    lastPipelineBook:     null,   // set at start of each pipeline run, becomes previousBook next run
    metricHistory:        [],
    spreadHistory:        [],
    vpinHistory:          [],
    ofiMaxAbs:            0,
    currentVolumeBucket:  {
      volume:     0,
      buyVol:     0,
      sellVol:    0,
      priceOpen:  null,
      priceClose: null,
      tradeCount: 0,
      startTime:  Date.now(),
    },
    targetBucketVolume:   TARGET_BUCKET_VOLUME[pair] ?? 1000,

    // Phase tracking
    phase:         1,
    phaseLabel:    PHASE_LABELS[1],
    phaseStart:    Date.now(),
    previousPhase: 1,
    hysteresisBuffer: { pendingPhase: 1, count: 0 },

    // Latest signals (cached for broadcast)
    signals: {
      vpin:             0.2,
      vpinTrend:        0,
      vpinAcceleration: 0,
      ofi:              0,
      asc:              0,
      ascPercentile:    50,
      tar:              0.5,
      vvi:              1,
      compositeScore:   0,
    },
    price:         null,
    price24hOpen:  null,
  };
}

// ---------------------------------------------------------------------------
// MarketEngine
// ---------------------------------------------------------------------------
export class MarketEngine {
  constructor(liquidTap) {
    this._tap       = liquidTap;
    this._states    = {};   // pair -> state
    this._callbacks = [];   // onStateUpdate callbacks
    this._timers    = {};   // pair -> interval id
  }

  /**
   * Start processing for all default pairs.
   */
  start() {
    for (const pair of DEFAULT_PAIRS) {
      this._initPair(pair);
    }
  }

  _initPair(pair) {
    const state = createPairState(pair);
    this._states[pair] = state;

    // Register trade handler
    this._tap.onTrade(pair, (trade) => {
      this._onTrade(pair, trade);
    });

    // Register book handler
    this._tap.onBookUpdate(pair, (book) => {
      this._onBook(pair, book);
    });

    // Connect (or start simulation)
    this._tap.connect(pair);

    // Start pipeline timer
    this._timers[pair] = setInterval(() => {
      this._runPipeline(pair);
    }, PIPELINE_INTERVAL_MS);

    // Stagger initial pipeline run slightly per pair
    const idx = DEFAULT_PAIRS.indexOf(pair);
    setTimeout(() => this._runPipeline(pair), 500 + idx * 100);
  }

  // ---------------------------------------------------------------------------
  // Data ingestion
  // ---------------------------------------------------------------------------

  _onTrade(pair, trade) {
    const state = this._states[pair];
    if (!state) return;

    // Update circular trade buffer
    state.tradeBuffer.push(trade);
    if (state.tradeBuffer.length > TRADE_BUFFER_MAX) {
      state.tradeBuffer.shift();
    }

    // Update current price
    state.price = trade.price;
    if (!state.price24hOpen) state.price24hOpen = trade.price;

    // Feed volume bucket
    const bucket = state.currentVolumeBucket;
    if (bucket.priceOpen === null) bucket.priceOpen = trade.price;
    bucket.priceClose = trade.price;
    bucket.volume    += trade.qty;
    bucket.tradeCount += 1;

    // Check if bucket is complete
    if (bucket.volume >= state.targetBucketVolume) {
      this._completeBucket(pair);
    }
  }

  _onBook(pair, book) {
    const state = this._states[pair];
    if (!state) return;
    // Only update the live book — previousBook is managed by the pipeline
    // so OFI always diffs across a full 2-second window, not 100ms increments
    state.orderBook = book;
  }

  _completeBucket(pair) {
    const state  = this._states[pair];
    const bucket = state.currentVolumeBucket;

    // Classify bucket with BVC
    const sigma   = computeSigma(state.volumeBuckets);
    const deltaP  = (bucket.priceClose ?? 0) - (bucket.priceOpen ?? 0);
    const { buyVol, sellVol } = classifyBucket(deltaP, sigma, bucket.volume);

    const completed = {
      volume:     bucket.volume,
      buyVol,
      sellVol,
      priceOpen:  bucket.priceOpen,
      priceClose: bucket.priceClose,
      tradeCount: bucket.tradeCount,
      startTime:  bucket.startTime,
      endTime:    Date.now(),
    };

    state.volumeBuckets.push(completed);
    if (state.volumeBuckets.length > BUCKET_BUFFER_MAX) {
      state.volumeBuckets.shift();
    }

    // Reset current bucket
    state.currentVolumeBucket = {
      volume:     0,
      buyVol:     0,
      sellVol:    0,
      priceOpen:  null,
      priceClose: null,
      tradeCount: 0,
      startTime:  Date.now(),
    };
  }

  // ---------------------------------------------------------------------------
  // Signal pipeline
  // ---------------------------------------------------------------------------

  _runPipeline(pair) {
    const state = this._states[pair];
    if (!state || state.price === null) return;

    const now = Date.now();

    // 1. VPIN
    const vpin = computeVPIN(state.volumeBuckets);
    state.vpinHistory.push(vpin);
    if (state.vpinHistory.length > VPIN_HISTORY_MAX) state.vpinHistory.shift();

    const vpinTrend        = computeVPINTrend(state.vpinHistory);
    const vpinAcceleration = computeVPINAcceleration(state.vpinHistory);

    // 2. OFI — diff current book against the snapshot from 2 seconds ago
    const { ofi, rawOFI } = computeOFI(
      state.orderBook,
      state.previousBook,   // set at end of last pipeline run
      state.ofiMaxAbs,
    );
    // Always update rolling max with EMA so normalization calibrates quickly
    state.ofiMaxAbs = state.ofiMaxAbs === 0
      ? Math.abs(rawOFI)
      : state.ofiMaxAbs * 0.95 + Math.abs(rawOFI) * 0.05;

    // Snapshot current book NOW — becomes previousBook on the next cycle
    state.previousBook = {
      bids: state.orderBook.bids.slice(),
      asks: state.orderBook.asks.slice(),
    };

    // 3. Spread decomposition
    let spread = 0;
    let midPrice = state.price ?? 0;
    if (state.orderBook.bids.length > 0 && state.orderBook.asks.length > 0) {
      const bestBid = state.orderBook.bids[0][0];
      const bestAsk = state.orderBook.asks[0][0];
      spread = Math.max(0, bestAsk - bestBid);
      midPrice = (bestBid + bestAsk) / 2;
    }

    state.spreadHistory.push(spread);
    if (state.spreadHistory.length > SPREAD_HISTORY_MAX) state.spreadHistory.shift();

    const sigma = computeSigma(state.volumeBuckets);
    const { opc, irc, asc, ascPercentile } = computeSpreadDecomposition(
      spread,
      midPrice,
      state.spreadHistory,
      sigma,
    );

    // 4. TAR
    const tar = computeTAR(state.tradeBuffer);

    // 5. VVI
    const vvi = computeVVI(state.tradeBuffer);

    // 6. Composite score & phase classification
    const signals = { vpin, vpinTrend, ofi, ascPercentile, tar, vvi };
    const score   = computePhaseScore(signals);

    const { phase, hysteresisBuffer } = classifyPhase(
      score,
      state.phase,
      state.hysteresisBuffer,
    );
    state.hysteresisBuffer = hysteresisBuffer;

    const previousPhase = state.phase;
    const phaseChanged  = phase !== state.phase;

    if (phaseChanged) {
      state.previousPhase = state.phase;
      state.phase         = phase;
      state.phaseLabel    = PHASE_LABELS[phase];
      state.phaseStart    = now;
    }

    const phaseConfidence = computeConfidence(score, phase);

    // Update cached signals
    state.signals = {
      vpin,
      vpinTrend,
      vpinAcceleration,
      ofi,
      asc,
      ascPercentile,
      tar,
      vvi,
      compositeScore: score,
    };

    // Append to metric history (for frontend timeline)
    const reading = {
      timestamp:     now,
      vpin,
      vpinTrend,
      ofi,
      asc,
      ascPercentile,
      tar,
      vvi,
      score,
      phase,
    };
    state.metricHistory.push(reading);
    if (state.metricHistory.length > METRIC_HISTORY_MAX) state.metricHistory.shift();

    // Build broadcast object
    const priceChange24h = state.price24hOpen
      ? ((state.price - state.price24hOpen) / state.price24hOpen) * 100
      : 0;

    const marketState = {
      pair,
      timestamp:   now,
      price:       state.price,
      priceChange24h,
      signals:     state.signals,
      phase,
      phaseLabel:  PHASE_LABELS[phase],
      phaseConfidence,
      phaseStartTime:          state.phaseStart,
      phaseDurationMs:         now - state.phaseStart,
      typicalPhaseDurationMs:  this._estimateTypicalDuration(state, phase),
      previousPhase:           state.previousPhase,
      orderBook: {
        bids: (state.orderBook.bids ?? []).slice(0, 10),
        asks: (state.orderBook.asks ?? []).slice(0, 10),
      },
      recentTrades:  state.tradeBuffer.slice(-30),
      metricHistory: state.metricHistory.slice(-300),
      spread,
      asc,
    };

    // Notify all registered callbacks
    for (const cb of this._callbacks) {
      try {
        cb(pair, marketState, phaseChanged ? { from: previousPhase, to: phase } : null);
      } catch (err) {
        console.error('[MarketEngine] Callback error:', err);
      }
    }
  }

  _estimateTypicalDuration(state, phase) {
    // Look at metricHistory for recent duration in this phase
    const history  = state.metricHistory;
    let durations  = [];
    let startIdx   = -1;

    for (let i = 0; i < history.length; i++) {
      if (history[i].phase === phase) {
        if (startIdx === -1) startIdx = i;
      } else {
        if (startIdx !== -1) {
          durations.push((history[i].timestamp - history[startIdx].timestamp));
          startIdx = -1;
        }
      }
    }

    if (durations.length === 0) {
      // Default estimates per phase
      return [120000, 180000, 300000, 120000][phase - 1] ?? 180000;
    }

    return Math.round(durations.reduce((s, d) => s + d, 0) / durations.length);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Register a callback invoked whenever any pair's state is updated.
   * @param {function} callback - (pair, state, phaseTransition | null) => void
   */
  onStateUpdate(callback) {
    this._callbacks.push(callback);
  }

  /**
   * Get current market state for a specific pair.
   */
  getState(pair) {
    return this._buildStateSnapshot(pair);
  }

  /**
   * Get all current market states.
   */
  getAllStates() {
    const result = {};
    for (const pair of DEFAULT_PAIRS) {
      result[pair] = this._buildStateSnapshot(pair);
    }
    return result;
  }

  _buildStateSnapshot(pair) {
    const state = this._states[pair];
    if (!state) return null;

    const now = Date.now();
    const priceChange24h = state.price24hOpen && state.price
      ? ((state.price - state.price24hOpen) / state.price24hOpen) * 100
      : 0;

    return {
      pair,
      timestamp:   now,
      price:       state.price,
      priceChange24h,
      signals:     { ...state.signals },
      phase:       state.phase,
      phaseLabel:  PHASE_LABELS[state.phase],
      phaseConfidence: computeConfidence(state.signals.compositeScore ?? 0, state.phase),
      phaseStartTime:      state.phaseStart,
      phaseDurationMs:     now - state.phaseStart,
      typicalPhaseDurationMs: this._estimateTypicalDuration(state, state.phase),
      previousPhase:       state.previousPhase,
      orderBook: {
        bids: (state.orderBook.bids ?? []).slice(0, 10),
        asks: (state.orderBook.asks ?? []).slice(0, 10),
      },
      recentTrades:  state.tradeBuffer.slice(-30),
      metricHistory: state.metricHistory.slice(-300),
      spread: state.spreadHistory.at(-1) ?? 0,
      asc:    state.signals.asc ?? 0,
    };
  }

  getPairs() {
    return DEFAULT_PAIRS;
  }
}
