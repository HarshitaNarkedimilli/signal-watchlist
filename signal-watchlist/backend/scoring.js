// scoring.js — turns "price moved" into "does this deserve attention".
//
// This is the core product decision of Signal: a meaningful change is NOT
// just a large percentage move. It's a move that's large *relative to what's
// normal for that stock*, reinforced by unusual volume and/or a news event.
//
// score breakdown (0–100):
//   - volatility-adjusted price move   (up to 60 pts)
//   - volume anomaly                    (up to 30 pts)
//   - event flag (earnings/news-like)   (up to 10 pts)

const { getQuote, getHistory, getRollingVolatility } = require('./market');

function computeChange(symbol, lastSnapshot) {
  const quote = getQuote(symbol);
  const history = getHistory(symbol);
  const vol = getRollingVolatility(symbol);

  const lastPrice = lastSnapshot ? lastSnapshot.price : quote.price;
  const pctMove = lastPrice ? (quote.price - lastPrice) / lastPrice : 0;

  // How many "normal standard deviations" did this move represent?
  const zScore = Math.abs(pctMove) / vol;
  const moveScore = Math.min(60, zScore * 20);

  // Volume vs this symbol's own baseline
  const volumeRatio = quote.volume / (quote.baseVolume || quote.volume);
  const volumeScore = Math.min(30, Math.max(0, (volumeRatio - 1) * 25));

  // Did an "event" tick happen since last seen? (stand-in for real news/filing correlation)
  const sinceTs = lastSnapshot ? lastSnapshot.asOf : quote.asOf;
  const eventSinceLastSeen = history.some((h) => h.ts > sinceTs && h.event);
  const eventScore = eventSinceLastSeen ? 10 : 0;

  const score = Math.round(moveScore + volumeScore + eventScore);

  let reason;
  if (eventSinceLastSeen && Math.abs(pctMove) > vol) {
    reason = 'Sharp move alongside an unusual trading event';
  } else if (volumeRatio > 1.8) {
    reason = 'Volume spike well above normal';
  } else if (zScore > 1.5) {
    reason = `Move of ${(pctMove * 100).toFixed(1)}% is large for this stock's usual range`;
  } else if (Math.abs(pctMove) < vol * 0.3) {
    reason = 'Within normal day-to-day noise';
  } else {
    reason = 'Modest move, nothing unusual yet';
  }

  return {
    symbol,
    price: quote.price,
    pctMove: Number((pctMove * 100).toFixed(2)),
    volumeRatio: Number(volumeRatio.toFixed(2)),
    score,
    reason,
    asOf: quote.asOf,
    confidence: quote.confidence,
    isMeaningful: score >= 35,
  };
}

module.exports = { computeChange };
