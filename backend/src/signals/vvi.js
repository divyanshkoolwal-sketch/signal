/**
 * Volume Velocity Index (VVI)
 *
 * VVI = current_volume_rate / baseline_volume_rate
 *
 * current   = volume traded in the last 5 minutes
 * baseline  = average 5-minute volume computed over the last 30 minutes (6 windows)
 *
 * VVI = 1.0 means current pace matches the 30-minute average.
 * VVI > 1.0 means accelerating volume.
 * VVI < 1.0 means declining volume.
 */

const CURRENT_WINDOW_MS  = 5  * 60 * 1000;  // 5 min
const BASELINE_WINDOW_MS = 30 * 60 * 1000;  // 30 min
const BUCKET_COUNT       = 6;               // 30 min / 5 min

/**
 * Compute Volume Velocity Index from the trade buffer.
 *
 * @param {Array<{ qty: number, timestamp: number }>} tradeBuffer
 * @returns {number} VVI (1.0 = baseline pace)
 */
export function computeVVI(tradeBuffer) {
  if (!tradeBuffer || tradeBuffer.length === 0) return 1;

  const now = Date.now();

  // Current window volume
  const currentCutoff = now - CURRENT_WINDOW_MS;
  const currentVol = tradeBuffer
    .filter(t => (t.timestamp ?? 0) >= currentCutoff)
    .reduce((sum, t) => sum + (t.qty ?? t.size ?? 0), 0);

  // Baseline: compute per-5-min volumes across last 30 min, then average
  const baselineCutoff = now - BASELINE_WINDOW_MS;
  const baselineTrades = tradeBuffer.filter(t => (t.timestamp ?? 0) >= baselineCutoff);

  if (baselineTrades.length === 0) return 1;

  // Bin into BUCKET_COUNT windows of CURRENT_WINDOW_MS each
  const buckets = new Array(BUCKET_COUNT).fill(0);
  for (const t of baselineTrades) {
    const age = now - (t.timestamp ?? now);
    const bucketIdx = Math.min(
      BUCKET_COUNT - 1,
      Math.floor(age / CURRENT_WINDOW_MS)
    );
    buckets[bucketIdx] += t.qty ?? t.size ?? 0;
  }

  // Average only non-zero buckets (avoid deflation from incomplete history)
  const nonZero = buckets.filter(v => v > 0);
  if (nonZero.length === 0) return 1;

  const baselineVol = nonZero.reduce((s, v) => s + v, 0) / nonZero.length;

  if (baselineVol === 0) return 1;

  return currentVol / baselineVol;
}
