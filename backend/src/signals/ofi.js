/**
 * Multi-level Order Flow Imbalance (OFI)
 *
 * Reference: Cont, Kukanov, Stoikov (2014)
 *
 * For each depth level k (1..K):
 *   e_bid_k = ΔQ_bid_k if price unchanged, +Q_bid_k if price improved, -Q_bid_prev_k if price worsened
 *   e_ask_k = symmetric
 *   OFI_k   = e_bid_k - e_ask_k
 *
 * Multi-level aggregation with exponential decay weighting:
 *   w_k = exp(-0.1 * k)
 *   OFI  = Σ w_k * OFI_k
 *
 * Normalized to [-1, +1] using a rolling max-abs window.
 */

const DECAY = 0.1;
const LEVELS = 10;

/**
 * Compute the change contribution for one side of the book at level k.
 *
 * @param {[number,number]|undefined} current  - [price, qty] at level k now
 * @param {[number,number]|undefined} previous - [price, qty] at level k before
 * @param {'bid'|'ask'} side
 * @returns {number}
 */
function levelContribution(current, previous, side) {
  if (!previous) {
    // New level appeared
    return current ? current[1] : 0;
  }
  if (!current) {
    // Level disappeared
    return -previous[1];
  }

  const [curP, curQ]  = current;
  const [prevP, prevQ] = previous;

  if (side === 'bid') {
    if (curP > prevP) return  curQ;        // price improved (higher bid)
    if (curP < prevP) return -prevQ;       // price worsened (lower bid)
    return curQ - prevQ;                   // same price, qty change
  } else {
    // ask: improvement is lower price
    if (curP < prevP) return  curQ;        // price improved (lower ask)
    if (curP > prevP) return -prevQ;       // price worsened (higher ask)
    return curQ - prevQ;
  }
}

/**
 * Compute multi-level OFI.
 *
 * @param {{ bids: [number,number][], asks: [number,number][] }} currentBook
 * @param {{ bids: [number,number][], asks: [number,number][] }|null} previousBook
 * @param {number} maxAbsOFI  - running max for normalization; 0 or null = raw value
 * @returns {{ ofi: number, rawOFI: number, rawLevels: number[] }}
 */
export function computeOFI(currentBook, previousBook, maxAbsOFI = 0) {
  if (!currentBook || !currentBook.bids || !currentBook.asks) {
    return { ofi: 0, rawOFI: 0, rawLevels: [] };
  }

  const bids = currentBook.bids.slice(0, LEVELS);
  const asks = currentBook.asks.slice(0, LEVELS);
  const prevBids = previousBook?.bids?.slice(0, LEVELS) ?? [];
  const prevAsks = previousBook?.asks?.slice(0, LEVELS) ?? [];

  let weightedSum = 0;
  let weightTotal = 0;
  const rawLevels = [];

  for (let k = 0; k < LEVELS; k++) {
    const w = Math.exp(-DECAY * k);

    const eBid = levelContribution(bids[k], prevBids[k], 'bid');
    const eAsk = levelContribution(asks[k], prevAsks[k], 'ask');
    const ofiK = eBid - eAsk;

    rawLevels.push(ofiK);
    weightedSum += w * ofiK;
    weightTotal += w;
  }

  const rawOFI = weightTotal > 0 ? weightedSum / weightTotal : 0;

  // Normalize
  let ofi;
  if (maxAbsOFI > 0) {
    ofi = Math.max(-1, Math.min(1, rawOFI / maxAbsOFI));
  } else {
    // Soft-normalize using tanh when no historical max is available
    ofi = Math.tanh(rawOFI / 1000);
  }

  return { ofi, rawOFI, rawLevels };
}
