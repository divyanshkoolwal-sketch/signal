import React, { useEffect, useRef } from 'react'
import useStore from '../store/useStore.js'

const AUTO_DISMISS_MS = 15000

function NotificationItem({ notif }) {
  const { removeNotification, openTradePanel } = useStore()
  const timerRef = useRef(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      removeNotification(notif.id)
    }, AUTO_DISMISS_MS)
    return () => clearTimeout(timerRef.current)
  }, [notif.id]) // eslint-disable-line

  function handleTrade() {
    removeNotification(notif.id)
    openTradePanel(notif.pair)
  }

  return (
    <div className="notification-banner">
      <div className="notif-icon">⚡</div>
      <div className="notif-content">
        <div className="notif-title">{notif.message || `${notif.pair} — PHASE TRANSITION`}</div>
        <div className="notif-sub">
          {notif.pair} · Phase {notif.phase} · {notif.phaseLabel}
        </div>
      </div>
      <button className="notif-trade-btn" onClick={handleTrade}>
        TRADE NOW
      </button>
      <button
        className="notif-close-btn"
        onClick={() => removeNotification(notif.id)}
      >
        ✕
      </button>
    </div>
  )
}

export default function NotificationBanner() {
  const { notifications } = useStore()

  if (notifications.length === 0) return null

  return (
    <div className="notification-container">
      {notifications.map((notif) => (
        <NotificationItem key={notif.id} notif={notif} />
      ))}
    </div>
  )
}
