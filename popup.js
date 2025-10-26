import { API_KEY } from './config.js';
const TEAM_ID = 81;
const BASE_URL = 'https://api.football-data.org/v4';
const REFRESH_INTERVAL = 90 * 1000;
const CACHE_KEY = 'fcb_score_cache';
const CACHE_TIMESTAMP_KEY = 'fcb_cache_timestamp';

let refreshTimer = null;

function setLoading() {
  document.getElementById('root').innerHTML = `
    <div class="header-container">
      <div class="header">FC Barcelona</div>
    </div>
    <div class="section">Loading...</div>
  `;
}

function setError() {
  document.getElementById('root').innerHTML = `
    <div class="header-container">
      <div class="header">FC Barcelona</div>
    </div>
    <div class="section">
      Error loading data. Please try again later.<br>
      <button id="see-why-btn" style="margin-top:12px;padding:8px 18px;background:#d32f2f;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer;">See why</button>
    </div>
  `;
  const btn = document.getElementById('see-why-btn');
  if (btn) {
    btn.onclick = () => {
      window.open('https://github.com/ShiiiivanshSingh/fcb-score-tracker#️-api-key-setup', '_blank');
    };
  }
}

function encodeMatchData(match) {
  try {
    return btoa(JSON.stringify(match));
  } catch (e) {
    return '';
  }
}

function decodeMatchData(encoded) {
  try {
    return JSON.parse(atob(encoded));
  } catch (e) {
    return null;
  }
}

function formatMatchTime(match) {
  if (match.status === 'IN_PLAY' || match.status === 'PAUSED') {
    if (match.minute) return `${match.minute}'`;
    return 'LIVE';
  }
  if (match.status === 'HALF_TIME') return 'HT';
  if (match.status === 'FINISHED') return 'FT';
  return '';
}

function getMatchDetails(match) {
  const date = new Date(match.utcDate);
  const homeTeam = match.homeTeam;
  const awayTeam = match.awayTeam;
  const stadium = match.venue || match.score?.venue || 'Unknown';
  const competition = match.competition?.name || '';
  return {
    date: date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric' }),
    time: date.toLocaleString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }),
    stadium: stadium,
    competition: competition,
    homeTeam: homeTeam.shortName,
    awayTeam: awayTeam.shortName,
    homeCrest: homeTeam.crest || '',
    awayCrest: awayTeam.crest || ''
  };
}

function renderMatchTooltip(match) {
  const details = getMatchDetails(match);
  return `
    <div class="match-tooltip">
      <div class="tooltip-header"><span class="tooltip-competition">${details.competition}</span></div>
      <div class="tooltip-teams">
        <div class="tooltip-team">${details.homeCrest ? `<img src="${details.homeCrest}" class="tooltip-crest">` : ''}<span>${details.homeTeam}</span></div>
        <span class="tooltip-vs">VS</span>
        <div class="tooltip-team">${details.awayCrest ? `<img src="${details.awayCrest}" class="tooltip-crest">` : ''}<span>${details.awayTeam}</span></div>
      </div>
      <div class="tooltip-details">
        <div class="tooltip-item">📅 ${details.date}</div>
        <div class="tooltip-item">🕐 ${details.time}</div>
      </div>
    </div>
  `;
}

function renderLiveDetails(match) {
  let html = '';
  const goals = match.goals || [];
  if (Array.isArray(goals) && goals.length > 0) {
    html += '<div class="live-events"><div class="live-events-title">⚽ Goals</div>';
    goals.forEach(goal => {
      const scorer = goal.scorer?.name || 'Unknown';
      const minute = goal.minute || '';
      const isHome = goal.team?.id === match.homeTeam?.id;
      const homeName = match.homeTeam?.shortName || 'Home';
      const awayName = match.awayTeam?.shortName || 'Away';
      html += `<div class="live-event-item ${isHome ? 'home-event' : 'away-event'}"><span class="event-minute">${minute}'</span><span class="event-team">${isHome ? homeName : awayName}</span><span class="event-player">${scorer}</span></div>`;
    });
    html += '</div>';
  }
  return html;
}

function render({ live, fixtures, results, message }) {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="header-container">
      <div class="header">FC Barcelona</div>
      <button id="reload-btn" class="reload-button">⚽</button>
    </div>
    <div class="section">
      ${message ? `<div class="notice">${message}</div>` : ''}
      ${live ? `
        <div class="live">
          <div class="live-teams-horizontal">
            <div class="live-team-home">
              ${live.homeTeam?.crest ? `<img src="${live.homeTeam.crest}" class="team-logo-medium" />` : ''}
              <span class="team-name">${live.homeTeam?.shortName || 'Home'}</span>
              <span class="score">${live.score?.fullTime?.home ?? '-'}</span>
            </div>
            <div class="live-vs"><span class="match-time">${formatMatchTime(live)}</span></div>
            <div class="live-team-away">
              <span class="score">${live.score?.fullTime?.away ?? '-'}</span>
              <span class="team-name">${live.awayTeam?.shortName || 'Away'}</span>
              ${live.awayTeam?.crest ? `<img src="${live.awayTeam.crest}" class="team-logo-medium" />` : ''}
            </div>
          </div>
          ${renderLiveDetails(live)}
        </div>` : `<div class="status">No live match</div>`}
    </div>
    <div class="section">
      <div class="status">Upcoming Fixtures</div>
      ${fixtures.length ? fixtures.map(f => {
        const opp = f.awayTeam.id === TEAM_ID ? f.homeTeam : f.awayTeam;
        return `<div class="fixture match-hover" data-match="${encodeMatchData(f)}">
          <span class="team">${opp.crest ? `<img src="${opp.crest}" class="team-logo-small" />` : ''}vs ${opp.shortName}</span>
          <span>${(new Date(f.utcDate)).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </div>`;
      }).join('') : '<div class="status">No upcoming fixtures</div>'}
    </div>
    <div class="section">
      <div class="status">Recent Results</div>
      ${results.length ? results.map(r => {
        const opp = r.awayTeam.id === TEAM_ID ? r.homeTeam : r.awayTeam;
        return `<div class="result match-hover" data-match="${encodeMatchData(r)}">
          <span class="team">${opp.crest ? `<img src="${opp.crest}" class="team-logo-small" />` : ''}vs ${opp.shortName}</span>
          <span class="score">${r.score.fullTime.home}-${r.score.fullTime.away}</span>
        </div>`;
      }).join('') : '<div class="status">No recent results</div>'}
    </div>
    <a href="https://github.com/ShiiiivanshSingh/fcb-score-tracker" target="_blank" rel="noopener noreferrer">
      <img src="fcb.svg" alt="FC Barcelona" class="logo" height="50" width="50" style="display:block;margin:0 auto;">
    </a>
  `;
  setupReloadButton();
  setupMatchHovers();
}

async function fetchAndCacheData() {
  try {
    const liveRes = await fetch(`${BASE_URL}/matches?status=LIVE&team=${TEAM_ID}`, { headers: { 'X-Auth-Token': API_KEY } });
    const liveData = await liveRes.json();
    const liveMatches = liveData.matches || [];
    let live = liveMatches.find(m => m.homeTeam.id === TEAM_ID || m.awayTeam.id === TEAM_ID) || null;
    let message = '';
    if (!live) {
      message = "Sorry, Barça isn't playing right now ⚽ Here’s another live game to check out!<br><br>";
      // message = "No Barça match right now 
      const allLiveRes = await fetch(`${BASE_URL}/matches?status=LIVE`, { headers: { 'X-Auth-Token': API_KEY } });
      const allLiveData = await allLiveRes.json();
      const allMatches = allLiveData.matches || [];
      if (allMatches.length > 0) {
        const randomIndex = Math.floor(Math.random() * allMatches.length);
        live = allMatches[randomIndex];
      }
    }
    const fixturesRes = await fetch(`${BASE_URL}/teams/${TEAM_ID}/matches?status=SCHEDULED&limit=3`, { headers: { 'X-Auth-Token': API_KEY } });
    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData.matches || [];
    const resultsRes = await fetch(`${BASE_URL}/teams/${TEAM_ID}/matches?status=FINISHED&limit=10`, { headers: { 'X-Auth-Token': API_KEY } });
    const resultsData = await resultsRes.json();
    let results = resultsData.matches || [];
    results = results.filter(m => m.status === 'FINISHED').sort((a,b)=>new Date(b.utcDate)-new Date(a.utcDate)).slice(0,3);
    const data = { live, fixtures, results, message };
    await chrome.storage.local.set({ [CACHE_KEY]: data, [CACHE_TIMESTAMP_KEY]: Date.now() });
    return data;
  } catch (e) {
    throw e;
  }
}

function setupReloadButton() {
  const reloadBtn = document.getElementById('reload-btn');
  if (reloadBtn) reloadBtn.onclick = async () => {
    reloadBtn.textContent = '⏳';
    reloadBtn.disabled = true;
    const data = await fetchAndCacheData();
    render(data);
    reloadBtn.textContent = '🔄';
    reloadBtn.disabled = false;
  };
}

function setupMatchHovers() {
  const matchElements = document.querySelectorAll('.match-hover');
  let hoverTimeout;
  matchElements.forEach(el => {
    el.addEventListener('mouseenter', function() {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        const matchData = decodeMatchData(this.getAttribute('data-match'));
        if (!matchData) return;
        const tooltip = renderMatchTooltip(matchData);
        const tooltipEl = document.createElement('div');
        tooltipEl.className = 'tooltip-container';
        tooltipEl.innerHTML = tooltip;
        document.body.appendChild(tooltipEl);
        const rect = this.getBoundingClientRect();
        tooltipEl.style.left = rect.left + 'px';
        tooltipEl.style.top = rect.bottom + 'px';
        tooltipEl.style.opacity = '1';
      }, 200);
    });
    el.addEventListener('mouseleave', function() {
      clearTimeout(hoverTimeout);
      const tooltip = document.querySelector('.tooltip-container');
      if (tooltip) tooltip.remove();
    });
  });
}

async function init() {
  const cached = await chrome.storage.local.get([CACHE_KEY, CACHE_TIMESTAMP_KEY]);
  if (cached[CACHE_KEY]) {
    render(cached[CACHE_KEY]);
    const age = Date.now() - cached[CACHE_TIMESTAMP_KEY];
    if (age > REFRESH_INTERVAL) fetchAndCacheData().then(data => render(data));
  } else {
    setLoading();
    try {
      const data = await fetchAndCacheData();
      render(data);
    } catch (e) {
      setError();
    }
  }
}

init();
