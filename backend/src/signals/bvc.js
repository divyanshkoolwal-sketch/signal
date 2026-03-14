/**
 * Bulk Volume Classification (BVC)
 * Estimates buy/sell volume split for a completed volume bucket.
 *
 * Reference: Easley, Lopez de Prado, O'Hara (2012)
 *   Z = CDF_normal(deltaP / sigma)
 *   Buy volume  = Z * totalVolume
 *   Sell volume = (1 - Z) * totalVolume
 */

/**
 * Approximation of the standard normal CDF using the Abramowitz & Stegun formula.
 * Max error ~1.5e-7.
 */
function normCDF(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const y = 1.0 - poly * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Classify a single completed volume bucket using BVC.
 *
 * @param {number} deltaP        - Price change during the bucket (close - open)
 * @param {number} sigma         - Standard deviation of price changes across buckets
 * @param {number} totalVolume   - Total volume in this bucket
 * @returns {{ buyVol: number, sellVol: number, z: number }}
 */
export function classifyBucket(deltaP, sigma, totalVolume) {
  if (!totalVolume || totalVolume <= 0) {
    return { buyVol: 0, sellVol: 0, z: 0.5 };
  }

  let z;
  if (!sigma || sigma <= 0) {
    // No sigma available: assume 50/50 split
    z = 0.5;
  } else {
    z = normCDF(deltaP / sigma);
  }

  // Clamp z to [0, 1] as a safety measure
  z = Math.max(0, Math.min(1, z));

  return {
    buyVol:  z * totalVolume,
    sellVol: (1 - z) * totalVolume,
    z,
  };
}

/**
 * Compute sigma (standard deviation) of price changes from completed buckets.
 * Uses the last `window` buckets (default 50).
 *
 * @param {Array<{ priceOpen: number, priceClose: number }>} buckets
 * @param {number} window
 * @returns {number} sigma
 */
export function computeSigma(buckets, window = 50) {
  if (!buckets || buckets.length < 2) return 0;

  const slice = buckets.slice(-window);
  const deltas = slice
    .filter(b => b.priceOpen != null && b.priceClose != null)
    .map(b => b.priceClose - b.priceOpen);

  if (deltas.length < 2) return 0;

  const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const variance = deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / (deltas.length - 1);
  return Math.sqrt(variance);
}
