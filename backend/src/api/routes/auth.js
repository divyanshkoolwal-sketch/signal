/**
 * Auth routes
 *
 * POST /api/auth/connect  - Connect Liquid API credentials
 * GET  /api/auth/status   - Check connection status
 */

import express from 'express';
import fetch   from 'node-fetch';
import CryptoJS from 'crypto-js';

const router = express.Router();

// In-memory credential store – seeded from environment variables at startup
let _credentials = (process.env.LIQUID_API_KEY && process.env.LIQUID_API_SECRET)
  ? { apiKey: process.env.LIQUID_API_KEY, apiSecret: process.env.LIQUID_API_SECRET }
  : null;

// ---------------------------------------------------------------------------
// Liquid API authentication helper
// ---------------------------------------------------------------------------

/**
 * Build Liquid API auth headers.
 * Liquid uses HMAC-SHA256 JWT-style auth:
 *   signature = HMAC-SHA256(path + nonce, apiSecret)
 *   headers: X-Quoine-API-Version, X-Quoine-Auth
 */
function buildAuthHeaders(apiKey, apiSecret, path) {
  const nonce = Date.now().toString();
  const message = path + nonce;

  const signature = CryptoJS.HmacSHA256(message, apiSecret).toString(CryptoJS.enc.Hex);

  // Liquid uses a token format: apiKey:nonce:signature
  const token = Buffer.from(`${apiKey}:${nonce}:${signature}`).toString('base64');

  return {
    'X-Quoine-API-Version': '2',
    'X-Quoine-Auth': token,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// POST /api/auth/connect
// ---------------------------------------------------------------------------
router.post('/connect', async (req, res) => {
  const { apiKey, apiSecret } = req.body ?? {};

  if (!apiKey || !apiSecret) {
    return res.status(400).json({ success: false, error: 'apiKey and apiSecret are required' });
  }

  try {
    const path    = '/fiat_accounts';
    const headers = buildAuthHeaders(apiKey, apiSecret, path);
    const url     = `https://api.liquid.com${path}`;

    const response = await fetch(url, {
      method:  'GET',
      headers,
    });

    if (response.status === 401 || response.status === 403) {
      return res.json({ success: false, error: 'Invalid API credentials' });
    }

    if (!response.ok) {
      const body = await response.text();
      return res.json({ success: false, error: `Liquid API error ${response.status}: ${body}` });
    }

    // Credentials valid – store in memory
    _credentials = { apiKey, apiSecret };
    return res.json({ success: true });

  } catch (err) {
    console.error('[auth/connect] Error:', err.message);
    // Network or other error – still try to store if we just can't reach Liquid
    // (for demo purposes, allow connecting even if Liquid is unreachable)
    if (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.message.includes('fetch')) {
      _credentials = { apiKey, apiSecret };
      return res.json({ success: true, warning: 'Liquid API unreachable; credentials stored for demo.' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/auth/status
// ---------------------------------------------------------------------------
router.get('/status', (req, res) => {
  res.json({ connected: _credentials !== null });
});

// ---------------------------------------------------------------------------
// Export helpers for other routes
// ---------------------------------------------------------------------------
export function getCredentials() { return _credentials; }
export function hasCredentials() { return _credentials !== null; }
export function buildLiquidHeaders(path) {
  if (!_credentials) throw new Error('Not connected – call /api/auth/connect first');
  return buildAuthHeaders(_credentials.apiKey, _credentials.apiSecret, path);
}

export default router;
