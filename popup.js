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
    if (match.minute) {
      return `${match.minute}'`;
    }
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
    date: date.toLocaleString([], { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    }),
    time: date.toLocaleString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZoneName: 'short'
    }),
    stadium: stadium,
    competition: competition,
    homeTeam: homeTeam.shortName,
    awayTeam: awayTeam.shortName,
    homeCrest: homeTeam.crest || '',
    awayCrest: awayTeam.crest || ''
  };
}

function renderMatchTooltip(match, type) {
  const details = getMatchDetails(match);
  return `
    <div class="match-tooltip">
      <div class="tooltip-header">
        <span class="tooltip-competition">${details.competition}</span>
      </div>
      <div class="tooltip-teams">
        <div class="tooltip-team">
          ${details.homeCrest ? `<img src="${details.homeCrest}" class="tooltip-crest">` : ''}
          <span>${details.homeTeam}</span>
        </div>
        <span class="tooltip-vs">VS</span>
        <div class="tooltip-team">
          ${details.awayCrest ? `<img src="${details.awayCrest}" class="tooltip-crest">` : ''}
          <span>${details.awayTeam}</span>
        </div>
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
  
  // Render goals - try multiple possible field names
  const goals = match.goals || match.bookings || match.events || [];
  if (Array.isArray(goals) && goals.length > 0) {
    html += '<div class="live-events"><div class="live-events-title">⚽ Goals</div>';
    goals.forEach(goal => {
      const scorer = goal.scorer?.name || goal.player?.name || goal.homeScorer?.name || goal.awayScorer?.name || 'Unknown';
      const minute = goal.minute !== null && goal.minute !== undefined ? goal.minute : (goal.minuteNumber || '');
      const isHome = goal.team?.id === match.homeTeam?.id || goal.homeScorer;
      const homeName = match.homeTeam?.shortName || match.homeTeam?.name || 'Home';
      const awayName = match.awayTeam?.shortName || match.awayTeam?.name || 'Away';
      html += `<div class="live-event-item ${isHome ? 'home-event' : 'away-event'}">
        <span class="event-minute">${minute}'</span>
        <span class="event-team">${isHome ? homeName : awayName}</span>
        <span class="event-player">${scorer}</span>
      </div>`;
    });
    html += '</div>';
  }
  
  // Render substitutions - try multiple possible field names
  const substitutions = match.substitutions || match.subs || [];
  if (Array.isArray(substitutions) && substitutions.length > 0) {
    html += '<div class="live-events"><div class="live-events-title">🔄 Substitutions</div>';
    substitutions.forEach(sub => {
      const minute = sub.minute !== null && sub.minute !== undefined ? sub.minute : (sub.minuteNumber || '');
      const isHome = sub.team?.id === match.homeTeam?.id;
      const playerIn = sub.playerIn?.name || sub.in?.name || sub.playerInPlayer?.name || 'Unknown';
      const playerOut = sub.playerOut?.name || sub.out?.name || sub.playerOutPlayer?.name || 'Unknown';
      const homeName = match.homeTeam?.shortName || match.homeTeam?.name || 'Home';
      const awayName = match.awayTeam?.shortName || match.awayTeam?.name || 'Away';
      html += `<div class="live-event-item ${isHome ? 'home-event' : 'away-event'}">
        <span class="event-minute">${minute}'</span>
        <span class="event-team">${isHome ? homeName : awayName}</span>
        <span class="event-substitution">${playerIn} ⬆️ ${playerOut} ⬇️</span>
      </div>`;
    });
    html += '</div>';
  }
  
  return html;
}

function render({ live, fixtures, results }) {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="header-container">
      <div class="header">FC Barcelona</div>
      <button id="reload-btn" class="reload-button">🔄</button>
    </div>
    
    <div class="section">
      ${live ?
        `<div class="live">
          <div class="live-teams-horizontal">
            <div class="live-team-home">
              ${live.homeTeam?.crest ? `<img src="${live.homeTeam.crest}" class="team-logo-medium" />` : ''}
              <span class="team-name">${live.homeTeam?.shortName || live.homeTeam?.name || 'Home'}</span>
              <span class="score">${live.score?.fullTime?.home ?? live.score?.halfTime?.home ?? '-'}</span>
            </div>
            <div class="live-vs">
              <span class="match-time">${formatMatchTime(live)}</span>
            </div>
            <div class="live-team-away">
              <span class="score">${live.score?.fullTime?.away ?? live.score?.halfTime?.away ?? '-'}</span>
              <span class="team-name">${live.awayTeam?.shortName || live.awayTeam?.name || 'Away'}</span>
              ${live.awayTeam?.crest ? `<img src="${live.awayTeam.crest}" class="team-logo-medium" />` : ''}
            </div>
          </div>
          ${(live.minute !== null && live.minute !== undefined) ? `<div class="live-timer">${live.minute}'</div>` : ''}
          ${renderLiveDetails(live)}
          ${live.venue ? `<div class="live-venue">📍 ${live.venue}</div>` : ''}
        </div>`
        : `<div class="status">No live match</div>`}
    </div>
    <div class="section">
      <div class="status">Upcoming Fixtures</div>
      ${fixtures.length ? fixtures.map((f, idx) => {
        const opponentTeam = f.awayTeam.id === TEAM_ID ? f.homeTeam : f.awayTeam;
        return `<div class="fixture match-hover" data-match="${encodeMatchData(f)}">
          <span class="team">
            ${opponentTeam.crest ? `<img src="${opponentTeam.crest}" class="team-logo-small" />` : ''}
            vs ${opponentTeam.shortName}
          </span>
          <span>${(new Date(f.utcDate)).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </div>`;
      }).join('') : '<div class="status">No upcoming fixtures</div>'}
    </div>
    <div class="section">
      <div class="status">Recent Results</div>
      ${results.length ? results.map(r => {
        const opponentTeam = r.awayTeam.id === TEAM_ID ? r.homeTeam : r.awayTeam;
        return `<div class="result match-hover" data-match="${encodeMatchData(r)}">
          <span class="team">
            ${opponentTeam.crest ? `<img src="${opponentTeam.crest}" class="team-logo-small" />` : ''}
            vs ${opponentTeam.shortName}
          </span>
          <span class="score">${r.score.fullTime.home}-${r.score.fullTime.away} ${r.score.winner === 'DRAW' ? 'D' : (r.score.winner === 'HOME_TEAM' && r.homeTeam.id === TEAM_ID) || (r.score.winner === 'AWAY_TEAM' && r.awayTeam.id === TEAM_ID) ? 'W' : 'L'}</span>
        </div>`;
      }).join('') : '<div class="status">No recent results</div>'}
    </div>
          <a href="https://github.com/ShiiiivanshSingh/fcb-score-tracker" target="_blank" rel="noopener noreferrer">
            <img src="fcb.svg" alt="FC Barcelona" class="logo" height="50" width="50" style="display: block; margin: 0 auto;">
          </a>

  `;
  
  const reloadBtn = document.getElementById('reload-btn');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', async () => {
      reloadBtn.textContent = '⏳';
      reloadBtn.disabled = true;
      await fetchAndCacheData();
      const cachedData = await chrome.storage.local.get([CACHE_KEY]);
      if (cachedData[CACHE_KEY]) {
        render(cachedData[CACHE_KEY]);
        setupReloadButton();
      }
    });
  }
  
  setupMatchHovers();
}

function setupMatchHovers() {
  const matchElements = document.querySelectorAll('.match-hover');
  let hoverTimeout;
  
  matchElements.forEach(element => {
    element.addEventListener('mouseenter', function(e) {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        const matchData = decodeMatchData(this.getAttribute('data-match'));
        if (!matchData) return;
        const tooltip = renderMatchTooltip(matchData);
        
        const tooltipEl = document.createElement('div');
        tooltipEl.className = 'tooltip-container';
        tooltipEl.innerHTML = tooltip;
        document.body.appendChild(tooltipEl);
        
        requestAnimationFrame(() => {
          const rect = this.getBoundingClientRect();
          const tooltipRect = tooltipEl.getBoundingClientRect();
          const windowWidth = window.innerWidth;
          const windowHeight = window.innerHeight;
          
          let leftPos = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
          let topPos = rect.bottom + 10;
          
          if (leftPos < 10) leftPos = 10;
          if (leftPos + tooltipRect.width > windowWidth - 10) {
            leftPos = windowWidth - tooltipRect.width - 10;
          }
          
          if (topPos + tooltipRect.height > windowHeight - 10) {
            topPos = rect.top - tooltipRect.height - 10;
          }
          
          tooltipEl.style.left = leftPos + 'px';
          tooltipEl.style.top = topPos + 'px';
          tooltipEl.style.opacity = '1';
        });
      }, 200);
    });
    
    element.addEventListener('mouseleave', function() {
      clearTimeout(hoverTimeout);
      const tooltip = document.querySelector('.tooltip-container');
      if (tooltip) {
        tooltip.style.opacity = '0';
        setTimeout(() => tooltip.remove(), 150);
      }
    });
  });
}

function setupReloadButton() {
  const reloadBtn = document.getElementById('reload-btn');
  if (reloadBtn) {
    reloadBtn.textContent = '🔄';
    reloadBtn.disabled = false;
  }
}

async function fetchAndCacheData() {
  try {
    // First try to get FC Barcelona live match
    const liveRes = await fetch(`${BASE_URL}/matches?status=LIVE&team=${TEAM_ID}`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    const liveData = await liveRes.json();
    const liveMatches = liveData.matches || [];
    let live = liveMatches.find(m => m.homeTeam.id === TEAM_ID || m.awayTeam.id === TEAM_ID) || null;
    
    // If no FC Barcelona match, fetch ANY live match for testing
    if (!live) {
      try {
        const anyLiveRes = await fetch(`${BASE_URL}/matches?status=LIVE&limit=10`, {
          headers: { 'X-Auth-Token': API_KEY }
        });
        const anyLiveData = await anyLiveRes.json();
        if (anyLiveData.matches && anyLiveData.matches.length > 0) {
          live = anyLiveData.matches[0];
        }
      } catch (e) {
        // Silently handle error
      }
    }
    
    // Preserve live-specific data before fetching detailed match
    const liveMinute = live?.minute;
    const liveInjuryTime = live?.injuryTime;
    const liveGoals = live?.goals;
    const liveSubstitutions = live?.substitutions;
    
    // Fetch detailed match data if there's a live match
    if (live && live.id) {
      try {
        const detailedRes = await fetch(`${BASE_URL}/matches/${live.id}`, {
          headers: { 'X-Auth-Token': API_KEY }
        });
        const detailedData = await detailedRes.json();
        live = detailedData;
        // Restore live data that isn't in detailed match response
        if (liveMinute !== undefined) live.minute = liveMinute;
        if (liveInjuryTime !== undefined) live.injuryTime = liveInjuryTime;
        if (liveGoals !== undefined) live.goals = liveGoals;
        if (liveSubstitutions !== undefined) live.substitutions = liveSubstitutions;
      } catch (e) {
        // Silently handle error
      }
    }
    
    const fixturesRes = await fetch(`${BASE_URL}/teams/${TEAM_ID}/matches?status=SCHEDULED&limit=3`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData.matches || [];

    const resultsRes = await fetch(`${BASE_URL}/teams/${TEAM_ID}/matches?status=FINISHED&limit=10`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    const resultsData = await resultsRes.json();
    let results = resultsData.matches || [];
    results = results
      .filter(m => m.status === 'FINISHED')
      .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
      .slice(0, 3);

    const data = { live, fixtures, results };
    await chrome.storage.local.set({ 
      [CACHE_KEY]: data,
      [CACHE_TIMESTAMP_KEY]: Date.now()
    });
    return data;
  } catch (e) {
    throw e;
  }
}

function startAutoRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
  refreshTimer = setInterval(async () => {
    try {
      const data = await fetchAndCacheData();
      render(data);
      setupReloadButton();
    } catch (e) {
      // Silently handle error
    }
  }, REFRESH_INTERVAL);
}

async function init() {
  const cached = await chrome.storage.local.get([CACHE_KEY, CACHE_TIMESTAMP_KEY]);
  
  if (cached[CACHE_KEY] && cached[CACHE_TIMESTAMP_KEY]) {
    const age = Date.now() - cached[CACHE_TIMESTAMP_KEY];
    if (age < 5 * 60 * 1000) {
      render(cached[CACHE_KEY]);
      setupReloadButton();
      
      if (age > REFRESH_INTERVAL) {
        fetchAndCacheData().then(data => render(data)).catch(() => {});
      }
      
      startAutoRefresh();
      return;
    }
  }
  
  setLoading();
  try {
    const data = await fetchAndCacheData();
    render(data);
    setupReloadButton();
    startAutoRefresh();
  } catch (e) {
    setError();
  }
}

init(); 