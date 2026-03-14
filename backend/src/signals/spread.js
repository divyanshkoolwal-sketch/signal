/**
 * Spread Decomposition
 *
 * Total spread = OPC + IRC + ASC
 *
 * Works in RELATIVE spread (spread / mid_price) to be comparable across
 * pairs and meaningful for tight-spread markets like BTC on Coinbase.
 *
 * OPC = 5th percentile of relative spread history
 *   (the "normal" tight spread — not the absolute minimum)
 *
 * IRC = sigma_rel * sqrt(avgHoldingTimeSec / 86400)
 *   where sigma_rel = per-bucket price std-dev expressed as fraction of price
 *
 * ASC = current_rel_spread - OPC - IRC  (floored at 0)
 *   High ASC = spread is wider than its typical baseline, implying market
 *   makers are charging for adverse selection risk right now.
 *
 * ASC percentile is ranked against the rolling ASC history.
 */

function percentileRank(arr, value) {
  if (!arr || arr.length === 0) return 50;
  const below = arr.filter(v => v < value).length;
  return Math.round((below / arr.length) * 100);
}

function percentileValue(arr, pct) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((pct / 100) * (sorted.length - 1));
  return sorted[Math.max(0, idx)];
}

/**
 * @param {number}   currentSpread   - absolute bid-ask spread in price units
 * @param {number}   midPrice        - current mid price
 * @param {number[]} spreadHistory   - recent absolute spread readings
 * @param {number}   sigma           - per-bucket price std-dev from BVC (absolute)
 * @param {object}   [opts]
 * @param {number}   [opts.avgHoldingTimeSec=300]
 * @param {number}   [opts.opcPercentile=5]   percentile used for OPC baseline
 * @returns {{ opc, irc, asc, ascPercentile }}
 */
export function computeSpreadDecomposition(currentSpread, midPrice, spreadHistory, sigma, opts = {}) {
  const { avgHoldingTimeSec = 300, opcPercentile = 5 } = opts;

  if (!midPrice || midPrice <= 0) {
    return { opc: 0, irc: 0, asc: 0, ascPercentile: 0 };
  }

  // Convert to relative spread
  const relSpread = currentSpread / midPrice;
  const relHistory = (spreadHistory ?? []).map(s => s / midPrice);

  // OPC: 5th percentile of relative spread (baseline transaction cost)
  const opc = relHistory.length >= 10
    ? percentileValue(relHistory, opcPercentile)
    : relSpread * 0.8;

  // IRC: inventory risk — scale sigma to relative terms
  const sigmaRel = sigma > 0 && midPrice > 0 ? sigma / midPrice : 0;
  const irc = sigmaRel * Math.sqrt(avgHoldingTimeSec / 86400);

  // ASC: adverse selection residual
  const asc = Math.max(0, relSpread - opc - irc);

  // ASC percentile against rolling ASC history
  const ascHistory = relHistory.map(rs => Math.max(0, rs - opc - irc));
  const ascPercentile = percentileRank(ascHistory, asc);

  return { opc, irc, asc, ascPercentile };
}
