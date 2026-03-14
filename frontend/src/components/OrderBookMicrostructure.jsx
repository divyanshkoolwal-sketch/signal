import React, { useMemo } from 'react'

function formatPrice(price) {
  if (price == null || isNaN(price)) return '-'
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(6)
}

function formatQty(qty) {
  if (qty == null || isNaN(qty)) return '-'
  if (qty >= 1000) return (qty / 1000).toFixed(1) + 'K'
  return Number(qty).toFixed(4)
}

export default function OrderBookMicrostructure({ orderBook }) {
  const { bids = [], asks = [] } = orderBook || {}

  // Limit to 10 levels each
  const bidLevels = bids.slice(0, 10)
  const askLevels = asks.slice(0, 10)

  const maxQty = useMemo(() => {
    const all = [...bidLevels, ...askLevels].map((l) => Number(l[1]) || 0)
    return Math.max(...all, 1)
  }, [bidLevels, askLevels])

  // Interleave: ask[0] (lowest ask) at top, bid[0] (highest bid) at bottom
  // Display: asks descending (index 9..0), then spread row, then bids (index 0..9)
  const asksDisplayed = [...askLevels].reverse()

  // Best bid/ask for spread
  const bestBid = bidLevels[0]?.[0]
  const bestAsk = askLevels[0]?.[0]
  const spread = bestBid && bestAsk
    ? (Number(bestAsk) - Number(bestBid)).toFixed(4)
    : null

  if (!orderBook || (bidLevels.length === 0 && askLevels.length === 0)) {
    return (
      <div className="orderbook-wrap">
        <div className="no-data-placeholder" style={{ fontSize: 10 }}>
          No order book data
        </div>
      </div>
    )
  }

  return (
    <div className="orderbook-wrap">
      <div className="orderbook-header">
        <span style={{ width: '35%' }}>BID QTY</span>
        <span style={{ flex: 1, textAlign: 'center' }}>PRICE</span>
        <span style={{ width: '35%', textAlign: 'right' }}>ASK QTY</span>
      </div>

      <div className="orderbook-rows">
        {/* Asks */}
        {asksDisplayed.map((ask, i) => {
          const qty = Number(ask[1]) || 0
          const pct = (qty / maxQty) * 50
          return (
            <div key={`ask-${i}`} className="orderbook-row">
              <div className="orderbook-ask-bar" style={{ left: '50%', width: `${pct}%` }} />
              <span className="orderbook-row-bid-qty" style={{ color: 'var(--text-dim)' }}>—</span>
              <span className="orderbook-row-price" style={{ color: 'var(--red)' }}>
                {formatPrice(ask[0])}
              </span>
              <span className="orderbook-row-ask-qty">{formatQty(ask[1])}</span>
            </div>
          )
        })}

        {/* Spread */}
        {spread && (
          <div className="orderbook-spread-row">
            SPREAD {spread}
          </div>
        )}

        {/* Bids */}
        {bidLevels.map((bid, i) => {
          const qty = Number(bid[1]) || 0
          const pct = (qty / maxQty) * 50
          return (
            <div key={`bid-${i}`} className="orderbook-row">
              <div
                className="orderbook-bid-bar"
                style={{ right: '50%', width: `${pct}%` }}
              />
              <span className="orderbook-row-bid-qty">{formatQty(bid[1])}</span>
              <span className="orderbook-row-price" style={{ color: 'var(--green)' }}>
                {formatPrice(bid[0])}
              </span>
              <span className="orderbook-row-ask-qty" style={{ color: 'var(--text-dim)' }}>—</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
