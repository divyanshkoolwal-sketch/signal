import React, { useRef, useEffect, useState } from 'react'
import useStore from '../store/useStore.js'
import PhaseHexagon from './PhaseHexagon.jsx'

function formatPrice(price) {
  if (price == null || isNaN(price)) return '-'
  if (price >= 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (price >= 1) return price.toFixed(4)
  return price.toFixed(6)
}

function formatDuration(ms) {
  if (!ms || isNaN(ms)) return '--'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

const PHASE_LABELS = {
  1: 'Accumulation',
  2: 'Ignition',
  3: 'Propagation',
  4: 'Exhaustion',
}

function getPhaseStatus(phase) {
  if (phase === 2 || phase === 3) return { label: 'ACTIVE', cls: 'active' }
  if (phase === 4) return { label: 'FADING', cls: 'fading' }
  return { label: 'QUIET', cls: 'quiet' }
}

function safeNum(v, decimals = 2, fallback = '-') {
  if (v == null || isNaN(Number(v))) return fallback
  return Number(v).toFixed(decimals)
}

export default function PhaseCard({ pair, state }) {
  const { setSelectedPair, openTradePanel } = useStore()
  const prevPriceRef = useRef(null)
  const [flashClass, setFlashClass] = useState('')

  const phase = state?.phase || 1
  const signals = state?.signals || {}
  const phaseLabel = state?.phaseLabel || PHASE_LABELS[phase] || `Phase ${phase}`
  const confidence = state?.phaseConfidence ?? 50
  const price = state?.price
  const phaseDurationMs = state?.phaseDurationMs || 0
  const typicalPhaseDurationMs = state?.typicalPhaseDurationMs || 300000

  const phaseStatus = getPhaseStatus(phase)

  useEffect(() => {
    if (prevPriceRef.current !== null && price != null) {
      if (price > prevPriceRef.current) {
        setFlashClass('flash-green')
      } else if (price < prevPriceRef.current) {
        setFlashClass('flash-red')
      }
      const t = setTimeout(() => setFlashClass(''), 500)
      prevPriceRef.current = price
      return () => clearTimeout(t)
    }
    prevPriceRef.current = price
  }, [price])

  function handleCardClick() {
    setSelectedPair(pair)
  }

  function handleTradeClick(e) {
    e.stopPropagation()
    openTradePanel(pair)
  }

  return (
    <div
      className={`phase-card phase-${phase}`}
      onClick={handleCardClick}
    >
      <div className="phase-strip" />
      <div className="card-body">
        {/* Header */}
        <div className="card-header">
          <span className="pair-name">{pair}</span>
          <span className={`card-price ${flashClass}`}>
            ${formatPrice(price)}
          </span>
        </div>

        {/* Phase label + status */}
        <div className="phase-label-row">
          <span className="phase-label-text">{phaseLabel}</span>
          <span className={`phase-status-badge ${phaseStatus.cls}`}>
            {phaseStatus.label}
          </span>
        </div>

        {/* Confidence bar */}
        <div className="confidence-bar-wrap">
          <div className="confidence-bar">
            <div
              className="confidence-fill"
              style={{ width: `${Math.min(100, Math.max(0, confidence))}%` }}
            />
          </div>
          <span className="confidence-pct">{safeNum(confidence, 0)}%</span>
        </div>

        {/* Hexagon */}
        <div className="phase-hexagon-wrap">
          <PhaseHexagon signals={signals} phase={phase} />
        </div>

        {/* Metrics row */}
        <div className="metrics-row">
          <div className="metric-item">
            VPIN: <span>{safeNum(signals.vpin, 2)}</span>
          </div>
          <div className="metric-item">
            OFI: <span>{signals.ofi >= 0 ? '+' : ''}{safeNum(signals.ofi, 2)}</span>
          </div>
          <div className="metric-item">
            TAR: <span>{safeNum((signals.tar || 0) * 100, 0)}%</span>
          </div>
        </div>

        {/* Footer */}
        <div className="card-footer">
          <span className="phase-duration-text">
            {formatDuration(phaseDurationMs)} / ~{formatDuration(typicalPhaseDurationMs)}
          </span>
          <button className="trade-btn" onClick={handleTradeClick}>
            TRADE
          </button>
        </div>
      </div>
    </div>
  )
}
