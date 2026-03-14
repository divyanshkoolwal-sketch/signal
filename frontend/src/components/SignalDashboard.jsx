import React, { useRef, useEffect, useState } from 'react'
import useStore from '../store/useStore.js'
import InformationTimeline from './InformationTimeline.jsx'
import SignalGauges from './SignalGauges.jsx'
import OrderBookMicrostructure from './OrderBookMicrostructure.jsx'
import RecentTrades from './RecentTrades.jsx'

function formatPrice(price) {
  if (price == null || isNaN(price)) return '-'
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(6)
}

const PHASE_LABELS = {
  1: 'Accumulation',
  2: 'Ignition',
  3: 'Propagation',
  4: 'Exhaustion',
}

export default function SignalDashboard({ pair }) {
  const { markets, setSelectedPair, openTradePanel } = useStore()
  const state = markets[pair] || {}
  const { phase = 1, price, phaseLabel } = state

  const prevPriceRef = useRef(null)
  const [flashClass, setFlashClass] = useState('')

  useEffect(() => {
    if (prevPriceRef.current !== null && price != null) {
      if (price > prevPriceRef.current) setFlashClass('flash-green')
      else if (price < prevPriceRef.current) setFlashClass('flash-red')
      const t = setTimeout(() => setFlashClass(''), 600)
      prevPriceRef.current = price
      return () => clearTimeout(t)
    }
    prevPriceRef.current = price
  }, [price])

  const label = phaseLabel || PHASE_LABELS[phase] || `Phase ${phase}`

  return (
    <div className="signal-dashboard" style={{ '--phase-color': `var(--phase-${phase})` }}>
      {/* Header */}
      <div className="signal-dashboard-header">
        <button className="back-btn" onClick={() => setSelectedPair(null)}>
          ← Back
        </button>
        <span className="dashboard-pair-name">{pair}</span>
        <span className={`dashboard-live-price ${flashClass}`}>
          ${formatPrice(price)}
        </span>
        <span className={`dashboard-phase-badge phase-${phase}`}>
          PHASE {phase} — {label.toUpperCase()}
        </span>
        <button
          className="dashboard-trade-btn"
          style={{ background: `var(--phase-${phase})` }}
          onClick={() => openTradePanel(pair)}
        >
          TRADE
        </button>
      </div>

      {/* Body */}
      <div className="signal-dashboard-body">
        {/* Left panel */}
        <div className="signal-dashboard-left">
          {/* Information Timeline */}
          <div className="dashboard-section">
            <div className="dashboard-section-label">Information Timeline</div>
            <InformationTimeline pair={pair} state={state} />
          </div>

          {/* Bottom panels */}
          <div className="dashboard-bottom-panels" style={{ flex: 1 }}>
            <div className="dashboard-bottom-left">
              <div className="dashboard-section-label" style={{ padding: '8px 12px 4px' }}>
                Order Book Microstructure
              </div>
              <OrderBookMicrostructure orderBook={state.orderBook} />
            </div>
            <div className="dashboard-bottom-right">
              <div className="dashboard-section-label" style={{ padding: '8px 12px 4px' }}>
                Recent Trades
              </div>
              <RecentTrades trades={state.trades} />
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="signal-dashboard-right">
          <div style={{ padding: '8px 12px 0', borderBottom: '1px solid var(--border)' }}>
            <span className="dashboard-section-label" style={{ padding: 0, display: 'block' }}>
              Signal Gauges
            </span>
          </div>
          <SignalGauges state={state} />
        </div>
      </div>
    </div>
  )
}
