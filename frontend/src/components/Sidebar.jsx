import React from 'react'
import useStore from '../store/useStore.js'

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

export default function Sidebar() {
  const { markets, selectedPair, setSelectedPair, openTradePanel, positions, connected } = useStore()

  const pairs = Object.keys(markets)

  const totalPnl = positions.reduce((sum, p) => sum + (p.pnl || 0), 0)
  const pnlPositive = totalPnl >= 0

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          SIG<span>N</span>AL
        </div>
        <div className="sidebar-tagline">Who knew first?</div>
      </div>

      {/* Asset list */}
      <div className="sidebar-section-label">Markets</div>
      <div className="sidebar-asset-list">
        {pairs.length === 0 ? (
          <div style={{ padding: '20px 12px', color: 'var(--text-dim)', fontSize: 10, textAlign: 'center', lineHeight: 1.8 }}>
            <span className="loading-dots">
              Connecting<span>.</span><span>.</span><span>.</span>
            </span>
          </div>
        ) : (
          pairs.map((pair) => {
            const s = markets[pair]
            const phase = s?.phase || 1
            const isActive = selectedPair === pair
            return (
              <div
                key={pair}
                className={`sidebar-asset-item${isActive ? ' active' : ''}`}
                onClick={() => setSelectedPair(isActive ? null : pair)}
              >
                <div className={`phase-dot phase-${phase}`} />
                <div className="sidebar-asset-info">
                  <div className="sidebar-asset-pair">{pair}</div>
                  <div className="sidebar-asset-phase">
                    {PHASE_LABELS[phase] || `Phase ${phase}`}
                  </div>
                </div>
                <div className="sidebar-asset-price">
                  ${formatPrice(s?.price)}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Portfolio */}
      <div className="sidebar-portfolio">
        <div className="sidebar-portfolio-title">Portfolio</div>
        <div className="sidebar-portfolio-row">
          <span className="sidebar-portfolio-label">Positions</span>
          <span className="sidebar-portfolio-value">{positions.length}</span>
        </div>
        <div className="sidebar-portfolio-row">
          <span className="sidebar-portfolio-label">Total P&amp;L</span>
          <span className={`sidebar-portfolio-value sidebar-portfolio-pnl ${pnlPositive ? 'positive' : 'negative'}`}>
            {pnlPositive ? '+' : ''}{totalPnl.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="sidebar-bottom">
        <div className="sidebar-status">
          <div className={`status-dot${connected ? ' connected' : ''}`} />
          <span>{connected ? 'Live' : 'Connecting'}</span>
        </div>
        <button className="sidebar-settings-btn" title="Settings">
          ⚙
        </button>
      </div>
    </aside>
  )
}
