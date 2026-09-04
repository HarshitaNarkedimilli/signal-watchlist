// market.js — simulated market data engine.
//
// In production this would poll a real feed (IEX, Polygon, Finnhub, etc).
// For this project it runs a self-consistent random walk per symbol so the
// "meaningful change" logic has real, evolving data to work against —
// the scoring logic below doesn't care where the numbers come from.
//
// Each symbol keeps a short rolling history so we can compute its own
// baseline volatility instead of judging every stock by the same fixed
// percentage threshold.

const SEED_PRICES = {
  AAPL: 190, TSLA: 250, NVDA: 120, MSFT: 420, AMZN: 185,
  GOOGL: 165, META: 500, NFLX: 680, AMD: 145, INTC: 32,
};

const state = {}; // symbol -> { price, volume, history: [{price, volume, ts}], baseVol }

function seedSymbol(symbol) {
  const base = SEED_PRICES[symbol] || 50 + Math.random() * 200;
  state[symbol] = {
    price: base,
    volume: 1_000_000 + Math.random() * 500_000,
    baseVolume: 1_000_000 + Math.random() * 500_000,
    history: [{ price: base, volume: 1_000_000, ts: Date.now() }],
    // baseline volatility as a fraction of price — this is what lets a 1%
    // move mean something different for a sleepy stock vs a volatile one.
    baseVol: 0.005 + Math.random() * 0.02,
  };
}

function ensureSymbol(symbol) {
  if (!state[symbol]) seedSymbol(symbol);
  return state[symbol];
}

// Advance every tracked symbol by one simulated tick.
function tick() {
  for (const symbol of Object.keys(state)) {
    const s = state[symbol];

    // Random walk scaled by the symbol's own volatility, plus an occasional
    // "event" spike to simulate news/earnings-driven jumps and volume surges.
    const isEvent = Math.random() < 0.03;
    const shock = isEvent ? (Math.random() - 0.5) * s.baseVol * 8 : (Math.random() - 0.5) * s.baseVol * 2;
    s.price = Math.max(0.5, s.price * (1 + shock));

    const volumeShock = isEvent ? 2 + Math.random() * 3 : 0.7 + Math.random() * 0.6;
    s.volume = s.baseVolume * volumeShock;

    s.history.push({ price: s.price, volume: s.volume, ts: Date.now(), event: isEvent });
    if (s.history.length > 200) s.history.shift();
  }
}

function getQuote(symbol) {
  const s = ensureSymbol(symbol);
  return {
    symbol,
    price: Number(s.price.toFixed(2)),
    volume: Math.round(s.volume),
    baseVolume: Math.round(s.baseVolume),
    asOf: Date.now(),
    // A simulated feed is always "fresh"; a real integration would set this
    // based on the actual source latency (delayed quote, stale cache, etc).
    confidence: 'live',
  };
}

function getHistory(symbol) {
  const s = ensureSymbol(symbol);
  return s.history;
}

// Rolling volatility (stdev of recent % returns) — this is the denominator
// that turns a raw price move into a "how unusual is this, for THIS stock" score.
function getRollingVolatility(symbol) {
  const s = ensureSymbol(symbol);
  const prices = s.history.slice(-30).map((h) => h.price);
  if (prices.length < 3) return s.baseVol;
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
  return Math.max(Math.sqrt(variance), 0.002); // floor so we never divide by ~0
}

// simulate a tick every 4 seconds while the server is running
setInterval(tick, 4000);

module.exports = { ensureSymbol, getQuote, getHistory, getRollingVolatility };
