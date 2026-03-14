/**
 * PhaseGrid.jsx — Pressure Chamber Dashboard
 * SIGNAL | Version 1.0
 *
 * Renders 6–8 vertical pressure gauge instruments in a single horizontal row.
 * Each gauge encodes a market's information phase as liquid color + fill height.
 */

import React, { useState, useEffect, useRef } from 'react'
import useStore from '../store/useStore.js'

// ─── Module-level constants ────────────────────────────────────────────────

const PHASE_COLORS = {
  1: '#2563EB',   // Accumulation — blue
  2: '#F59E0B',   // Ignition — amber
  3: '#EF4444',   // Propagation — red
  4: '#8B5CF6',   // Exhaustion — purple
}

const PHASE_LABELS = {
  1: 'ACCUMULATION',
  2: 'IGNITION',
  3: 'PROPAGATION',
  4: 'EXHAUSTION',
}

// Tube inner height in px — fill heights are always pixel integers (never %)
const TUBE_HEIGHT = 450

// ─── Helper functions ──────────────────────────────────────────────────────

function phaseColor(phase) {
  return PHASE_COLORS[phase] ?? PHASE_COLORS[1]
}

/**
 * computeFillPx — returns a pixel integer for the liquid height.
 * Each phase maps to a distinct vertical zone so phases are visually
 * distinguishable without reading labels.
 *
 * Zones:
 *   Phase 1 (Accumulation): 5–25%   → 10–50px
 *   Phase 2 (Ignition):    30–55%   → 60–110px
 *   Phase 3 (Propagation): 60–90%   → 120–180px
 *   Phase 4 (Exhaustion):  35–60%   → 70–120px
 *
 * Formula: clamp to [5, 95], multiply by 2, round.
 */
function computeFillPx(market) {
  const phase      = market?.phase ?? 1
  const vpin       = market?.signals?.vpin ?? 0
  const confidence = (market?.phaseConfidence ?? 50) / 100

  let pct
  switch (phase) {
    case 1: pct = 5  + vpin * 20;            break   // 5–25%
    case 2: pct = 30 + vpin * 25;            break   // 30–55%
    case 3: pct = 60 + confidence * 30;      break   // 60–90%
    case 4: pct = 35 + (1 - vpin) * 25;     break   // 35–60%
    default: pct = 10
  }

  pct = Math.max(5, Math.min(95, pct))
  return Math.round(pct * 2)
}

function fmt(v, dec = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—'
  return Number(v).toFixed(dec)
}

// ─── Inline styles (plain CSS values per spec — no Tailwind) ──────────────

const styles = {
  dashboard: {
    background:  '#0A0A0F',
    minHeight:   '100vh',
    padding:     '32px',
    fontFamily:  '"IBM Plex Mono", monospace',
    boxSizing:   'border-box',
    display:     'flex',
    flexDirection: 'column',
  },

  topBar: {
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'space-between',
    marginBottom:    '24px',
  },

  wordmark: {
    fontSize:      '18px',
    fontWeight:    700,
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color:         '#00E5FF',
    fontFamily:    '"IBM Plex Mono", monospace',
  },

  wordmarkSub: {
    fontSize:      '9px',
    letterSpacing: '0.12em',
    color:         '#4A4A6A',
    marginTop:     '2px',
    textTransform: 'uppercase',
  },

  phaseLegend: {
    display:    'flex',
    gap:        '14px',
    alignItems: 'center',
  },

  legendItem: {
    display:    'flex',
    alignItems: 'center',
    gap:        '5px',
  },

  legendDot: (color) => ({
    width:        '7px',
    height:       '7px',
    borderRadius: '50%',
    background:   color,
    flexShrink:   0,
  }),

  legendText: {
    fontSize:      '10px',
    letterSpacing: '0.06em',
    color:         '#4A4A6A',
    textTransform: 'uppercase',
  },

  // Gauge row — flex-end so height differences are meaningful (per spec)
  // width:100% + no overflow so gauges always fill the screen
  gaugeRow: {
    display:       'flex',
    alignItems:    'flex-end',
    gap:           '12px',
    width:         '100%',
    paddingBottom: '8px',
  },

  gaugeWrap: (selected) => ({
    display:       'flex',
    flexDirection: 'column',
    alignItems:    'center',
    cursor:        'pointer',
    transition:    'transform 0.2s ease',
    position:      'relative',
    flex:          1,          // each gauge takes equal share of row width
    minWidth:      0,          // allow flex shrink below content size
  }),

  pairLabel: {
    fontSize:      '11px',
    color:         '#4A4A6A',
    letterSpacing: '0.1em',
    textAlign:     'center',
    marginBottom:  '8px',
    textTransform: 'uppercase',
  },

  // Cap — top of capsule. border-bottom:none so it's flush with tube.
  gaugeCap: (phase, selected) => ({
    width:           '100%',
    height:          '16px',
    background:      '#1A1A2E',
    borderRadius:    '20px 20px 0 0',
    border:          `1px solid ${selected ? phaseColor(phase) + '44' : '#2A2A4A'}`,
    borderBottom:    'none',
    boxSizing:       'border-box',
  }),

  // Tube — the KEY element. overflow:hidden is MANDATORY.
  gaugeTube: (phase, selected) => ({
    width:        '100%',
    height:       `${TUBE_HEIGHT}px`,
    background:   '#12121A',
    overflow:     'hidden',   // CRITICAL — do NOT change to visible
    border:       `1px solid ${selected ? phaseColor(phase) + '44' : '#2A2A4A'}`,
    borderTop:    'none',
    borderBottom: 'none',
    position:     'relative',
    boxSizing:    'border-box',
    boxShadow:    selected ? `0 0 22px ${phaseColor(phase)}55` : 'none',
  }),

  // Fill — always pixel height, never percentage
  gaugeFill: (phase, fillPx) => ({
    position:   'absolute',
    bottom:     0,
    left:       0,
    right:      0,
    height:     `${fillPx}px`,
    background: phaseColor(phase),
    transition: 'height 0.8s cubic-bezier(0.34, 1.2, 0.64, 1), background 1.2s ease',
    pointerEvents: 'none',
  }),

  // Shimmer — glass reflection at top of liquid
  gaugeShimmer: {
    position:   'absolute',
    top:        0,
    left:       0,
    right:      0,
    height:     '40px',
    background: 'linear-gradient(to bottom, rgba(255,255,255,0.06), transparent)',
    pointerEvents: 'none',
    zIndex:     2,
  },

  // Tick container
  gaugeTicks: {
    position:      'absolute',
    top:           0,
    left:          0,
    right:         0,
    bottom:        0,
    pointerEvents: 'none',
    zIndex:        3,
  },

  // Major tick — at 20/40/60/80% from bottom
  tickMajor: (pctFromBottom) => ({
    position:   'absolute',
    bottom:     `${pctFromBottom}%`,
    right:      0,
    width:      '10px',
    height:     '1px',
    background: 'rgba(255,255,255,0.18)',
  }),

  // Minor tick — at 10/30/50/70/90% from bottom
  tickMinor: (pctFromBottom) => ({
    position:   'absolute',
    bottom:     `${pctFromBottom}%`,
    right:      0,
    width:      '6px',
    height:     '1px',
    background: 'rgba(255,255,255,0.07)',
  }),

  // Base — bottom of capsule. border-top:none so flush with tube.
  gaugeBase: (phase, selected) => ({
    width:        '100%',
    height:       '16px',
    background:   '#1A1A2E',
    borderRadius: '0 0 20px 20px',
    border:       `1px solid ${selected ? phaseColor(phase) + '44' : '#2A2A4A'}`,
    borderTop:    'none',
    boxSizing:    'border-box',
  }),

  gaugeMetrics: {
    marginTop:      '8px',
    width:          '100%',
    display:        'flex',
    flexDirection:  'column',
    alignItems:     'center',
    gap:            '4px',
  },

  phaseBadge: (phase) => ({
    fontSize:        '8px',
    fontWeight:      700,
    letterSpacing:   '0.1em',
    textTransform:   'uppercase',
    color:           phaseColor(phase),
    background:      phaseColor(phase) + '22',
    padding:         '2px 5px',
    borderRadius:    '3px',
    textAlign:       'center',
    width:           '100%',
    boxSizing:       'border-box',
  }),

  vpinValue: {
    fontSize:      '11px',
    color:         '#E8E8F0',
    textAlign:     'center',
    letterSpacing: '0.04em',
  },

  confBarOuter: {
    height:       '3px',
    background:   '#1A1A2E',
    borderRadius: '2px',
    marginTop:    '4px',
    overflow:     'hidden',
    width:        '100%',
  },

  confBarInner: (phase, confidence) => ({
    height:       '100%',
    borderRadius: '2px',
    transition:   'width 1s ease',
    width:        `${confidence}%`,
    background:   phaseColor(phase),
  }),

  // Pulse ring — Phase 3 ONLY — sizes relative to tube width
  pulseRing: (phase) => ({
    position:     'absolute',
    top:          '50%',
    left:         '50%',
    transform:    'translate(-50%, -50%)',
    width:        '120%',
    height:       '120%',
    borderRadius: '50%',
    border:       `1.5px solid ${phaseColor(phase)}55`,
    animation:    'pulse-out 1.5s ease-out infinite',
    pointerEvents:'none',
    zIndex:       10,
  }),

  // ── Detail panel ──────────────────────────────────────────────────────────

  selectedPanel: {
    marginTop:    '32px',
    background:   '#0E0E18',
    border:       '1px solid #1E1E2A',
    borderRadius: '8px',
    padding:      '20px 24px',
    display:      'flex',
    alignItems:   'center',
    gap:          '24px',
    flexWrap:     'wrap',
  },

  selIdentity: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '4px',
    minWidth:      '90px',
  },

  selPair: {
    fontSize:      '18px',
    color:         '#E8E8F0',
    fontWeight:    600,
    letterSpacing: '0.05em',
    // NOT uppercase per spec — "BTC/USD" in natural case
  },

  selPhaseLabel: (phase) => ({
    fontSize:      '13px',
    fontWeight:    600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color:         phaseColor(phase),
  }),

  signalGrid: {
    display:    'flex',
    flex:       1,
    gap:        '20px',
    flexWrap:   'wrap',
    alignItems: 'center',
  },

  signalItem: {
    display:       'flex',
    flexDirection: 'column',
    gap:           '4px',
  },

  signalLabel: {
    fontSize:      '9px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color:         '#4A4A6A',
  },

  signalValue: {
    fontSize:      '14px',
    color:         '#E8E8F0',
    fontFamily:    '"IBM Plex Mono", monospace',
  },

  tradeBtn: {
    marginLeft:   'auto',
    padding:      '8px 20px',
    border:       '1px solid #00E5FF',
    background:   'transparent',
    color:        '#00E5FF',
    fontSize:     '11px',
    fontWeight:   700,
    letterSpacing:'0.12em',
    textTransform:'uppercase',
    borderRadius: '4px',
    cursor:       'pointer',
    fontFamily:   '"IBM Plex Mono", monospace',
    transition:   'box-shadow 0.2s ease, background 0.2s ease',
  },
}

// ─── Tick marks component ──────────────────────────────────────────────────

function GaugeTicks() {
  const majorPcts = [20, 40, 60, 80]
  const minorPcts = [10, 30, 50, 70, 90]
  return (
    <div style={styles.gaugeTicks}>
      {majorPcts.map(p => (
        <div key={`maj-${p}`} style={styles.tickMajor(p)} />
      ))}
      {minorPcts.map(p => (
        <div key={`min-${p}`} style={styles.tickMinor(p)} />
      ))}
    </div>
  )
}

// ─── Single gauge ──────────────────────────────────────────────────────────

function PressureGauge({ market, selected, onClick }) {
  const phase      = market?.phase ?? 1
  const targetFill = computeFillPx(market)
  const confidence = market?.phaseConfidence ?? 0
  const vpin       = market?.signals?.vpin ?? 0
  const pair       = market?.pair ?? '—'
  const pairDisplay = pair.replace('-', '/')

  const [hovered, setHovered] = useState(false)

  // Smooth fill: keep displayFillPx in state so the CSS transition
  // sees a genuine height change on the DOM element, not a style-object swap.
  const [displayFillPx, setDisplayFillPx] = useState(targetFill)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDisplayFillPx(targetFill))
    return () => cancelAnimationFrame(raf)
  }, [targetFill])

  return (
    <div
      style={{
        ...styles.gaugeWrap(selected),
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pair label above capsule */}
      <div style={styles.pairLabel}>{pairDisplay}</div>

      {/* Pulse ring — Phase 3 ONLY */}
      {phase === 3 && (
        <div style={{ position: 'relative', width: '100%', height: 0 }}>
          <div style={styles.pulseRing(phase)} />
        </div>
      )}

      {/* Cap — top of capsule, flush with tube */}
      <div style={styles.gaugeCap(phase, selected)} />

      {/* Tube — overflow:hidden is CRITICAL */}
      <div style={styles.gaugeTube(phase, selected)}>
        {/* Fill — pixel height driven by state for smooth CSS transition */}
        <div style={styles.gaugeFill(phase, displayFillPx)} />
        {/* Shimmer overlay */}
        <div style={styles.gaugeShimmer} />
        {/* Tick marks */}
        <GaugeTicks />
      </div>

      {/* Base — bottom of capsule, flush with tube */}
      <div style={styles.gaugeBase(phase, selected)} />

      {/* Metrics below capsule */}
      <div style={styles.gaugeMetrics}>
        <div style={styles.phaseBadge(phase)}>
          {PHASE_LABELS[phase]?.slice(0, 4) ?? 'PH' + phase}
        </div>
        <div style={styles.vpinValue}>
          {fmt(vpin, 3)}
        </div>
        {/* Confidence bar */}
        <div style={styles.confBarOuter}>
          <div style={styles.confBarInner(phase, confidence)} />
        </div>
      </div>
    </div>
  )
}

// ─── Detail panel ──────────────────────────────────────────────────────────

function DetailPanel({ market, onTrade }) {
  if (!market) return null

  const phase   = market.phase ?? 1
  const s       = market.signals ?? {}
  const pair    = (market.pair ?? '—').replace('-', '/')

  const [btnHovered, setBtnHovered] = useState(false)

  const signals = [
    { label: 'VPIN',    value: fmt(s.vpin, 3) },
    { label: 'OFI',     value: fmt(s.ofi, 3) },
    { label: 'TAR',     value: s.tar != null ? (s.tar * 100).toFixed(0) + '%' : '—' },
    { label: 'VVI',     value: fmt(s.vvi, 2) },
    { label: 'SCORE',   value: `${s.compositeScore ?? 0}/18` },
  ]

  return (
    <div style={styles.selectedPanel}>
      {/* Identity */}
      <div style={styles.selIdentity}>
        <div style={styles.selPair}>{pair}</div>
        <div style={styles.selPhaseLabel(phase)}>{PHASE_LABELS[phase]}</div>
      </div>

      {/* Signal mini-grid */}
      <div style={styles.signalGrid}>
        {signals.map(sig => (
          <div key={sig.label} style={styles.signalItem}>
            <span style={styles.signalLabel}>{sig.label}</span>
            <span style={styles.signalValue}>{sig.value}</span>
          </div>
        ))}
      </div>

      {/* Trade button */}
      <button
        style={{
          ...styles.tradeBtn,
          boxShadow: btnHovered ? '0 0 12px #00E5FF55' : 'none',
          background: btnHovered ? 'rgba(0,229,255,0.06)' : 'transparent',
        }}
        onMouseEnter={() => setBtnHovered(true)}
        onMouseLeave={() => setBtnHovered(false)}
        onClick={onTrade}
      >
        Trade
      </button>
    </div>
  )
}

// ─── PhaseGrid (main export) ───────────────────────────────────────────────

export default function PhaseGrid() {
  const { markets, openTradePanel } = useStore()
  const pairs = Object.keys(markets)

  const [selectedIndex, setSelectedIndex] = useState(0)

  // Default to first pair on load
  const selectedPair   = pairs[selectedIndex] ?? pairs[0]
  const selectedMarket = markets[selectedPair] ?? null

  return (
    <div style={styles.dashboard}>
      {/* ── Top bar ── */}
      <div style={styles.topBar}>
        {/* Wordmark */}
        <div>
          <div style={styles.wordmark}>SIGNAL</div>
          <div style={styles.wordmarkSub}>Information Lifecycle Terminal</div>
        </div>

        {/* Phase legend */}
        <div style={styles.phaseLegend}>
          {[1, 2, 3, 4].map(p => (
            <div key={p} style={styles.legendItem}>
              <div style={styles.legendDot(PHASE_COLORS[p])} />
              <span style={styles.legendText}>{PHASE_LABELS[p]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Gauge row — align-items:flex-end (not center) ── */}
      <div style={styles.gaugeRow}>
        {pairs.length === 0 ? (
          <div style={{ color: '#4A4A6A', fontSize: '12px', padding: '80px 0' }}>
            Connecting to market data…
          </div>
        ) : (
          pairs.map((pair, i) => (
            <PressureGauge
              key={pair}
              market={markets[pair]}
              selected={i === selectedIndex}
              onClick={() => setSelectedIndex(i)}
            />
          ))
        )}
      </div>

      {/* ── Detail panel — always visible, updates on gauge click ── */}
      <DetailPanel
        market={selectedMarket}
        onTrade={() => selectedPair && openTradePanel(selectedPair)}
      />
    </div>
  )
}
