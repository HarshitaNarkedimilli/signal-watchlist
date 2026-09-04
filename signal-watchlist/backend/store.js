// store.js — tiny JSON-file persistence layer.
// No database dependency so the project runs with zero `npm install`.
// Swap this for Postgres/Mongo later without touching the API layer —
// every function here just needs to keep returning the same shapes.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const WATCHLIST_FILE = path.join(DATA_DIR, 'watchlist.json');
const SNAPSHOTS_FILE = path.join(DATA_DIR, 'snapshots.json');

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WATCHLIST_FILE)) {
    fs.writeFileSync(WATCHLIST_FILE, JSON.stringify({ symbols: ['AAPL', 'TSLA', 'NVDA'] }, null, 2));
  }
  if (!fs.existsSync(SNAPSHOTS_FILE)) {
    fs.writeFileSync(SNAPSHOTS_FILE, JSON.stringify({}, null, 2));
  }
}

function readJSON(file) {
  ensureDataFiles();
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Watchlist ---
function getWatchlist() {
  return readJSON(WATCHLIST_FILE).symbols;
}

function addSymbol(symbol) {
  const data = readJSON(WATCHLIST_FILE);
  const sym = symbol.toUpperCase().trim();
  if (!data.symbols.includes(sym)) data.symbols.push(sym);
  writeJSON(WATCHLIST_FILE, data);
  return data.symbols;
}

function removeSymbol(symbol) {
  const data = readJSON(WATCHLIST_FILE);
  const sym = symbol.toUpperCase().trim();
  data.symbols = data.symbols.filter((s) => s !== sym);
  writeJSON(WATCHLIST_FILE, data);
  return data.symbols;
}

// --- "Last seen" snapshots: what the user saw the last time they checked ---
// This is the piece that makes "what changed since I left" possible across
// sessions/devices — it's stored server-side, keyed by symbol.
function getSnapshots() {
  return readJSON(SNAPSHOTS_FILE);
}

function setSnapshot(symbol, snapshot) {
  const data = readJSON(SNAPSHOTS_FILE);
  data[symbol.toUpperCase()] = snapshot;
  writeJSON(SNAPSHOTS_FILE, data);
}

module.exports = {
  getWatchlist,
  addSymbol,
  removeSymbol,
  getSnapshots,
  setSnapshot,
};
