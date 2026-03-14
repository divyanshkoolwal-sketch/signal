import React, { useEffect, useState } from 'react'
import useStore from '../store/useStore.js'
import PhaseCard from './PhaseCard.jsx'

export default function MarketGrid() {
  const { markets } = useStore()
  const pairs = Object.keys(markets)
  const [timeStr, setTimeStr] = useState('')

  useEffect(() => {
    function tick() {
      setTimeStr(new Date().toLocaleTimeString('en-US', { hour12: false }))
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="market-grid-container">
      <div className="market-grid-header">
        <span className="market-grid-title">Market Overview</span>
        <span className="market-grid-time">{timeStr} UTC</span>
      </div>

      {pairs.length === 0 ? (
        <div className="no-data-placeholder" style={{ height: 300 }}>
          <span style={{ fontSize: 24 }}>⬡</span>
          <span className="loading-dots">
            Waiting for market data<span>.</span><span>.</span><span>.</span>
          </span>
        </div>
      ) : (
        <div className="market-grid">
          {pairs.map((pair) => (
            <div className="phase-card-wrapper" key={pair}>
              <PhaseCard pair={pair} state={markets[pair]} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
