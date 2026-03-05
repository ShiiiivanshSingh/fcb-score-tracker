import { API_KEY } from './config.js';

const TEAM_ID = 81;
const BASE_URL = 'https://api.football-data.org/v4';
const REFRESH_INTERVAL = 60 * 1000;
const FETCH_TIMEOUT = 10000;

let isFetching = false;
let pulseInterval = null;
let countdownInterval = null;
let nextFixtureDate = null;

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

function formatMatchTime(match) {
  const minute = match.minute ?? match.score?.duration ?? null;
  if (match.status === 'IN_PLAY' || match.status === 'PAUSED') {
    return minute ? `${minute}'` : 'LIVE';
  }
  if (match.status === 'HALF_TIME') return 'HT';
  if (match.status === 'FINISHED')  return 'FT';
  return '';
}

function getLiveScore(match) {
  const home = match.score?.fullTime?.home ?? match.score?.halfTime?.home ?? '-';
  const away = match.score?.fullTime?.away ?? match.score?.halfTime?.away ?? '-';
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

function el(id) { return document.getElementById(id); }

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

function renderLive(live) {
  const card = el('liveCard');

  if (!live) {
    card.className = 'card';
    card.innerHTML = '<div class="quiet-msg">No live match right now</div>';
    el('liveIndicator').classList.remove('visible');
    stopPulse();
    return;
  }

  const { home, away } = getLiveScore(live);
  const isBarcaHome = live.homeTeam.id === TEAM_ID;
  const barca       = isBarcaHome ? live.homeTeam.shortName : live.awayTeam.shortName;
  const opp         = isBarcaHome ? live.awayTeam.shortName : live.homeTeam.shortName;
  const barcaScore  = isBarcaHome ? home : away;
  const oppScore    = isBarcaHome ? away : home;
  const comp        = live.competition?.name || 'Match';
  const timeLabel   = formatMatchTime(live);

  card.className = 'card-live';
  card.innerHTML = `
    <div class="live-inner">
      <div class="live-comp-label">${comp} · ${timeLabel}</div>
      <div class="live-scoreline">
        <span class="live-team-name">${barca}</span>
        <span class="live-score-num">${barcaScore}–${oppScore}</span>
        <span class="live-team-name away">${opp}</span>
      </div>
    </div>
  `;

  el('liveIndicator').classList.add('visible');
  el('liveMinute').textContent = timeLabel;
  startPulse();
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
    return `
      <div class="row${i === 0 ? ' no-border' : ''}">
        <div class="row-left">
          <div class="row-label-wrap">${ha}<span class="row-label">vs ${getOpponent(f)}</span>${countdown}</div>
          <span class="row-comp">${f.competition?.name || ''}</span>
        </div>
        <span class="row-meta">${formatDate(f.utcDate)}</span>
      </div>
    `;
  }).join('');
  card.innerHTML = `<div class="section-label">Upcoming</div>${rows}`;

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

function renderResults(results) {
  const card = el('resultsCard');
  if (!results.length) {
    card.innerHTML = `<div class="section-label">Results</div><div class="quiet-msg">No recent results</div>`;
    renderFormGuide([]);
    return;
  }
  const rows = results.map((r, i) => {
    const { label, cls } = getResultMeta(r);
    const ha = isHome(r) ? '<span class="ha-badge ha-h">H</span>' : '<span class="ha-badge ha-a">A</span>';
    return `
      <div class="row${i === 0 ? ' no-border' : ''}">
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
  card.innerHTML = `<div class="section-label">Results</div>${rows}`;
  renderFormGuide(results);
}

function renderLoading() {
  const loadingHTML = `<div class="loading-wrap"><div class="spinner"></div>Loading…</div>`;

  el('liveCard').className = 'card';
  el('liveCard').innerHTML = loadingHTML;

  el('fixturesCard').innerHTML = `<div class="section-label">Upcoming</div>${loadingHTML}`;
  el('resultsCard').innerHTML  = `<div class="section-label">Results</div>${loadingHTML}`;
}

function renderError(isApiKey) {
  el('liveCard').className = 'card';
  el('liveCard').innerHTML = `
    <div class="error-msg">${isApiKey ? 'API key missing or invalid.' : 'Could not load data.'}</div>
    <button class="see-why" id="seeWhyBtn">See why ↗</button>
  `;
  el('fixturesCard').innerHTML = '<div class="section-label">Upcoming</div>';
  el('resultsCard').innerHTML  = '<div class="section-label">Results</div>';

  el('seeWhyBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/ShiiiivanshSingh/fcb-score-tracker#️-api-key-setup' });
  });
}

function renderStandings(standing) {
  const card = el('standingsCard');
  if (!card) return;
  if (!standing) { card.innerHTML = ''; return; }
  card.innerHTML = `
    <div class="section-label">La Liga</div>
    <div class="row no-border standings-row">
      <div class="row-left">
        <div class="row-label-wrap">
          <span class="standing-pos">${standing.position}</span>
          <span class="row-label">FC Barcelona</span>
        </div>
      </div>
      <div class="standings-right">
        <span class="standing-stat"><span class="stat-val">${standing.playedGames}</span><span class="stat-lbl">P</span></span>
        <span class="standing-stat"><span class="stat-val">${standing.won}</span><span class="stat-lbl">W</span></span>
        <span class="standing-stat"><span class="stat-val">${standing.draw}</span><span class="stat-lbl">D</span></span>
        <span class="standing-stat"><span class="stat-val">${standing.lost}</span><span class="stat-lbl">L</span></span>
        <span class="standing-pts">${standing.points}<span class="stat-lbl">pts</span></span>
      </div>
    </div>
  `;
}

function renderMatchEvents(events) {
  const wrap = el('matchEvents');
  if (!wrap) return;
  if (!events || !events.length) { wrap.style.display = 'none'; return; }
  const goals = events
    .filter(e => e.type === 'GOAL')
    .map(e => {
      const scorer = e.player?.name?.split(' ').pop() || '?';
      const team = e.team?.id === TEAM_ID ? '' : '<span class="event-opp">·</span>';
      return `<span class="event-item${e.team?.id !== TEAM_ID ? ' event-against' : ''}">${scorer} ${e.minute}'${team}</span>`;
    }).join('<span class="event-sep">·</span>');
  wrap.style.display = goals ? 'block' : 'none';
  wrap.innerHTML = goals;
}

async function fetchAndRender() {
  if (isFetching) return;
  isFetching = true;
  setReloadSpinning(true);
  renderLoading();

  try {
    const headers = { 'X-Auth-Token': API_KEY };

    const [liveRes, fixturesRes, resultsRes, standingsRes] = await Promise.all([
      fetchWithTimeout(`${BASE_URL}/teams/${TEAM_ID}/matches?status=IN_PLAY`, { headers }),
      fetchWithTimeout(`${BASE_URL}/teams/${TEAM_ID}/matches?status=SCHEDULED&limit=20`, { headers }),
      fetchWithTimeout(`${BASE_URL}/teams/${TEAM_ID}/matches?status=FINISHED&limit=20`, { headers }),
      fetchWithTimeout(`${BASE_URL}/competitions/PD/standings`, { headers }),
    ]);

    if ([liveRes, fixturesRes, resultsRes].some(r => r.status === 403)) {
      renderError(true);
      return;
    }

    const [liveData, fixturesData, resultsData, standingsData] = await Promise.all([
      liveRes.json(), fixturesRes.json(), resultsRes.json(),
      standingsRes.ok ? standingsRes.json() : Promise.resolve(null),
    ]);

    const live     = liveData.matches?.length ? liveData.matches[0] : null;
    const fixtures = (fixturesData.matches || [])
      .filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED')
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
      .slice(0, 3);
    const results  = (resultsData.matches || [])
      .filter(m => m.status === 'FINISHED')
      .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
      .slice(0, 3);

    const standing = standingsData?.standings?.[0]?.table
      ?.find(row => row.team.id === TEAM_ID) || null;

    renderLive(live);
    renderFixtures(fixtures);
    renderResults(results);
    renderStandings(standing);
    renderFormGuide(results);
    updateTimestamp();

    if (live) {
      try {
        const eventsRes = await fetchWithTimeout(`${BASE_URL}/matches/${live.id}`, { headers });
        if (eventsRes.ok) {
          const eventsData = await eventsRes.json();
          renderMatchEvents(eventsData.goals || []);
        }
      } catch (_) {}
    } else {
      const wrap = el('matchEvents');
      if (wrap) wrap.style.display = 'none';
    }

  } catch (e) {
    renderError(false);
  } finally {
    isFetching = false;
    setReloadSpinning(false);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  el('reloadBtn').addEventListener('click', fetchAndRender);

  el('repoLink').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/ShiiiivanshSingh/fcb-score-tracker' });
  });

  fetchAndRender();
  setInterval(fetchAndRender, REFRESH_INTERVAL);
});
