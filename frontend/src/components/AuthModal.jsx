import React, { useState } from 'react'
import useStore from '../store/useStore.js'

export default function AuthModal() {
  const { setAuthConnected } = useStore()
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleConnect() {
    if (!apiKey.trim() || !apiSecret.trim()) {
      setError('Please enter both API key and secret.')
      return
    }
    setLoading(true)
    setError('')

    try {
      const resp = await fetch('http://localhost:4000/api/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, apiSecret }),
      })
      if (resp.ok) {
        setAuthConnected(true)
      } else {
        const data = await resp.json().catch(() => ({}))
        setError(data.error || 'Connection failed. Check your credentials.')
      }
    } catch (e) {
      setError('Unable to reach server. Continue in demo mode.')
    } finally {
      setLoading(false)
    }
  }

  function handleDemo() {
    setAuthConnected(true)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleConnect()
  }

  return (
    <div className="auth-modal-overlay">
      <div className="auth-modal">
        <div className="auth-modal-logo">
          SIG<span>N</span>AL
        </div>
        <div className="auth-modal-tagline">Who knew first?</div>

        <p className="auth-modal-title">
          Connect your Liquid account to enable live trading.<br />
          Or continue in demo mode to explore the terminal.
        </p>

        <input
          type="text"
          className="auth-input"
          placeholder="API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />

        <input
          type="password"
          className="auth-input"
          placeholder="API Secret"
          value={apiSecret}
          onChange={(e) => setApiSecret(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />

        {error && (
          <div style={{
            color: 'var(--red)',
            fontSize: 11,
            marginBottom: 8,
            textAlign: 'center',
            lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <button
          className="auth-connect-btn"
          onClick={handleConnect}
          disabled={loading}
        >
          {loading ? 'CONNECTING…' : 'CONNECT ACCOUNT'}
        </button>

        <button className="auth-demo-link" onClick={handleDemo}>
          Continue in demo mode
        </button>
      </div>
    </div>
  )
}
