import React, { useRef, useEffect, useState, useCallback } from 'react'

const PHASE_COLORS = {
  1: '#2563eb',
  2: '#f59e0b',
  3: '#ef4444',
  4: '#8b5cf6',
}

const PHASE_BG = {
  1: 'rgba(37,99,235,0.05)',
  2: 'rgba(245,158,11,0.06)',
  3: 'rgba(239,68,68,0.07)',
  4: 'rgba(139,92,246,0.06)',
}

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}

const WINDOW_MS = 30 * 60 * 1000 // 30 minutes

export default function InformationTimeline({ pair, state }) {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const mouseXRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  const metricHistory = state?.metricHistory || []
  const currentPhase = state?.phase || 1
  const signals = state?.signals || {}

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const now = Date.now()
    const windowStart = now - WINDOW_MS

    // Clear
    ctx.fillStyle = '#0a0a0b'
    ctx.fillRect(0, 0, W, H)

    if (metricHistory.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.font = '11px "IBM Plex Mono", monospace'
      ctx.textAlign = 'center'
      ctx.fillText('Waiting for data…', W / 2, H / 2)
      return
    }

    // Filter to window
    const visible = metricHistory.filter(
      (d) => d.timestamp >= windowStart && d.timestamp <= now
    )
    if (visible.length < 2) return

    function toX(ts) {
      return ((ts - windowStart) / WINDOW_MS) * W
    }

    function toY(vpin) {
      // Invert: high vpin = near top
      const clamped = Math.max(0, Math.min(1, vpin || 0))
      return H - clamped * (H - 30) - 10
    }

    // ── 1. Phase band backgrounds (bottom=phase1, top=phase4) ──────────────────
    const bandH = H / 4
    // Phase 1 band: bottom
    ctx.fillStyle = PHASE_BG[1]
    ctx.fillRect(0, H - bandH, W, bandH)
    // Phase 2
    ctx.fillStyle = PHASE_BG[2]
    ctx.fillRect(0, H - bandH * 2, W, bandH)
    // Phase 3
    ctx.fillStyle = PHASE_BG[3]
    ctx.fillRect(0, H - bandH * 3, W, bandH)
    // Phase 4: top
    ctx.fillStyle = PHASE_BG[4]
    ctx.fillRect(0, 0, W, bandH)

    // VPIN threshold lines
    const thresholds = [
      { vpin: 0.40, color: 'rgba(37,99,235,0.3)', label: '0.40' },
      { vpin: 0.55, color: 'rgba(245,158,11,0.3)', label: '0.55' },
      { vpin: 0.70, color: 'rgba(239,68,68,0.3)', label: '0.70' },
    ]
    thresholds.forEach(({ vpin, color, label }) => {
      const y = toY(vpin)
      ctx.beginPath()
      ctx.setLineDash([4, 6])
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.7)')
      ctx.font = '9px "IBM Plex Mono", monospace'
      ctx.textAlign = 'left'
      ctx.fillText(label, 4, y - 3)
    })

    // ── 2. Volume bars (bottom 22px) ───────────────────────────────────────────
    const volBarH = 22
    const maxVol = Math.max(...visible.map((d) => d.volume || 0), 1)
    const barW = Math.max(1, W / visible.length - 0.5)

    visible.forEach((d, i) => {
      const x = toX(d.timestamp)
      const tarColor = (d.tar || 0) > 0.6
        ? '#ef4444'
        : (d.tar || 0) > 0.4
        ? '#f59e0b'
        : '#22c55e'
      const volH = ((d.volume || 0) / maxVol) * volBarH
      ctx.fillStyle = tarColor + '99'
      ctx.fillRect(x, H - volH, barW, volH)
    })

    // ── 3. OFI ribbon (filled area under VPIN, colored by OFI) ────────────────
    ctx.beginPath()
    ctx.moveTo(toX(visible[0].timestamp), H - volBarH)
    visible.forEach((d) => {
      ctx.lineTo(toX(d.timestamp), toY(d.vpin || 0))
    })
    ctx.lineTo(toX(visible[visible.length - 1].timestamp), H - volBarH)
    ctx.closePath()

    const lastOfi = visible[visible.length - 1]?.ofi || 0
    const ribbonColor = lastOfi >= 0
      ? 'rgba(34,197,94,0.07)'
      : 'rgba(239,68,68,0.07)'
    ctx.fillStyle = ribbonColor
    ctx.fill()

    // ── 4. VPIN line ─────────────────────────────────────────────────────────
    ctx.beginPath()
    ctx.setLineDash([])
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    // Color segments by phase
    let prevX = null
    let prevY = null
    visible.forEach((d, i) => {
      const x = toX(d.timestamp)
      const y = toY(d.vpin || 0)
      const segColor = PHASE_COLORS[d.phase || 1] || PHASE_COLORS[1]

      if (prevX !== null) {
        const grad = ctx.createLinearGradient(prevX, 0, x, 0)
        grad.addColorStop(0, segColor)
        grad.addColorStop(1, segColor)
        ctx.strokeStyle = grad
        ctx.beginPath()
        ctx.moveTo(prevX, prevY)
        ctx.lineTo(x, y)
        ctx.stroke()
      }
      prevX = x
      prevY = y
    })

    // ── 5. Phase transition markers ──────────────────────────────────────────
    for (let i = 1; i < visible.length; i++) {
      if ((visible[i].phase || 1) !== (visible[i - 1].phase || 1)) {
        const x = toX(visible[i].timestamp)
        const newPhase = visible[i].phase || 1
        ctx.beginPath()
        ctx.setLineDash([2, 4])
        ctx.strokeStyle = PHASE_COLORS[newPhase] + 'aa'
        ctx.lineWidth = 1
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H - volBarH)
        ctx.stroke()
        ctx.setLineDash([])

        // Phase label
        ctx.fillStyle = PHASE_COLORS[newPhase]
        ctx.font = 'bold 8px "IBM Plex Mono", monospace'
        ctx.textAlign = 'left'
        ctx.fillText(`P${newPhase}`, x + 3, 14)
      }
    }
    ctx.setLineDash([])

    // ── 6. Current time cursor ───────────────────────────────────────────────
    const lastPoint = visible[visible.length - 1]
    const cursorX = toX(lastPoint.timestamp)
    const cursorY = toY(lastPoint.vpin || 0)
    const cursorColor = PHASE_COLORS[currentPhase]

    // Vertical line
    ctx.beginPath()
    ctx.strokeStyle = cursorColor + '60'
    ctx.lineWidth = 1
    ctx.moveTo(cursorX, 0)
    ctx.lineTo(cursorX, H - volBarH)
    ctx.stroke()

    // Glow dot
    const glow = ctx.createRadialGradient(cursorX, cursorY, 0, cursorX, cursorY, 8)
    glow.addColorStop(0, cursorColor + 'ff')
    glow.addColorStop(0.4, cursorColor + '80')
    glow.addColorStop(1, cursorColor + '00')
    ctx.beginPath()
    ctx.fillStyle = glow
    ctx.arc(cursorX, cursorY, 8, 0, Math.PI * 2)
    ctx.fill()

    ctx.beginPath()
    ctx.fillStyle = cursorColor
    ctx.arc(cursorX, cursorY, 3, 0, Math.PI * 2)
    ctx.fill()

    // ── 7. Hover tooltip ─────────────────────────────────────────────────────
    if (mouseXRef.current !== null) {
      const mx = mouseXRef.current
      // Find closest point
      let closest = null
      let closestDist = Infinity
      visible.forEach((d) => {
        const x = toX(d.timestamp)
        const dist = Math.abs(x - mx)
        if (dist < closestDist) {
          closestDist = dist
          closest = d
        }
      })

      if (closest && closestDist < 30) {
        const px = toX(closest.timestamp)
        const py = toY(closest.vpin || 0)

        // Vertical line at hover
        ctx.beginPath()
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.moveTo(px, 0)
        ctx.lineTo(px, H)
        ctx.stroke()
        ctx.setLineDash([])

        // Dot
        ctx.beginPath()
        ctx.fillStyle = '#ffffff'
        ctx.arc(px, py, 3, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Y-axis label
    ctx.fillStyle = 'rgba(255,255,255,0.2)'
    ctx.font = '9px "IBM Plex Mono", monospace'
    ctx.textAlign = 'right'
    ctx.fillText('VPIN', W - 4, 12)
  }, [metricHistory, currentPhase, signals])

  // Animate cursor via rAF
  useEffect(() => {
    function frame() {
      draw()
      rafRef.current = requestAnimationFrame(frame)
    }
    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  // Resize canvas to actual pixel size
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const container = canvas.parentElement
    function resize() {
      const dpr = window.devicePixelRatio || 1
      const w = container.clientWidth
      const h = 180
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  function handleMouseMove(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    mouseXRef.current = e.clientX - rect.left

    // Update tooltip state for React overlay
    const metHist = state?.metricHistory || []
    if (metHist.length < 2) return
    const now = Date.now()
    const windowStart = now - WINDOW_MS
    const W = rect.width
    const mx = mouseXRef.current

    const toTs = (x) => windowStart + (x / W) * WINDOW_MS
    const hoverTs = toTs(mx)

    let closest = null
    let closestDist = Infinity
    metHist.forEach((d) => {
      const dist = Math.abs(d.timestamp - hoverTs)
      if (dist < closestDist) {
        closestDist = dist
        closest = d
      }
    })

    if (closest && closestDist < 60000) {
      const toX = (ts) => ((ts - windowStart) / WINDOW_MS) * W
      const x = toX(closest.timestamp)
      const left = x + 12 > W - 160 ? x - 140 : x + 12
      setTooltip({
        left,
        top: 20,
        data: closest,
      })
    } else {
      setTooltip(null)
    }
  }

  function handleMouseLeave() {
    mouseXRef.current = null
    setTooltip(null)
  }

  function formatTime(ts) {
    if (!ts) return '--'
    const d = new Date(ts)
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div
      className="timeline-canvas-wrap"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas ref={canvasRef} className="timeline-canvas" />
      {tooltip && (
        <div
          className="timeline-tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <div style={{ color: 'var(--text-dim)', marginBottom: 3 }}>
            {formatTime(tooltip.data.timestamp)}
          </div>
          <div>VPIN: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{(tooltip.data.vpin || 0).toFixed(3)}</span></div>
          <div>OFI: <span style={{ color: (tooltip.data.ofi || 0) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
            {(tooltip.data.ofi || 0) >= 0 ? '+' : ''}{(tooltip.data.ofi || 0).toFixed(3)}
          </span></div>
          <div>TAR: <span style={{ color: 'var(--text-primary)' }}>{((tooltip.data.tar || 0) * 100).toFixed(0)}%</span></div>
          {tooltip.data.price != null && (
            <div>Price: <span style={{ color: 'var(--text-primary)' }}>
              ${typeof tooltip.data.price === 'number'
                ? tooltip.data.price >= 1000
                  ? tooltip.data.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : tooltip.data.price.toFixed(4)
                : '-'}
            </span></div>
          )}
          <div>Phase: <span style={{ color: PHASE_COLORS[tooltip.data.phase || 1] }}>{tooltip.data.phase || 1}</span></div>
        </div>
      )}
    </div>
  )
}
