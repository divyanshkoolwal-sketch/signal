/**
 * VPIN – Volume-synchronized Probability of Informed Trading
 *
 * VPIN = (1/n) * Σ |V_B_i - V_S_i| / V_bucket
 * where n = number of buckets (last 50 by default)
 *
 * Reference: Easley, Lopez de Prado, O'Hara (2012)
 */

/**
 * Compute VPIN from completed volume buckets.
 *
 * @param {Array<{ buyVol: number, sellVol: number, volume: number }>} buckets
 * @param {number} window  - number of buckets to use (default 50)
 * @returns {number} VPIN in [0, 1]
 */
export function computeVPIN(buckets, window = 50) {
  if (!buckets || buckets.length === 0) return 0;

  const slice = buckets.slice(-window);
  if (slice.length === 0) return 0;

  let totalImbalance = 0;
  let totalVolume = 0;

  for (const bucket of slice) {
    const buyVol  = bucket.buyVol  ?? 0;
    const sellVol = bucket.sellVol ?? 0;
    const vol     = bucket.volume  ?? (buyVol + sellVol);

    if (vol > 0) {
      totalImbalance += Math.abs(buyVol - sellVol);
      totalVolume    += vol;
    }
  }

  if (totalVolume === 0) return 0;

  const vpin = totalImbalance / totalVolume;
  return Math.max(0, Math.min(1, vpin));
}

/**
 * Compute VPIN trend – first derivative of VPIN over the last `window` readings.
 * Returns the average slope (change per reading) over the window.
 *
 * @param {number[]} vpinHistory  - array of VPIN values, newest last
 * @param {number}   window       - how many recent values to look at (default 5)
 * @returns {number} slope (positive = rising, negative = falling)
 */
export function computeVPINTrend(vpinHistory, window = 5) {
  if (!vpinHistory || vpinHistory.length < 2) return 0;

  const slice = vpinHistory.slice(-window);
  if (slice.length < 2) return 0;

  // Simple linear regression slope
  const n = slice.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX  += i;
    sumY  += slice[i];
    sumXY += i * slice[i];
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;

  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Compute VPIN acceleration – second derivative.
 * Computes the slope of two consecutive trend windows and returns the difference.
 *
 * @param {number[]} vpinHistory  - array of VPIN values, newest last
 * @param {number}   window       - sub-window for each trend (default 5)
 * @returns {number} acceleration
 */
export function computeVPINAcceleration(vpinHistory, window = 5) {
  if (!vpinHistory || vpinHistory.length < window * 2) return 0;

  const recent = vpinHistory.slice(-window);
  const prior  = vpinHistory.slice(-(window * 2), -window);

  const trendRecent = computeVPINTrend(recent, window);
  const trendPrior  = computeVPINTrend(prior,  window);

  return trendRecent - trendPrior;
}
