import React, { useState, useRef, useEffect } from 'react'
import useStore from '../store/useStore.js'

const PHASE_COLORS = {
  1: '#2563eb',
  2: '#f59e0b',
  3: '#ef4444',
  4: '#8b5cf6',
}

const PHASE_LABELS = {
  1: 'Accumulation',
  2: 'Ignition',
  3: 'Propagation',
  4: 'Exhaustion',
}

function formatPrice(price) {
  if (price == null || isNaN(price)) return '-'
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(6)
}

function generateSituationBrief(signals, phase, phaseLabel) {
  if (!signals) return 'Market data loading…'
  const vpin = signals.vpin ?? 0
  const ofi = signals.ofi ?? 0
  const vpinTrend = signals.vpinTrend ?? 0

  const vpinText = vpin > 0.6
    ? `VPIN elevated at ${vpin.toFixed(2)} and ${vpinTrend > 0 ? 'rising' : 'falling'}.`
    : `VPIN at ${vpin.toFixed(2)}.`

  const ofiText = ofi > 0.3
    ? 'Buy-side OFI dominant across depth levels.'
    : ofi < -0.3
    ? 'Sell-side OFI dominant across depth levels.'
    : 'Order book balanced.'

  return `${vpinText} ${ofiText}`
}

const BET_EXPLANATIONS = {
  RIDE: 'Momentum is building. Enter in the direction of the phase and hold until microstructure shows exhaustion. High risk/reward.',
  FADE: 'Trade against the prevailing phase momentum. Effective at extremes — wait for VPIN to peak and begin falling.',
  WAIT: 'Register an alert to notify you when conditions change. No position opened until triggered.',
}

function getExecuteLabel(betType, phase, phaseLabel) {
  if (betType === 'WAIT') return 'SET ALERT'
  const label = phaseLabel || PHASE_LABELS[phase] || `PHASE ${phase}`
  const verb = betType === 'RIDE' ? 'RIDE' : 'FADE'
  return `${verb} ${label.toUpperCase()}`
}

function computeStopLoss(price, betType) {
  if (!price || isNaN(price)) return null
  if (betType === 'RIDE') return price * (1 - 0.006)
  if (betType === 'FADE') return price * (1 + 0.008)
  return null
}

export default function TradePanel() {
  const {
    tradePanelPair,
    markets,
    closeTradePanel,
    addAlert,
    addPosition,
    removePosition,
    positions,
    addNotification,
  } = useStore()

  const pair = tradePanelPair
  const state = markets[pair] || {}
  const { phase = 1, price, phaseLabel, signals = {} } = state

  const [betType, setBetType] = useState('RIDE')
  const [size, setSize] = useState(500)
  const [autoStop, setAutoStop] = useState(true)
  const [toast, setToast] = useState(null)

  const toastTimer = useRef(null)

  const phaseColor = PHASE_COLORS[phase] || PHASE_COLORS[1]
  const stopPrice = autoStop ? computeStopLoss(price, betType) : null
  const situationBrief = generateSituationBrief(signals, phase, phaseLabel)
  const executeLabel = getExecuteLabel(betType, phase, phaseLabel)

  function showToast(msg) {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  async function handleExecute() {
    if (betType === 'WAIT') {
      const alertId = addAlert(pair, phase)
      showToast(`Alert set: ${pair} Phase ${phase} ${phaseLabel || ''}. You'll be notified on transition.`)
      return
    }

    try {
      const resp = await fetch('http://localhost:4000/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair,
          betType,
          size: Number(size),
          phase,
          entryPrice: price,
          stopPrice: stopPrice || null,
        }),
      })
      // Accept both success and network errors — demo mode still shows toast
    } catch (e) {
      // Demo mode: no backend required
    }

    const positionId = addPosition({
      pair,
      betType,
      size: Number(size),
      phase,
      entryPrice: price,
      stopPrice,
      pnl: 0,
      openedAt: Date.now(),
    })

    const stopStr = stopPrice ? `$${formatPrice(stopPrice)}` : 'n/a'
    showToast(
      `Position opened: ${betType} ${pair} Phase ${phase} ${phaseLabel || ''}. Size: $${Number(size).toLocaleString()}. Stop: ${stopStr}.`
    )
  }

  const openPositions = positions.filter((p) => p.pair === pair)

  return (
    <>
      <div className="trade-panel-overlay">
        <div className="trade-panel-backdrop" onClick={closeTradePanel} />
        <div className="trade-panel">
          {/* Header */}
          <div className="trade-panel-header">
            <div>
              <div className="trade-panel-pair" style={{ color: phaseColor }}>
                {pair}
              </div>
              <div className="trade-panel-price">${formatPrice(price)}</div>
            </div>
            <button className="trade-panel-close" onClick={closeTradePanel}>✕</button>
          </div>

          {/* Phase badge */}
          <div className="trade-panel-section" style={{ paddingTop: 10, paddingBottom: 10 }}>
            <span
              style={{
                display: 'inline-block',
                background: `${phaseColor}20`,
                border: `1px solid ${phaseColor}50`,
                color: phaseColor,
                borderRadius: 4,
                padding: '3px 12px',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.12em',
              }}
            >
              PHASE {phase} — {(phaseLabel || PHASE_LABELS[phase] || '').toUpperCase()}
            </span>
          </div>

          {/* Situation Brief */}
          <div className="trade-panel-section">
            <div className="trade-panel-section-title">Situation</div>
            <p className="situation-brief">{situationBrief}</p>
          </div>

          {/* Bet Type */}
          <div className="trade-panel-section">
            <div className="trade-panel-section-title">Strategy</div>
            <div className="bet-type-selector">
              {['RIDE', 'FADE', 'WAIT'].map((type) => (
                <button
                  key={type}
                  className={`bet-type-btn ${betType === type ? `active ${type.toLowerCase()}` : ''}`}
                  onClick={() => setBetType(type)}
                >
                  {type}
                </button>
              ))}
            </div>
            <p className="bet-explanation">{BET_EXPLANATIONS[betType]}</p>
          </div>

          {/* Size */}
          <div className="trade-panel-section">
            <div className="trade-panel-section-title">Position Size ($)</div>
            <div className="size-input-wrap">
              <input
                type="number"
                className="size-input"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                min={1}
                placeholder="Enter size in USD"
              />
              <div className="size-presets">
                {[100, 500, 1000, 5000].map((preset) => (
                  <button
                    key={preset}
                    className="size-preset-btn"
                    onClick={() => setSize(preset)}
                  >
                    ${preset >= 1000 ? `${preset / 1000}K` : preset}
                  </button>
                ))}
              </div>
            </div>

            {betType !== 'WAIT' && (
              <div className="stoploss-row" style={{ marginTop: 10 }}>
                <label className="stoploss-label">
                  <input
                    type="checkbox"
                    className="stoploss-checkbox"
                    checked={autoStop}
                    onChange={(e) => setAutoStop(e.target.checked)}
                  />
                  Auto Stop-Loss
                </label>
                {autoStop && stopPrice && (
                  <span className="stoploss-price">
                    Stop @ ${formatPrice(stopPrice)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Execute */}
          <div className="trade-panel-section">
            <button
              className="execute-btn"
              style={{
                background: betType === 'RIDE'
                  ? phaseColor
                  : betType === 'FADE'
                  ? '#ef4444'
                  : '#1a1a24',
                color: betType === 'WAIT' ? 'var(--phase-2)' : '#000',
                border: betType === 'WAIT' ? '1px solid var(--phase-2)' : 'none',
              }}
              onClick={handleExecute}
            >
              {executeLabel}
            </button>
          </div>

          <div className="divider" />

          {/* Open Positions */}
          <div className="positions-section">
            <div className="trade-panel-section-title" style={{ marginBottom: 10 }}>
              Open Positions
            </div>
            {openPositions.length === 0 ? (
              <div className="positions-empty">No open positions for {pair}</div>
            ) : (
              openPositions.map((pos) => (
                <div key={pos.id} className="position-item">
                  <div className="position-left">
                    <div className="position-pair">{pos.pair}</div>
                    <div className="position-type">{pos.betType} · Phase {pos.phase}</div>
                    <div className="position-size">${Number(pos.size).toLocaleString()}</div>
                  </div>
                  <div className="position-right">
                    <div className={`position-pnl ${(pos.pnl || 0) >= 0 ? 'positive' : 'negative'}`}>
                      {(pos.pnl || 0) >= 0 ? '+' : ''}{(pos.pnl || 0).toFixed(2)}
                    </div>
                    <button
                      className="position-close-btn"
                      onClick={() => removePosition(pos.id)}
                    >
                      CLOSE
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast" style={{ zIndex: 600 }}>
          {toast}
        </div>
      )}
    </>
  )
}
