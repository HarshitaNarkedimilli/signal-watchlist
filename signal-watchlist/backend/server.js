// server.js — REST API for Signal.
// Deliberately built on Node's built-in http module: no express, no
// npm install required. Swap in express later if the routing grows;
// the route handlers below are already isolated per-concern.

const http = require('http');
const url = require('url');
const store = require('./store');
const { computeChange } = require('./scoring');
const { getQuote, getHistory } = require('./market');

const PORT = process.env.PORT || 3001;

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const parts = parsed.pathname.split('/').filter(Boolean); // e.g. ['api','watchlist']

  if (req.method === 'OPTIONS') return sendJSON(res, 204, {});

  try {
    // GET /api/watchlist — just the list of tracked symbols
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'watchlist' && parts.length === 2) {
      return sendJSON(res, 200, { symbols: store.getWatchlist() });
    }

    // POST /api/watchlist  { symbol: "AAPL" } — add a symbol
    if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'watchlist') {
      const body = await readBody(req);
      if (!body.symbol) return sendJSON(res, 400, { error: 'symbol is required' });
      const symbols = store.addSymbol(body.symbol);
      return sendJSON(res, 201, { symbols });
    }

    // DELETE /api/watchlist/AAPL — remove a symbol
    if (req.method === 'DELETE' && parts[0] === 'api' && parts[1] === 'watchlist' && parts[2]) {
      const symbols = store.removeSymbol(decodeURIComponent(parts[2]));
      return sendJSON(res, 200, { symbols });
    }

    // GET /api/feed — the core product: "what changed since I last checked"
    // Computes a score per symbol against its stored last-seen snapshot,
    // returns them ranked, and updates the snapshot to "now" so next visit
    // diffs from this point forward.
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'feed') {
      const symbols = store.getWatchlist();
      const snapshots = store.getSnapshots();

      const results = symbols.map((symbol) => {
        const change = computeChange(symbol, snapshots[symbol]);
        return change;
      });

      // Persist new snapshots so the next visit diffs from *this* moment —
      // this is what makes "since you left" work across sessions/devices.
      for (const r of results) {
        store.setSnapshot(r.symbol, { price: r.price, asOf: r.asOf });
      }

      results.sort((a, b) => b.score - a.score);
      const meaningful = results.filter((r) => r.isMeaningful);
      const quiet = results.filter((r) => !r.isMeaningful);

      return sendJSON(res, 200, { meaningful, quiet, generatedAt: Date.now() });
    }

    // GET /api/symbol/AAPL/history — sparkline data for a single symbol
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'symbol' && parts[3] === 'history') {
      const symbol = decodeURIComponent(parts[2]).toUpperCase();
      const quote = getQuote(symbol);
      const history = getHistory(symbol);
      return sendJSON(res, 200, { quote, history });
    }

    return sendJSON(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return sendJSON(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  console.log(`Signal backend running at http://localhost:${PORT}`);
});
