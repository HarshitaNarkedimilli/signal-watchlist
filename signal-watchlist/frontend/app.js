// app.js — talks to the Signal backend and renders the ledger.
// No framework/build step on purpose: this is meant to run by just
// opening index.html (or a plain static server) with zero setup.

const API_BASE = window.SIGNAL_API_BASE || 'http://localhost:3001';

const els = {
  clock: document.getElementById('clock'),
  input: document.getElementById('symbol-input'),
  addBtn: document.getElementById('add-btn'),
  addError: document.getElementById('add-error'),
  meaningfulList: document.getElementById('meaningful-list'),
  meaningfulEmpty: document.getElementById('meaningful-empty'),
  quietList: document.getElementById('quiet-list'),
  quietToggle: document.getElementById('quiet-toggle'),
  quietCount: document.getElementById('quiet-count'),
  refreshBtn: document.getElementById('refresh-btn'),
  status: document.getElementById('status-line'),
};

function tickClock() {
  els.clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
setInterval(tickClock, 1000);
tickClock();

function timeAgo(ts) {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `${mins}m ago`;
}

function pctClass(pct) {
  if (pct > 0.05) return 'up';
  if (pct < -0.05) return 'down';
  return 'flat';
}

function renderRow(item, { compact }) {
  const dir = pctClass(item.pctMove);
  const rowDirClass = dir === 'flat' ? '' : dir;

  const row = document.createElement('div');
  row.className = `row ${rowDirClass}`;

  row.innerHTML = `
    <div class="bar"></div>
    <div class="row-main">
      <div class="row-top">
        <span class="symbol">${item.symbol}</span>
        <span class="price">$${item.price.toFixed(2)}</span>
        <span class="pct ${dir}">${item.pctMove > 0 ? '+' : ''}${item.pctMove.toFixed(2)}%</span>
      </div>
      ${compact ? '' : `<div class="reason">${item.reason}</div>`}
    </div>
    <div class="row-side">
      ${compact ? '' : `<span class="score">score ${item.score}</span>`}
      <button class="remove-btn" data-symbol="${item.symbol}">remove</button>
      <span class="as-of">${timeAgo(item.asOf)}</span>
    </div>
  `;
  return row;
}

async function loadFeed() {
  els.status.textContent = 'Checking watchlist…';
  try {
    const res = await fetch(`${API_BASE}/api/feed`);
    if (!res.ok) throw new Error('feed request failed');
    const data = await res.json();

    els.meaningfulList.innerHTML = '';
    els.quietList.innerHTML = '';

    if (data.meaningful.length === 0) {
      els.meaningfulEmpty.hidden = false;
    } else {
      els.meaningfulEmpty.hidden = true;
      data.meaningful.forEach((item) => {
        els.meaningfulList.appendChild(renderRow(item, { compact: false }));
      });
    }

    data.quiet.forEach((item) => {
      els.quietList.appendChild(renderRow(item, { compact: true }));
    });

    els.quietCount.textContent = `Unchanged (${data.quiet.length})`;

    const total = data.meaningful.length + data.quiet.length;
    els.status.textContent = total === 0
      ? 'Your watchlist is empty — add a symbol above.'
      : `Watching ${total} symbol${total === 1 ? '' : 's'} · updated ${new Date(data.generatedAt).toLocaleTimeString()}`;
  } catch (err) {
    els.status.textContent = `Could not reach the backend at ${API_BASE}. Is it running?`;
  }
}

async function addSymbol() {
  const symbol = els.input.value.trim().toUpperCase();
  els.addError.textContent = '';
  if (!symbol) return;
  if (!/^[A-Z.]{1,8}$/.test(symbol)) {
    els.addError.textContent = 'Use a plain ticker, e.g. AAPL';
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol }),
    });
    if (!res.ok) throw new Error('add failed');
    els.input.value = '';
    await loadFeed();
  } catch {
    els.addError.textContent = 'Could not add symbol — check the backend is running.';
  }
}

async function removeSymbol(symbol) {
  try {
    await fetch(`${API_BASE}/api/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    await loadFeed();
  } catch {
    els.status.textContent = 'Could not remove symbol — check the backend is running.';
  }
}

// --- event wiring ---
els.addBtn.addEventListener('click', addSymbol);
els.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSymbol(); });
els.refreshBtn.addEventListener('click', loadFeed);

els.quietToggle.addEventListener('click', () => {
  const expanded = els.quietToggle.getAttribute('aria-expanded') === 'true';
  els.quietToggle.setAttribute('aria-expanded', String(!expanded));
  els.quietList.hidden = expanded;
});
els.quietToggle.setAttribute('aria-expanded', 'false');

document.addEventListener('click', (e) => {
  if (e.target.matches('.remove-btn')) {
    removeSymbol(e.target.dataset.symbol);
  }
});

// initial load + periodic refresh (client-side poll; server-side polling
// interval is what actually determines data freshness — see market.js)
loadFeed();
setInterval(loadFeed, 15000);
