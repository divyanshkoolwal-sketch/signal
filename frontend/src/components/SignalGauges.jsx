import React, { useMemo } from 'react'

const PHASE_COLORS = {
  1: '#2563eb',
  2: '#f59e0b',
  3: '#ef4444',
  4: '#8b5cf6',
}

function safeNum(v, fallback = 0) {
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v))
}

// SVG arc path for a partial circle
function describeArc(cx, cy, r, startDeg, endDeg) {
  const toRad = (d) => (d * Math.PI) / 180
  const start = toRad(startDeg)
  const end = toRad(endDeg)
  const x1 = cx + r * Math.cos(start)
  const y1 = cy + r * Math.sin(start)
  const x2 = cx + r * Math.cos(end)
  const y2 = cy + r * Math.sin(end)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

// VPIN Arc Gauge
function VPINGauge({ vpin, metricHistory }) {
  const val = clamp(safeNum(vpin))

  // Arc: 225deg -> 315deg = 270deg sweep (starting bottom-left, ending bottom-right)
  // We use -225deg = 135deg start in standard SVG coords
  const startDeg = 135
  const totalSwing = 270
  const endDeg = startDeg + totalSwing

  // Colored zones
  const zones = [
    { start: 0, end: 0.40, color: '#2563eb' },
    { start: 0.40, end: 0.55, color: '#f59e0b' },
    { start: 0.55, end: 0.70, color: '#f97316' },
    { start: 0.70, end: 1.00, color: '#ef4444' },
  ]

  const cx = 60, cy = 60, r = 44, thickness = 8

  function valToDeg(v) {
    return startDeg + v * totalSwing
  }

  // Current needle position
  const needleDeg = valToDeg(val)
  const needleRad = (needleDeg * Math.PI) / 180
  const nx = cx + r * Math.cos(needleRad)
  const ny = cy + r * Math.sin(needleRad)

  // Color based on value
  let valueColor = '#2563eb'
  if (val >= 0.70) valueColor = '#ef4444'
  else if (val >= 0.55) valueColor = '#f97316'
  else if (val >= 0.40) valueColor = '#f59e0b'

  // Sparkline from metricHistory
  const sparkData = useMemo(() => {
    if (!metricHistory || metricHistory.length < 2) return []
    const last = metricHistory.slice(-150)
    return last.map((d) => safeNum(d.vpin))
  }, [metricHistory])

  return (
    <div className="gauge-vpin">
      <svg width="120" height="75" viewBox="0 0 120 75" className="gauge-arc-wrap" style={{ position: 'relative' }}>
        {/* Background track */}
        <path
          d={describeArc(cx, cy, r, startDeg, endDeg)}
          fill="none"
          stroke="#1a1a24"
          strokeWidth={thickness}
          strokeLinecap="round"
        />

        {/* Zone arcs */}
        {zones.map((z, i) => {
          const zStart = valToDeg(z.start)
          const zEnd = valToDeg(z.end)
          return (
            <path
              key={i}
              d={describeArc(cx, cy, r, zStart, zEnd)}
              fill="none"
              stroke={z.color}
              strokeWidth={thickness}
              strokeOpacity="0.25"
              strokeLinecap="butt"
            />
          )
        })}

        {/* Value arc */}
        <path
          d={describeArc(cx, cy, r, startDeg, needleDeg)}
          fill="none"
          stroke={valueColor}
          strokeWidth={thickness}
          strokeLinecap="round"
        />

        {/* Needle dot */}
        <circle cx={nx} cy={ny} r="4" fill={valueColor} />

        {/* Center value */}
        <text x={cx} y={cy + 2} textAnchor="middle" dominantBaseline="middle"
          fill={valueColor} fontFamily="IBM Plex Mono, monospace"
          fontSize="16" fontWeight="700">
          {val.toFixed(2)}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle"
          fill="rgba(255,255,255,0.3)" fontFamily="IBM Plex Mono, monospace"
          fontSize="8">
          VPIN
        </text>

        {/* Min/Max labels */}
        <text x="12" y="72" textAnchor="middle"
          fill="rgba(255,255,255,0.2)" fontFamily="IBM Plex Mono, monospace"
          fontSize="7">0</text>
        <text x="108" y="72" textAnchor="middle"
          fill="rgba(255,255,255,0.2)" fontFamily="IBM Plex Mono, monospace"
          fontSize="7">1</text>
      </svg>

      {/* Sparkline */}
      {sparkData.length > 1 && (
        <svg className="gauge-sparkline" viewBox={`0 0 ${sparkData.length} 24`} preserveAspectRatio="none">
          <polyline
            points={sparkData.map((v, i) => `${i},${24 - v * 24}`).join(' ')}
            fill="none"
            stroke={valueColor}
            strokeWidth="1"
            strokeOpacity="0.6"
          />
        </svg>
      )}
    </div>
  )
}

// OFI Multi-Level Bar
function OFIGauge({ ofi }) {
  const val = clamp(safeNum(ofi), -1, 1)
  const pct = Math.abs(val) * 50  // 0-50%
  const isBuy = val >= 0

  return (
    <div className="gauge-ofi-bar-wrap">
      <div className="gauge-ofi-bar">
        <div
          className={`gauge-ofi-fill ${isBuy ? 'buy' : 'sell'}`}
          style={{ width: `${pct}%` }}
        />
        <span className="gauge-ofi-label">
          {isBuy ? 'BUY PRESSURE' : 'SELL PRESSURE'}
        </span>
      </div>
      <div className="gauge-ofi-value" style={{ color: isBuy ? 'var(--green)' : 'var(--red)' }}>
        {val >= 0 ? '+' : ''}{val.toFixed(3)}
      </div>
    </div>
  )
}

// Spread / ASC Gauge
function SpreadGauge({ asc, spread, phase }) {
  const ascPct = clamp(safeNum(asc) / 100)
  const spreadPct = clamp(safeNum(spread, 0) / 0.01, 0, 1) // normalize spread
  const phaseColor = PHASE_COLORS[phase] || PHASE_COLORS[1]
  const ascPctVal = clamp(safeNum(asc), 0, 100)

  return (
    <div className="gauge-spread-row">
      <div className="gauge-spread-item">
        <div className="gauge-spread-label">
          <span>Spread</span>
          <span style={{ color: 'var(--text-secondary)' }}>{safeNum(spread, 0).toFixed(4)}</span>
        </div>
        <div className="gauge-spread-bar">
          <div
            className="gauge-spread-fill"
            style={{ width: `${spreadPct * 100}%`, background: 'rgba(255,255,255,0.25)' }}
          />
        </div>
      </div>
      <div className="gauge-spread-item">
        <div className="gauge-spread-label">
          <span>ASC percentile</span>
          <span style={{ color: phaseColor, fontWeight: 600 }}>{ascPctVal.toFixed(0)}%ile</span>
        </div>
        <div className="gauge-spread-bar">
          <div
            className="gauge-spread-fill"
            style={{ width: `${ascPct * 100}%`, background: phaseColor }}
          />
        </div>
      </div>
    </div>
  )
}

// Trade Aggression Ratio donut
function TARGauge({ tar }) {
  const val = clamp(safeNum(tar))
  const cx = 36, cy = 36, r = 26
  const circ = 2 * Math.PI * r
  const passiveOffset = circ * val
  const aggressiveOffset = circ * (1 - val)

  return (
    <div className="gauge-tar-wrap">
      <div className="gauge-donut-wrap" style={{ width: 72, height: 72 }}>
        <svg width="72" height="72" viewBox="0 0 72 72">
          {/* Background */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a24" strokeWidth="10" />
          {/* Aggressive (orange) */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="#f97316"
            strokeWidth="10"
            strokeDasharray={`${circ * val} ${circ * (1 - val)}`}
            strokeDashoffset={circ * 0.25}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
          {/* Passive (green) */}
          <circle
            cx={cx} cy={cy} r={r}
            fill="none"
            stroke="#22c55e"
            strokeWidth="10"
            strokeDasharray={`${circ * (1 - val)} ${circ * val}`}
            strokeDashoffset={-(circ * val) + circ * 0.25}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </svg>
        <div className="gauge-donut-center">
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', display: 'block', lineHeight: 1 }}>
            {(val * 100).toFixed(0)}%
          </span>
          <span style={{ fontSize: 8, color: 'var(--text-dim)', display: 'block', lineHeight: 1.2 }}>AGG</span>
        </div>
      </div>
      <div className="gauge-tar-legend">
        <div className="gauge-tar-legend-item">
          <div className="legend-dot" style={{ background: '#f97316' }} />
          <span>Aggressive {(val * 100).toFixed(0)}%</span>
        </div>
        <div className="gauge-tar-legend-item">
          <div className="legend-dot" style={{ background: '#22c55e' }} />
          <span>Passive {((1 - val) * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  )
}

// Volume Velocity Index mini-bars
function VVIGauge({ vvi, metricHistory }) {
  const val = safeNum(vvi, 1)
  const bars = useMemo(() => {
    if (!metricHistory || metricHistory.length < 1) {
      return Array(20).fill(1)
    }
    const last = metricHistory.slice(-20)
    return last.map((d) => safeNum(d.vvi, 1))
  }, [metricHistory])

  const maxBar = Math.max(...bars, 1)
  const vviColor = val > 2 ? 'var(--phase-3)' : val > 1.2 ? 'var(--phase-2)' : 'var(--phase-1)'

  // Baseline position: VVI=1 should be at 50% from bottom
  // Map vvi value: y = 40 - (v/maxBar)*40
  function barHeight(v) {
    return Math.max(2, (v / maxBar) * 38)
  }

  return (
    <div>
      <div className="gauge-vvi-bars">
        {/* Baseline at VVI=1 */}
        <div
          className="gauge-vvi-baseline"
          style={{ bottom: `${(1 / maxBar) * 38}px` }}
        />
        {bars.map((v, i) => {
          const bh = barHeight(v)
          const color = v > 2 ? '#ef4444' : v > 1.2 ? '#f59e0b' : '#2563eb'
          return (
            <div
              key={i}
              className="gauge-vvi-bar"
              style={{ height: bh, background: color, opacity: 0.8 }}
            />
          )
        })}
      </div>
      <div className="gauge-vvi-value" style={{ color: vviColor }}>
        {val.toFixed(2)}×
      </div>
    </div>
  )
}

// Composite Score
function CompositeGauge({ compositeScore, phase }) {
  const val = clamp(safeNum(compositeScore), 0, 18)
  const phaseColor = PHASE_COLORS[phase] || PHASE_COLORS[1]
  const fillPct = (val / 18) * 100

  return (
    <div className="gauge-composite-wrap">
      <div
        className="gauge-composite-number"
        style={{
          color: phaseColor,
          background: `${phaseColor}18`,
          border: `1px solid ${phaseColor}40`,
        }}
      >
        {val.toFixed(1)}
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontWeight: 400 }}>/18</span>
      </div>
      {/* Mini progress bar */}
      <div style={{ width: '100%', height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${fillPct}%`, background: phaseColor, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <div className="gauge-composite-scale">
        Phase 1: 0–5 | Phase 2: 6–11<br />Phase 3: 12–15 | Phase 4: 16–18
      </div>
    </div>
  )
}

export default function SignalGauges({ state }) {
  const signals = state?.signals || {}
  const phase = state?.phase || 1
  const metricHistory = state?.metricHistory || []

  return (
    <div className="signal-gauges">
      {/* 1. VPIN */}
      <div className="gauge-card">
        <div className="gauge-title">VPIN — Volume-Synchronized Probability of Informed Trading</div>
        <VPINGauge vpin={signals.vpin} metricHistory={metricHistory} />
      </div>

      {/* 2. OFI */}
      <div className="gauge-card">
        <div className="gauge-title">OFI — Order Flow Imbalance</div>
        <OFIGauge ofi={signals.ofi} />
      </div>

      {/* 3. Spread / ASC */}
      <div className="gauge-card">
        <div className="gauge-title">Spread / ASC — Adverse Selection Component</div>
        <SpreadGauge asc={signals.asc} spread={signals.spread} phase={phase} />
      </div>

      {/* 4. TAR */}
      <div className="gauge-card">
        <div className="gauge-title">TAR — Trade Aggression Ratio</div>
        <TARGauge tar={signals.tar} />
      </div>

      {/* 5. VVI */}
      <div className="gauge-card">
        <div className="gauge-title">VVI — Volume Velocity Index</div>
        <VVIGauge vvi={signals.vvi} metricHistory={metricHistory} />
      </div>

      {/* 6. Composite Score */}
      <div className="gauge-card">
        <div className="gauge-title">Composite Score</div>
        <CompositeGauge compositeScore={signals.compositeScore} phase={phase} />
      </div>
    </div>
  )
}
