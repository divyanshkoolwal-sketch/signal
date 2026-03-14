import React, { useEffect, useRef, useState } from 'react'
import useStore from './store/useStore.js'
import Sidebar from './components/Sidebar.jsx'
import MainStage from './components/MainStage.jsx'
import TradePanel from './components/TradePanel.jsx'
import NotificationBanner from './components/NotificationBanner.jsx'
import SplashScreen from './components/SplashScreen.jsx'

const WS_URL = 'ws://localhost:4000'

export default function App() {
  const {
    tradePanelOpen,
    setMarket,
    setConnected,
    alerts,
    addNotification,
    openTradePanel,
  } = useStore()

  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const reconnectDelay = useRef(1000)
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1400)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectDelay.current = 1000
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === 'MARKET_UPDATE') {
            const { pair, state } = msg
            setMarket(pair, state)
          }

          if (msg.type === 'PHASE_TRANSITION') {
            const { pair, newPhase, phaseLabel } = msg
            const matchingAlerts = alerts.filter(
              (a) => a.pair === pair && a.targetPhase === newPhase
            )
            matchingAlerts.forEach(() => {
              addNotification({
                pair,
                phase: newPhase,
                phaseLabel: phaseLabel || `Phase ${newPhase}`,
                message: `${pair} — ${(phaseLabel || `PHASE ${newPhase}`).toUpperCase()} DETECTED`,
              })
            })
            // Always notify on phase 2 or 3 transitions
            if (newPhase === 2 || newPhase === 3) {
              addNotification({
                pair,
                phase: newPhase,
                phaseLabel: phaseLabel || `Phase ${newPhase}`,
                message: `${pair} — ${(phaseLabel || `PHASE ${newPhase}`).toUpperCase()} DETECTED`,
              })
            }
          }
        } catch (e) {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        setConnected(false)
        reconnectTimerRef.current = setTimeout(() => {
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000)
          connect()
        }, reconnectDelay.current)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimerRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, []) // eslint-disable-line

  return (
    <div className="app">
      {showSplash && <SplashScreen />}
      <Sidebar />
      <MainStage />
      {tradePanelOpen && <TradePanel />}
      <NotificationBanner />
    </div>
  )
}
