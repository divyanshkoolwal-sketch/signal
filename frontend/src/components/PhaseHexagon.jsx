import React from 'react'

const PHASE_COLORS = {
  1: '#2563eb',
  2: '#f59e0b',
  3: '#ef4444',
  4: '#8b5cf6',
}

// Labels for the 6 signals (shown at vertices)
const SIGNAL_LABELS = ['VPIN', 'OFI', 'ASC', 'TAR', 'VVI', 'CS']

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v))
}

function getSignalValues(signals) {
  const vpin = clamp(signals.vpin ?? 0)
  const ofi = clamp(Math.abs(signals.ofi ?? 0))
  const asc = clamp((signals.asc ?? 50) / 100)
  const tar = clamp(signals.tar ?? 0)
  const vvi = clamp((signals.vvi ?? 1) / 3)
  const cs = clamp((signals.compositeScore ?? 0) / 18)
  return [vpin, ofi, asc, tar, vvi, cs]
}

function hexVertices(cx, cy, r) {
  // Start from top, go clockwise
  const points = []
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 90  // -90 so first vertex is at top
    const angleRad = (Math.PI / 180) * angleDeg
    points.push([
      cx + r * Math.cos(angleRad),
      cy + r * Math.sin(angleRad),
    ])
  }
  return points
}

function buildPolygon(cx, cy, maxR, values) {
  const points = []
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 90
    const angleRad = (Math.PI / 180) * angleDeg
    const r = values[i] * maxR
    points.push([
      cx + r * Math.cos(angleRad),
      cy + r * Math.sin(angleRad),
    ])
  }
  return points
}

export default function PhaseHexagon({ signals = {}, phase = 1, size = 80 }) {
  const color = PHASE_COLORS[phase] || PHASE_COLORS[1]
  const cx = size / 2
  const cy = size / 2
  const maxR = (size / 2) - 4

  const values = getSignalValues(signals)

  // Reference hexagon (at 50% = 0.5 normalized)
  const refVerts = hexVertices(cx, cy, maxR * 0.5)
  const refPolygon = refVerts.map((p) => p.join(',')).join(' ')

  // Outer hexagon (max, for grid lines)
  const outerVerts = hexVertices(cx, cy, maxR)
  const outerPolygon = outerVerts.map((p) => p.join(',')).join(' ')

  // Data hexagon
  const dataVerts = buildPolygon(cx, cy, maxR, values)
  const dataPolygon = dataVerts.map((p) => p.join(',')).join(' ')

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block' }}
    >
      {/* Grid lines from center to each outer vertex */}
      {outerVerts.map((pt, i) => (
        <line
          key={i}
          x1={cx} y1={cy}
          x2={pt[0]} y2={pt[1]}
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="0.5"
        />
      ))}

      {/* Outer hex outline */}
      <polygon
        points={outerPolygon}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="0.5"
      />

      {/* Reference hex at 50% */}
      <polygon
        points={refPolygon}
        fill="none"
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="0.5"
        strokeDasharray="2,2"
      />

      {/* Data polygon */}
      <polygon
        points={dataPolygon}
        fill={color}
        fillOpacity="0.25"
        stroke={color}
        strokeWidth="1.5"
        strokeOpacity="0.9"
      />

      {/* Dots at data vertices */}
      {dataVerts.map((pt, i) => (
        <circle
          key={i}
          cx={pt[0]}
          cy={pt[1]}
          r="2"
          fill={color}
          opacity="0.9"
        />
      ))}
    </svg>
  )
}
