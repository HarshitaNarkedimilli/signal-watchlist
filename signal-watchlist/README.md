# Signal — a watchlist that tells you what actually changed

Most watchlists show you everything. Signal shows you what deserves your
attention: since you last checked, what moved outside its *own* normal range,
and why.

## Quick start (no npm install required)

The backend uses only Node's built-in `http` module — nothing to install.

```bash
# Terminal 1 — backend
cd backend
node server.js
# -> Signal backend running at http://localhost:3001

# Terminal 2 — frontend (any static server works)
cd frontend
python3 -m http.server 8080
# -> open http://localhost:8080
```

The frontend defaults to talking to `http://localhost:3001`. To point it at a
different backend host, set `window.SIGNAL_API_BASE` before `app.js` loads
(e.g. add a small `<script>window.SIGNAL_API_BASE = "https://your-api"</script>`
before the `app.js` include in `index.html`).

## What "meaningful change" means here

A flat percentage move isn't the right yardstick — 1% means something
different for a sleepy utility stock than for a small-cap. So every symbol's
move is scored against **its own rolling volatility**, combined with:

- **Volatility-adjusted price move** — how many "normal" standard deviations
  did this move represent for this specific stock (up to 60 of 100 points)
- **Volume anomaly** — is trading volume unusually high vs. this stock's own
  baseline (up to 30 points)
- **Event correlation** — did an earnings/news-like event happen since you
  last looked (up to 10 points)

Anything scoring 35+ lands in "Worth a look"; everything else is collapsed
into a quiet, de-emphasized "Unchanged" section you can expand.

## How state persists across sessions/devices

Each symbol has a server-side "last seen" snapshot (`backend/data/snapshots.json`)
recording the price and timestamp from the last time the feed was computed.
Because this lives on the server rather than in browser storage, "what changed
since I left" is consistent whether you check from your phone or your laptop.
Swapping the JSON file for Postgres/Redis is a drop-in change — only
`store.js` would need to change, not the API or scoring logic.

## Handling stale, delayed, or conflicting data

Every quote carries an `asOf` timestamp and a `confidence` field. The UI shows
"as of Xs ago" rather than implying everything is real-time. In a production
integration with a real feed, `confidence` would reflect actual source
latency (delayed quote vs. live tick), and conflicting sources would be
resolved by preferring the most recent, most reliable feed rather than
averaging them — averaging a stale value into a live one just makes both
wrong.

## Scaling

`market.js` currently ticks every tracked symbol on a fixed interval, which is
fine for a demo watchlist. The design intentionally isolates the *polling*
layer (`market.js`) from the *scoring* layer (`scoring.js`) and the *state*
layer (`store.js`) specifically so this can evolve:

- Poll frequency can scale per-symbol by demand (popular symbols refresh
  faster; long-tail symbols refresh slower) and by market hours, instead of
  polling every symbol identically.
- Snapshot storage can move from a single JSON file to a real database
  without touching the scoring logic.
- The scoring computation is stateless per request, so it can be moved to a
  background worker that pre-computes feeds instead of computing on read, if
  read volume grows.

## Where this stays simple on purpose

No real-time tick-by-tick WebSocket stream for MVP. A "what changed since I
left" product doesn't need every tick — it needs a correct, well-reasoned
summary on return visits. Building a live ticking price feed would be a
different product than the one this brief asks for.

## Project structure

```
backend/
  server.js     REST API (http server, zero dependencies)
  market.js     simulated market data feed + rolling volatility
  scoring.js    "meaningful change" scoring logic
  store.js      JSON-file persistence (watchlist + last-seen snapshots)
  data/         created at runtime, gitignored
frontend/
  index.html
  style.css
  app.js        fetches the feed, renders it, handles add/remove
```

## API

| Method | Path                          | Description                          |
|--------|-------------------------------|---------------------------------------|
| GET    | `/api/watchlist`              | Current tracked symbols               |
| POST   | `/api/watchlist`               | Add a symbol — body `{ "symbol": "AAPL" }` |
| DELETE | `/api/watchlist/:symbol`      | Remove a symbol                       |
| GET    | `/api/feed`                   | Ranked "since you left" feed          |
| GET    | `/api/symbol/:symbol/history` | Recent price/volume history           |

## Note on market data

This project simulates market data (a self-consistent random walk per symbol,
with occasional volume/event spikes) rather than calling a paid market data
API, so it runs fully offline with no API keys. `market.js` is the only file
that would change to plug in a real feed (e.g. Finnhub, Polygon, IEX Cloud) —
the scoring and storage layers only depend on the shape of a quote
(`price`, `volume`, `asOf`), not where it comes from.
