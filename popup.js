import { API_KEY } from './config.js';
import { getSettings, saveSettings } from './settings.js';

const TEAM_ID = 81;
const BASE_URL = 'https://api.football-data.org/v4';
const REFRESH_INTERVAL = 60 * 1000;
const REFRESH_INTERVAL_LIVE = 30 * 1000;
const FETCH_TIMEOUT = 10000;
const CACHE_KEY = 'fcb_popup_cache';  // stored in chrome.storage.local
const CACHE_TTL = 60 * 1000;          // reuse cached data if < 60 s old

let isFetching = false;
let pulseInterval = null;
let countdownInterval = null;
let nextFixtureDate = null;
let liveMinuteTicker = null;
let mainRefreshInterval = null;
let liveMatchKickoff = null;

// Feature state
let allFixtures = [];
let allResults = [];
let activeFilter = 'All';
let showAllResults = false;
let lastKnownGoalCount = 0;
let showLineup = false;
let activeStandingsTab = 'laliga';
let cachedUclRow = null;
let cachedLaLigaRow = null;
let goalToastTimer = null;

// ── Popup-level response cache ────────────────────────────────────────────
async function saveCache(payload) {
  await chrome.storage.local.set({ [CACHE_KEY]: { ts: Date.now(), payload } });
}
async function loadCache() {
  const data = await chrome.storage.local.get(CACHE_KEY);
  const entry = data[CACHE_KEY];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) return null; // expired
  return entry.payload;
}

function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function getOpponent(match) {
  return match.awayTeam.id === TEAM_ID
    ? match.homeTeam.shortName
    : match.awayTeam.shortName;
}

function formatDate(utcDate) {
  return new Date(utcDate).toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatMatchTime(status, minute) {
  if (status === 'HALF_TIME') return 'HT';
  if (status === 'FINISHED') return 'FT';
  if (status === 'IN_PLAY' || status === 'PAUSED') {
    return minute != null ? `${minute}'` : 'LIVE';
  }
  return '';
}

function getLiveScore(match) {
  // During an in-play match the authoritative score is in regularTime (or halfTime);
  // fullTime is only populated once the match finishes.
  const s = match.score || {};
  const home = s.regularTime?.home ?? s.halfTime?.home ?? s.fullTime?.home ?? '-';
  const away = s.regularTime?.away ?? s.halfTime?.away ?? s.fullTime?.away ?? '-';
  return { home, away };
}

function getResultMeta(r) {
  if (r.score.winner === 'DRAW') return { label: 'D', cls: 'badge-d' };
  const won = (r.score.winner === 'HOME_TEAM' && r.homeTeam.id === TEAM_ID) ||
    (r.score.winner === 'AWAY_TEAM' && r.awayTeam.id === TEAM_ID);
  return won ? { label: 'W', cls: 'badge-w' } : { label: 'L', cls: 'badge-l' };
}

function formatCountdown(utcDate) {
  const diff = new Date(utcDate) - Date.now();
  if (diff <= 0) return 'Now';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function isHome(match) {
  return match.homeTeam.id === TEAM_ID;
}

function getCompetitionKey(name) {
  if (!name) return 'Other';
  const n = name.toLowerCase();
  if (n.includes('primera') || n.includes('liga')) return 'La Liga';
  if (n.includes('champions')) return 'UCL';
  if (n.includes('copa') || n.includes('king')) return 'Copa';
  return name;
}

function el(id) { return document.getElementById(id); }

// Feature 3: Goal toast
function showGoalToast(scorer, isBarca, barcaScore, oppScore) {
  const toast = el('goalToast');
  if (!toast) return;
  clearTimeout(goalToastTimer);
  toast.className = `goal-toast ${isBarca ? 'barca' : 'against'} show`;
  toast.innerHTML = isBarca
    ? `<span class="toast-icon">⚽</span><span class="toast-text"><strong>${scorer}</strong> scores! &nbsp;${barcaScore}–${oppScore}</span>`
    : `<span class="toast-icon">😤</span><span class="toast-text">Goal against — <strong>${scorer}</strong> &nbsp;${barcaScore}–${oppScore}</span>`;
  goalToastTimer = setTimeout(() => { toast.classList.remove('show'); }, 4000);
}

// Feature 1: Lineup card
function renderLineup(lineups) {
  const card = el('lineupCard');
  if (!card) return;
  if (!lineups || lineups.length < 2) { card.style.display = 'none'; return; }
  const barcaL = lineups.find(l => l.team?.id === TEAM_ID) || lineups[0];
  const oppL = lineups.find(l => l.team?.id !== TEAM_ID) || lineups[1];
  const formatXI = (l) => {
    const players = l?.startXI || [];
    if (!players.length) return '<span class="lineup-empty">Not available</span>';
    return players.map(p => {
      const name = p.player?.name?.split(' ').pop() || '?';
      const num = p.player?.shirtNumber ?? '';
      return `<div class="lineup-player"><span class="lineup-num">${num}</span><span class="lineup-name">${name}</span></div>`;
    }).join('');
  };
  card.style.display = '';
  card.innerHTML = `
    <div class="section-label" style="padding:7px 12px 0">Starting XI</div>
    <div class="lineup-cols">
      <div class="lineup-col">
        <div class="lineup-team-badge barca-side">Barça</div>
        ${formatXI(barcaL)}
      </div>
      <div class="lineup-divider"></div>
      <div class="lineup-col opp-col">
        <div class="lineup-team-badge opp-side">${oppL.team?.shortName || 'Opp'}</div>
        ${formatXI(oppL)}
      </div>
    </div>`;
}

function toggleLineup(lineups) {
  showLineup = !showLineup;
  const btn = el('lineupToggleBtn');
  if (btn) btn.textContent = showLineup ? 'Hide Lineup ▲' : 'Lineup ▼';
  if (showLineup) renderLineup(lineups);
  else { const c = el('lineupCard'); if (c) c.style.display = 'none'; }
}



function startPulse() {
  if (pulseInterval) return;
  let on = true;
  pulseInterval = setInterval(() => {
    const dot = el('liveDot');
    if (dot) dot.classList.toggle('pulse', on);
    on = !on;
  }, 800);
}

function stopPulse() {
  clearInterval(pulseInterval);
  pulseInterval = null;
  const dot = el('liveDot');
  if (dot) dot.classList.remove('pulse');
}

// Ticks the live minute display every ~60 s without a full API call.
function startLiveMinuteTicker(status, initialMinute, kickoffUtc) {
  stopLiveMinuteTicker();
  if (status !== 'IN_PLAY') return; // HT / PAUSED don't need a ticker

  let displayed = initialMinute ?? 0;

  liveMinuteTicker = setInterval(() => {
    displayed = Math.min(displayed + 1, 120);
    const label = `${displayed}'`;
    const minEl = el('liveMinute');
    if (minEl) minEl.textContent = label;
    // Also update the minute inside the live card comp label
    const compEl = el('liveCompLabel');
    if (compEl) {
      compEl.textContent = compEl.textContent.replace(/\d+'$/, label);
    }
  }, 60 * 1000);
}

function stopLiveMinuteTicker() {
  clearInterval(liveMinuteTicker);
  liveMinuteTicker = null;
}

function updateTimestamp() {
  const ts = el('lastUpdated');
  if (ts) {
    const now = new Date();
    ts.textContent = `Updated ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
}

function setReloadSpinning(spinning) {
  const btn = el('reloadBtn');
  if (!btn) return;
  btn.classList.toggle('spinning', spinning);
  btn.disabled = spinning;
}

// minute: the actual current minute (from /matches/{id}), or null; detail: full match detail object
function renderLive(live, minute, detail) {
  const card = el('liveCard');

  if (!live) {
    card.className = 'card';
    card.innerHTML = '<div class="quiet-msg">No live match right now</div>';
    el('liveIndicator').classList.remove('visible');
    stopPulse();
    stopLiveMinuteTicker();
    const lc = el('lineupCard'); if (lc) lc.style.display = 'none';
    return;
  }

  const { home, away } = getLiveScore(live);
  const isBarcaHome = live.homeTeam.id === TEAM_ID;
  const barca = isBarcaHome ? live.homeTeam.shortName : live.awayTeam.shortName;
  const opp = isBarcaHome ? live.awayTeam.shortName : live.homeTeam.shortName;
  const barcaScore = isBarcaHome ? home : away;
  const oppScore = isBarcaHome ? away : home;
  const comp = live.competition?.name || 'Match';
  const status = live.status;
  const timeLabel = formatMatchTime(status, minute);

  // Feature 9: venue + referee
  const venue = detail?.venue || null;
  const referee = detail?.referees?.[0]?.name || null;
  const metaLine = (venue || referee)
    ? `<div class="live-meta-line">${[venue ? '🏟 ' + venue : '', referee ? '🟡 ' + referee : ''].filter(Boolean).join('  ·  ')}</div>`
    : '';

  // Feature 1: lineup toggle
  const hasLineup = detail?.lineups?.length >= 2;
  const lineupBtn = hasLineup
    ? `<div class="live-lineup-row"><button class="lineup-toggle-btn" id="lineupToggleBtn">${showLineup ? 'Hide Lineup ▲' : 'Lineup ▼'}</button></div>`
    : '';

  let statusPill = '';
  if (status === 'IN_PLAY') statusPill = '<span class="live-status-pill in-play">● LIVE</span>';
  if (status === 'HALF_TIME') statusPill = '<span class="live-status-pill half-time">HALF TIME</span>';
  if (status === 'PAUSED') statusPill = '<span class="live-status-pill paused">⏸ PAUSED</span>';
  if (status === 'FINISHED') statusPill = '<span class="live-status-pill finished">FULL TIME</span>';

  card.className = 'card-live';
  card.innerHTML = `
    <div class="live-inner">
      <div class="live-header-row">
        <span class="live-comp-label" id="liveCompLabel">${comp}${timeLabel ? ' · ' + timeLabel : ''}</span>
        ${statusPill}
      </div>
      <div class="live-scoreline">
        <span class="live-team-name">${barca}</span>
        <span class="live-score-num">${barcaScore >= 0 ? barcaScore : '–'}–${oppScore >= 0 ? oppScore : '–'}</span>
        <span class="live-team-name away">${opp}</span>
      </div>
      ${metaLine}
      ${lineupBtn}
    </div>
  `;

  if (hasLineup) {
    el('lineupToggleBtn').addEventListener('click', () => toggleLineup(detail.lineups));
    if (showLineup) renderLineup(detail.lineups);
    else { const lc = el('lineupCard'); if (lc) lc.style.display = 'none'; }
  }

  el('liveIndicator').classList.add('visible');
  el('liveMinute').textContent = timeLabel || 'LIVE';
  startPulse();
  startLiveMinuteTicker(status, minute, live.utcDate);
}


function renderFixtures(fixtures) {
  const card = el('fixturesCard');
  if (!fixtures.length) {
    card.innerHTML = `<div class="section-label">Upcoming</div><div class="quiet-msg">No upcoming fixtures</div>`;
    return;
  }
  nextFixtureDate = fixtures[0].utcDate;
  const rows = fixtures.map((f, i) => {
    const ha = isHome(f) ? '<span class="ha-badge ha-h">H</span>' : '<span class="ha-badge ha-a">A</span>';
    const countdown = i === 0 ? `<span class="countdown" id="countdown">${formatCountdown(f.utcDate)}</span>` : '';
    const q = encodeURIComponent(`FC Barcelona vs ${getOpponent(f)} ${new Date(f.utcDate).toLocaleDateString()}`);
    return `
      <div class="row row-btn${i === 0 ? ' no-border' : ''}" data-url="https://www.google.com/search?q=${q}">
        <div class="row-left">
          <div class="row-label-wrap">${ha}<span class="row-label">vs ${getOpponent(f)}</span>${countdown}</div>
          <span class="row-comp">${f.competition?.name || ''}</span>
        </div>
        <span class="row-meta">${formatDate(f.utcDate)}</span>
      </div>
    `;
  }).join('');
  card.innerHTML = `<div class="section-label">Upcoming</div>${rows}`;
  card.querySelectorAll('.row-btn[data-url]').forEach(r =>
    r.addEventListener('click', () => chrome.tabs.create({ url: r.dataset.url }))
  );
  clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const cdEl = el('countdown');
    if (cdEl && nextFixtureDate) cdEl.textContent = formatCountdown(nextFixtureDate);
  }, 30000);
}

function renderFormGuide(results) {
  const formEl = el('formGuide');
  if (!formEl) return;
  if (!results.length) { formEl.innerHTML = ''; return; }
  const dots = results.map(r => {
    const { label, cls } = getResultMeta(r);
    return `<span class="form-dot ${cls}">${label}</span>`;
  }).join('');
  formEl.innerHTML = dots;
}

function renderResults(results, resetShow = true) {
  if (resetShow) showAllResults = false;
  const card = el('resultsCard');
  if (!results.length) {
    card.innerHTML = `<div class="section-label">Results</div><div class="quiet-msg">No recent results</div>`;
    renderFormGuide([]);
    return;
  }
  const displayed = showAllResults ? results : results.slice(0, 3);
  const rows = displayed.map((r, i) => {
    const { label, cls } = getResultMeta(r);
    const ha = isHome(r) ? '<span class="ha-badge ha-h">H</span>' : '<span class="ha-badge ha-a">A</span>';
    const q = encodeURIComponent(`FC Barcelona vs ${getOpponent(r)} result`);
    return `
      <div class="row row-btn${i === 0 ? ' no-border' : ''}" data-url="https://www.google.com/search?q=${q}">
        <div class="row-left">
          <div class="row-label-wrap">${ha}<span class="row-label">vs ${getOpponent(r)}</span></div>
          <span class="row-comp">${r.competition?.name || ''}</span>
        </div>
        <div class="result-right">
          <span class="result-score">${r.score.fullTime.home}–${r.score.fullTime.away}</span>
          <span class="result-badge ${cls}">${label}</span>
        </div>
      </div>
    `;
  }).join('');
  const moreBtn = results.length > 3
    ? `<button class="show-more-btn" id="showMoreBtn">${showAllResults ? 'Show less ▲' : `Show ${results.length - 3} more ▼`}</button>`
    : '';
  card.innerHTML = `<div class="section-label">Results</div>${rows}${moreBtn}`;
  renderFormGuide(displayed);
  card.querySelectorAll('.row-btn[data-url]').forEach(r =>
    r.addEventListener('click', () => chrome.tabs.create({ url: r.dataset.url }))
  );
  if (results.length > 3) {
    el('showMoreBtn').addEventListener('click', () => {
      showAllResults = !showAllResults;
      renderResults(results, false);
    });
  }
}

function renderLoading() {
  const loadingHTML = `<div class="loading-wrap"><div class="spinner"></div>Loading…</div>`;

  el('liveCard').className = 'card';
  el('liveCard').innerHTML = loadingHTML;

  el('fixturesCard').innerHTML = `<div class="section-label">Upcoming</div>${loadingHTML}`;
  el('resultsCard').innerHTML = `<div class="section-label">Results</div>${loadingHTML}`;
}

function renderError(isApiKey) {
  el('liveCard').className = 'card';
  el('liveCard').innerHTML = `
    <div class="error-msg">${isApiKey ? 'API key missing or invalid.' : 'Could not load data.'}</div>
    <button class="see-why" id="seeWhyBtn">See why ↗</button>
  `;
  el('fixturesCard').innerHTML = '<div class="section-label">Upcoming</div>';
  el('resultsCard').innerHTML = '<div class="section-label">Results</div>';

  el('seeWhyBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/ShiiiivanshSingh/fcb-score-tracker#️-api-key-setup' });
  });
}

// Feature 8: UCL standings toggle
function renderStandings(laLigaRow, uclRow) {
  cachedLaLigaRow = laLigaRow;
  cachedUclRow = uclRow;
  const card = el('standingsCard');
  if (!card) return;
  if (!laLigaRow && !uclRow) { card.innerHTML = ''; return; }

  const hasBoth = laLigaRow && uclRow;
  const tabs = hasBoth ? `
    <div class="standings-tabs">
      <button class="standings-tab${activeStandingsTab === 'laliga' ? ' active' : ''}" id="tabLaLiga">La Liga</button>
      <button class="standings-tab${activeStandingsTab === 'ucl' ? ' active' : ''}" id="tabUcl">UCL</button>
    </div>` : '';
  const label = !hasBoth ? (laLigaRow ? 'La Liga' : 'UCL') : '';
  const row = activeStandingsTab === 'ucl' && uclRow ? uclRow : (laLigaRow || uclRow);

  card.innerHTML = `
    ${tabs}
    ${!hasBoth ? `<div class="section-label">${label}</div>` : ''}
    <div class="row no-border standings-row">
      <div class="row-left">
        <div class="row-label-wrap">
          <span class="standing-pos">${row.position}</span>
          <span class="row-label">FC Barcelona</span>
        </div>
      </div>
      <div class="standings-right">
        <span class="standing-stat"><span class="stat-val">${row.playedGames}</span><span class="stat-lbl">P</span></span>
        <span class="standing-stat"><span class="stat-val">${row.won}</span><span class="stat-lbl">W</span></span>
        <span class="standing-stat"><span class="stat-val">${row.draw}</span><span class="stat-lbl">D</span></span>
        <span class="standing-stat"><span class="stat-val">${row.lost}</span><span class="stat-lbl">L</span></span>
        <span class="standing-pts">${row.points}<span class="stat-lbl">pts</span></span>
      </div>
    </div>
  `;
  if (hasBoth) {
    el('tabLaLiga').addEventListener('click', () => { activeStandingsTab = 'laliga'; renderStandings(cachedLaLigaRow, cachedUclRow); });
    el('tabUcl').addEventListener('click', () => { activeStandingsTab = 'ucl'; renderStandings(cachedLaLigaRow, cachedUclRow); });
  }
}

// Feature 13: card events added (bookings)
function renderMatchEvents(goals, bookings) {
  const wrap = el('matchEvents');
  if (!wrap) return;
  const goalItems = (goals || [])
    .filter(e => e.type === 'GOAL' || e.type === 'OWN_GOAL' || e.type === 'PENALTY')
    .map(e => {
      const scorer = e.scorer?.name?.split(' ').pop() || e.player?.name?.split(' ').pop() || '?';
      const isBarca = e.team?.id === TEAM_ID;
      const suffix = e.type === 'OWN_GOAL' ? ' (og)' : e.type === 'PENALTY' ? ' (p)' : '';
      return { min: e.minute ?? 0, html: `<span class="event-item${!isBarca ? ' event-against' : ''}">⚽ ${scorer}${suffix} ${e.minute}'</span>` };
    });
  const cardItems = (bookings || [])
    .map(b => {
      const name = b.player?.name?.split(' ').pop() || '?';
      const isBarca = b.team?.id === TEAM_ID;
      const isRed = b.card === 'RED_CARD' || b.card === 'RED';
      const icon = isRed ? '🟥' : '⚠️';
      const cls = isRed ? 'event-red' : 'event-yellow';
      return { min: b.minute ?? 0, html: `<span class="event-item ${cls}${!isBarca ? ' event-against' : ''}">${icon} ${name} ${b.minute}'</span>` };
    });
  const allItems = [...goalItems, ...cardItems].sort((a, b) => a.min - b.min);
  if (!allItems.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = allItems.map(i => i.html).join('<span class="event-sep">·</span>');
}

// Feature 2: Competition filter
function renderCompFilter(fixtures, results) {
  const wrap = el('compFilter');
  if (!wrap) return;
  const comps = new Set(['All']);
  [...fixtures, ...results].forEach(m => comps.add(getCompetitionKey(m.competition?.name)));
  if (comps.size <= 2) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = [...comps].map(c =>
    `<button class="comp-pill${c === activeFilter ? ' active' : ''}" data-comp="${c}">${c}</button>`
  ).join('');
  wrap.querySelectorAll('.comp-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.comp;
      wrap.querySelectorAll('.comp-pill').forEach(b => b.classList.toggle('active', b.dataset.comp === activeFilter));
      const filt = m => activeFilter === 'All' || getCompetitionKey(m.competition?.name) === activeFilter;
      renderFixtures(allFixtures.filter(filt));
      renderResults(allResults.filter(filt));
    });
  });
}

// Feature 6: Top Scorers
function renderTopScorers(scorers) {
  const card = el('scorersCard');
  if (!card) return;
  if (!scorers || !scorers.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  const rows = scorers.slice(0, 5).map((s, i) => {
    const name = s.player?.name?.split(' ').slice(-1)[0] || s.player?.name || '?';
    return `<div class="scorers-row${i === 0 ? ' no-border' : ''}">
      <span class="scorer-rank">${i + 1}</span>
      <span class="scorer-name">${name}</span>
      <span class="scorer-goals">${s.goals}<span class="scorer-lbl"> G</span></span>
    </div>`;
  }).join('');
  card.innerHTML = `<div class="section-label">Top Scorers · La Liga</div>${rows}`;
}

// Feature 7: Settings panel
async function renderSettingsPanel() {
  const s = await getSettings();
  const tog = (id, val) => { const el2 = el(id); if (el2) el2.checked = val; };
  tog('togGoals', s.notifyGoals);
  tog('togMatchStart', s.notifyMatchStart);
  tog('togHalfTime', s.notifyHalfTime);
  tog('togFullTime', s.notifyFullTime);
  const bind = (id, key) => {
    const input = el(id);
    if (input) input.addEventListener('change', () => saveSettings({ [key]: input.checked }));
  };
  bind('togGoals', 'notifyGoals');
  bind('togMatchStart', 'notifyMatchStart');
  bind('togHalfTime', 'notifyHalfTime');
  bind('togFullTime', 'notifyFullTime');
}

async function fetchAndRender(force = false) {
  if (isFetching) return;

  // ── Cache check: skip all API calls if data is fresh enough ──────────
  if (!force) {
    const cached = await loadCache();
    if (cached) {
      renderFromPayload(cached);
      return;
    }
  }

  isFetching = true;
  setReloadSpinning(true);
  renderLoading();

  try {
    const headers = { 'X-Auth-Token': API_KEY };

    const [liveRes, fixturesRes, resultsRes, standingsRes, uclRes, scorersRes] = await Promise.all([
      fetchWithTimeout(`${BASE_URL}/teams/${TEAM_ID}/matches?status=IN_PLAY,PAUSED,HALF_TIME`, { headers }),
      fetchWithTimeout(`${BASE_URL}/teams/${TEAM_ID}/matches?status=SCHEDULED&limit=20`, { headers }),
      fetchWithTimeout(`${BASE_URL}/teams/${TEAM_ID}/matches?status=FINISHED&limit=20`, { headers }),
      fetchWithTimeout(`${BASE_URL}/competitions/PD/standings`, { headers }),
      fetchWithTimeout(`${BASE_URL}/competitions/CL/standings`, { headers }),
      fetchWithTimeout(`${BASE_URL}/competitions/PD/scorers?limit=10`, { headers }),
    ]);

    if ([liveRes, fixturesRes, resultsRes].some(r => r.status === 403)) {
      renderError(true);
      return;
    }

    const [liveData, fixturesData, resultsData, standingsData, uclData, scorersData] = await Promise.all([
      liveRes.json(), fixturesRes.json(), resultsRes.json(),
      standingsRes.ok ? standingsRes.json() : Promise.resolve(null),
      uclRes.ok ? uclRes.json() : Promise.resolve(null),
      scorersRes.ok ? scorersRes.json() : Promise.resolve(null),
    ]);

    const live = liveData.matches?.length ? liveData.matches[0] : null;

    let liveMinute = null;
    let liveGoals = [];
    let liveBookings = [];
    let liveDetail = null;
    if (live) {
      try {
        const detailRes = await fetchWithTimeout(`${BASE_URL}/matches/${live.id}`, { headers });
        if (detailRes.ok) {
          liveDetail = await detailRes.json();
          liveMinute = liveDetail.minute ?? null;
          liveGoals = liveDetail.goals || [];
          liveBookings = liveDetail.bookings || [];
          if (liveDetail.score) live.score = liveDetail.score;
        }
      } catch (_) { }
    }

    const payload = { liveData, fixturesData, resultsData, standingsData, uclData, scorersData, liveMinute, liveGoals, liveBookings, liveDetail, live };

    // Don't cache live-match data — always want fresh scores during a match
    if (!live) await saveCache(payload);

    renderFromPayload(payload);

    resetRefreshInterval(live ? REFRESH_INTERVAL_LIVE : REFRESH_INTERVAL);

  } catch (e) {
    renderError(false);
  } finally {
    isFetching = false;
    setReloadSpinning(false);
  }
}

function renderFromPayload(payload) {
  const { liveData, fixturesData, resultsData, standingsData, uclData, scorersData,
          liveMinute, liveGoals, liveBookings, liveDetail } = payload;

  // Re-derive live from liveData in case payload came from cache
  const live = liveData?.matches?.length ? liveData.matches[0] : null;

  allFixtures = (fixturesData?.matches || [])
    .filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED')
    .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  allResults = (resultsData?.matches || [])
    .filter(m => m.status === 'FINISHED')
    .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));

  const fixtures = allFixtures.slice(0, 3);
  const results = allResults.slice(0, 3);

  const laLigaRow = standingsData?.standings?.[0]?.table?.find(r => r.team.id === TEAM_ID) || null;
  const uclRow = uclData?.standings?.[0]?.table?.find(r => r.team.id === TEAM_ID) || null;
  const barcaScorers = (scorersData?.scorers || []).filter(s => s.team?.id === TEAM_ID);

  // Goal toast — only fires for new goals vs last known (skipped if rendering from cache)
  if (live && liveGoals.length > lastKnownGoalCount) {
    const newGoals = liveGoals.slice(lastKnownGoalCount);
    for (const g of newGoals) {
      const isBarcaGoal = g.team?.id === TEAM_ID && g.type !== 'OWN_GOAL';
      const scorer = g.scorer?.name?.split(' ').pop() || '?';
      const isBarcaHome = live.homeTeam.id === TEAM_ID;
      const barcaG = liveGoals.filter(x => (x.team?.id === TEAM_ID) !== (x.type === 'OWN_GOAL')).length;
      const oppG   = liveGoals.filter(x => (x.team?.id !== TEAM_ID) !== (x.type === 'OWN_GOAL')).length;
      showGoalToast(scorer, isBarcaGoal, isBarcaHome ? barcaG : oppG, isBarcaHome ? oppG : barcaG);
    }
  }
  lastKnownGoalCount = live ? liveGoals.length : 0;

  renderLive(live, liveMinute, liveDetail);
  renderFixtures(fixtures);
  renderResults(results);
  renderStandings(laLigaRow, uclRow);
  renderCompFilter(allFixtures, allResults);
  renderTopScorers(barcaScorers);
  updateTimestamp();

  if (live) {
    renderMatchEvents(liveGoals, liveBookings);
  } else {
    const wrap = el('matchEvents');
    if (wrap) wrap.style.display = 'none';
    lastKnownGoalCount = 0;
  }
}

function resetRefreshInterval(ms) {
  if (mainRefreshInterval) clearInterval(mainRefreshInterval);
  mainRefreshInterval = setInterval(fetchAndRender, ms);
}

document.addEventListener('DOMContentLoaded', () => {
  // Reload button: force=true bypasses cache
  el('reloadBtn').addEventListener('click', () => fetchAndRender(true));

  el('repoLink').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/ShiiiivanshSingh/fcb-score-tracker' });
  });

  // Feature 7: Settings panel toggle
  let settingsOpen = false;
  el('settingsBtn').addEventListener('click', () => {
    settingsOpen = !settingsOpen;
    const panel = el('settingsPanel');
    panel.style.display = settingsOpen ? '' : 'none';
    el('settingsBtn').classList.toggle('active', settingsOpen);
    if (settingsOpen) renderSettingsPanel();
  });

  fetchAndRender();
  mainRefreshInterval = setInterval(fetchAndRender, REFRESH_INTERVAL);
});

