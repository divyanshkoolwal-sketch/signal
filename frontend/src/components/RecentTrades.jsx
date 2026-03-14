import React, { useRef, useEffect } from 'react'

function formatTime(ts) {
  if (!ts) return '--:--:--'
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatPrice(price) {
  if (price == null || isNaN(price)) return '-'
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(6)
}

function formatSize(size) {
  if (size == null || isNaN(size)) return '-'
  const n = Number(size)
  if (n >= 1000) return (n / 1000).toFixed(2) + 'K'
  return n.toFixed(4)
}

export default function RecentTrades({ trades }) {
  const listRef = useRef(null)

  // Auto-scroll to top on new trades (newest at top)
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [trades?.length])

  const displayTrades = trades ? [...trades].slice(0, 30) : []

  if (displayTrades.length === 0) {
    return (
      <div className="trades-wrap">
        <div className="trades-header">
          <span>Time</span>
          <span>Side</span>
          <span style={{ textAlign: 'right' }}>Size</span>
          <span>Price</span>
        </div>
        <div className="no-data-placeholder" style={{ fontSize: 10 }}>
          No trades yet
        </div>
      </div>
    )
  }

  return (
    <div className="trades-wrap">
      <div className="trades-header">
        <span>Time</span>
        <span>Side</span>
        <span style={{ textAlign: 'right' }}>Size</span>
        <span>Price</span>
      </div>
      <div className="trades-list" ref={listRef}>
        {displayTrades.map((trade, i) => {
          const isBuy = (trade.side || '').toLowerCase() === 'buy'
          return (
            <div key={trade.id || i} className="trade-row">
              <span className="trade-time">{formatTime(trade.timestamp)}</span>
              <span className={`trade-side ${isBuy ? 'buy' : 'sell'}`}>
                {isBuy ? 'BUY' : 'SELL'}
              </span>
              <span className="trade-size">{formatSize(trade.size)}</span>
              <span className="trade-price">${formatPrice(trade.price)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
