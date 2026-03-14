/**
 * Trade Aggression Ratio (TAR)
 *
 * TAR = count(market orders) / total trades
 *
 * In Liquid's data model every trade has a `takerSide` ('buy' | 'sell').
 * All trades are already market-order aggressions (taker hits resting limit).
 * So TAR here measures DIRECTIONAL aggression: what fraction of the recent
 * flow is buy-side aggressive vs sell-side aggressive.
 *
 * TAR = buyAggression / (buyAggression + sellAggression)
 *     = count(takerSide === 'buy') / total trades
 *
 * Returns 0-1 where:
 *   ~0.5 = balanced / indeterminate
 *   >0.65 = buy-aggressive (informed buying)
 *   <0.35 = sell-aggressive (informed selling)
 *
 * We take the MAXIMUM of buy-aggression and sell-aggression fractions so that
 * TAR represents overall directional aggression regardless of direction,
 * which is what the phase classifier needs.
 */

/**
 * Compute Trade Aggression Ratio from the last `window` trades.
 *
 * @param {Array<{ takerSide: string }>} recentTrades - newest last (or any order)
 * @param {number} window  - number of trades to use (default 200)
 * @returns {number} TAR in [0, 1]
 */
export function computeTAR(recentTrades, window = 200) {
  if (!recentTrades || recentTrades.length === 0) return 0.5;

  const slice = recentTrades.slice(-window);
  const total = slice.length;
  if (total === 0) return 0.5;

  const buyCount = slice.filter(t => {
    const side = (t.takerSide || t.side || '').toLowerCase();
    return side === 'buy' || side === 'b';
  }).length;

  const sellCount = total - buyCount;

  // Directional aggression: fraction of dominant side
  const buyFrac  = buyCount  / total;
  const sellFrac = sellCount / total;

  // Return the dominant fraction (measures how one-sided the aggression is)
  return Math.max(buyFrac, sellFrac);
}

/**
 * Compute raw directional TAR (buy-side fraction, not clamped to dominant side).
 * Useful for knowing the direction of aggression.
 *
 * @param {Array<{ takerSide: string }>} recentTrades
 * @param {number} window
 * @returns {number} buy-fraction in [0, 1]
 */
export function computeDirectionalTAR(recentTrades, window = 200) {
  if (!recentTrades || recentTrades.length === 0) return 0.5;

  const slice = recentTrades.slice(-window);
  const total = slice.length;
  if (total === 0) return 0.5;

  const buyCount = slice.filter(t => {
    const side = (t.takerSide || t.side || '').toLowerCase();
    return side === 'buy' || side === 'b';
  }).length;

  return buyCount / total;
}
