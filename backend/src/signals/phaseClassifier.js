/**
 * Phase Classifier – rule-based scoring grid
 *
 * Each of 6 signals contributes 0-3 points → composite score 0-18.
 *
 * Scoring grid:
 *   VPIN:
 *     <0.35         → 0 pts
 *     0.35-0.45     → 1 pt
 *     0.45-0.55     → 2 pts
 *     >0.55         → 3 pts
 *
 *   VPIN trend (positive = rising):
 *     negative      → 0 pts
 *     0-0.02        → 1 pt
 *     0.02-0.05     → 2 pts
 *     >0.05         → 3 pts
 *
 *   OFI (absolute value):
 *     <0.2          → 0 pts
 *     0.2-0.4       → 1 pt
 *     0.4-0.7       → 2 pts
 *     >0.7          → 3 pts
 *
 *   ASC percentile:
 *     <40           → 0 pts
 *     40-60         → 1 pt
 *     60-75         → 2 pts
 *     >75           → 3 pts
 *
 *   TAR:
 *     <0.45         → 0 pts
 *     0.45-0.55     → 1 pt
 *     0.55-0.65     → 2 pts
 *     >0.65         → 3 pts
 *
 *   VVI:
 *     <1.0          → 0 pts
 *     1.0-1.5       → 1 pt
 *     1.5-3.0       → 2 pts
 *     >3.0          → 3 pts
 *
 * Phase assignment:
 *   0-5   → Phase 1 (Accumulation)
 *   6-11  → Phase 2 (Ignition)
 *   12-15 → Phase 3 (Propagation)
 *   16-18 → Phase 4 (Exhaustion)
 *
 * Hysteresis: 3 consecutive cycles required for phase transition.
 */

export const PHASE_LABELS = {
  1: 'ACCUMULATION',
  2: 'IGNITION',
  3: 'PROPAGATION',
  4: 'EXHAUSTION',
};

// Score thresholds per phase (inclusive lower bound)
const PHASE_THRESHOLDS = [
  { phase: 4, min: 16 },
  { phase: 3, min: 12 },
  { phase: 2, min: 6  },
  { phase: 1, min: 0  },
];

function scoreVPIN(vpin) {
  if (vpin > 0.55) return 3;
  if (vpin > 0.45) return 2;
  if (vpin > 0.35) return 1;
  return 0;
}

function scoreVPINTrend(trend) {
  if (trend > 0.05) return 3;
  if (trend > 0.02) return 2;
  if (trend > 0)    return 1;
  return 0;
}

function scoreOFI(ofi) {
  const abs = Math.abs(ofi);
  if (abs > 0.7) return 3;
  if (abs > 0.4) return 2;
  if (abs > 0.2) return 1;
  return 0;
}

function scoreASCPercentile(pct) {
  if (pct > 75) return 3;
  if (pct > 60) return 2;
  if (pct > 40) return 1;
  return 0;
}

function scoreTAR(tar) {
  if (tar > 0.65) return 3;
  if (tar > 0.55) return 2;
  if (tar > 0.45) return 1;
  return 0;
}

function scoreVVI(vvi) {
  if (vvi > 3.0) return 3;
  if (vvi > 1.5) return 2;
  if (vvi > 1.0) return 1;
  return 0;
}

/**
 * Compute composite phase score from signal values.
 *
 * @param {{ vpin, vpinTrend, ofi, ascPercentile, tar, vvi }} signals
 * @returns {number} score in [0, 18]
 */
export function computePhaseScore(signals) {
  const { vpin = 0, vpinTrend = 0, ofi = 0, ascPercentile = 0, tar = 0, vvi = 1 } = signals;

  const score =
    scoreVPIN(vpin)            +
    scoreVPINTrend(vpinTrend)  +
    scoreOFI(ofi)              +
    scoreASCPercentile(ascPercentile) +
    scoreTAR(tar)              +
    scoreVVI(vvi);

  return Math.min(18, Math.max(0, score));
}

/**
 * Classify phase from score with hysteresis.
 *
 * @param {number}   score              - current composite score
 * @param {number}   currentPhase       - current phase (1-4)
 * @param {object}   hysteresisBuffer   - mutable buffer: { pendingPhase, count }
 * @returns {{ phase: number, hysteresisBuffer: object }}
 */
export function classifyPhase(score, currentPhase, hysteresisBuffer) {
  const buf = hysteresisBuffer ?? { pendingPhase: currentPhase, count: 0 };

  // Find target phase from score
  let targetPhase = 1;
  for (const { phase, min } of PHASE_THRESHOLDS) {
    if (score >= min) {
      targetPhase = phase;
      break;
    }
  }

  if (targetPhase === currentPhase) {
    // Reset hysteresis buffer when signal matches current phase
    buf.pendingPhase = currentPhase;
    buf.count = 0;
    return { phase: currentPhase, hysteresisBuffer: buf };
  }

  // Accumulate hysteresis count for the pending phase
  if (buf.pendingPhase === targetPhase) {
    buf.count += 1;
  } else {
    buf.pendingPhase = targetPhase;
    buf.count = 1;
  }

  if (buf.count >= 3) {
    // Commit transition
    buf.count = 0;
    return { phase: targetPhase, hysteresisBuffer: buf };
  }

  // Hold current phase
  return { phase: currentPhase, hysteresisBuffer: buf };
}

/**
 * Compute phase confidence (0-100) based on how centrally the score falls in its range.
 *
 * @param {number} score
 * @param {number} phase
 * @returns {number} confidence in [0, 100]
 */
export function computeConfidence(score, phase) {
  const ranges = {
    1: { min: 0,  max: 5  },
    2: { min: 6,  max: 11 },
    3: { min: 12, max: 15 },
    4: { min: 16, max: 18 },
  };

  const range = ranges[phase];
  if (!range) return 50;

  const span = range.max - range.min;
  if (span === 0) return 100;

  // Confidence is highest in the center of the range
  const center = (range.min + range.max) / 2;
  const distance = Math.abs(score - center);
  const normalizedDist = distance / (span / 2);  // 0 = center, 1 = edge

  // Map to 50-100: center → 100, edge → 50
  const confidence = Math.round(100 - 50 * normalizedDist);
  return Math.max(0, Math.min(100, confidence));
}
