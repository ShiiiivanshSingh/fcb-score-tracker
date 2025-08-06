const API_KEY = 'cc84d018697c4ba993da7c48de25dea5';
const TEAM_ID = 81; 
const BASE_URL = 'https://api.football-data.org/v4';
const REFRESH_INTERVAL = 60 * 1000; 

function setLoading() {
  document.getElementById('root').innerHTML = `
    <div class="header">FC Barcelona</div>
    <div class="section">Loading...</div>
  `;
}

function setError() {
  document.getElementById('root').innerHTML = `
    <div class="header">FC Barcelona</div>
    <div class="section">Error loading data. Please try again later.</div>
  `;
}

function formatMatchTime(match) {
  if (match.status === 'IN_PLAY' || match.status === 'PAUSED') {
    // Usimg minute
    if (match.minute) return `${match.minute}'`;
    return 'LIVE';
  }
  if (match.status === 'HALF_TIME') return 'HT';
  if (match.status === 'FINISHED') return 'FT';
  return '';
}

function render({ live, fixtures, results }) {
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="header">FC Barcelona </div>
    
    <div class="section">
      ${live ?
        `<div class="live">Live: ${live.homeTeam.shortName} ${live.score.fullTime.home ?? '-'} - ${live.score.fullTime.away ?? '-'} ${live.awayTeam.shortName} <span class="match-time">${formatMatchTime(live)}</span></div>`
        : `<div class="status">No live match</div>`}
    </div>
    <div class="section">
      <div class="status">Upcoming Fixtures</div>
      ${fixtures.length ? fixtures.map(f =>
        `<div class="fixture"><span class="team">vs ${f.awayTeam.id === TEAM_ID ? f.homeTeam.shortName : f.awayTeam.shortName}</span><span>${(new Date(f.utcDate)).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>`
      ).join('') : '<div class="status">No upcoming fixtures</div>'}
    </div>
    <div class="section">
      <div class="status">Recent Results</div>
      ${results.length ? results.map(r =>
        `<div class="result"><span class="team">vs ${r.awayTeam.id === TEAM_ID ? r.homeTeam.shortName : r.awayTeam.shortName}</span><span class="score">${r.score.fullTime.home}-${r.score.fullTime.away} ${r.score.winner === 'DRAW' ? 'D' : (r.score.winner === 'HOME_TEAM' && r.homeTeam.id === TEAM_ID) || (r.score.winner === 'AWAY_TEAM' && r.awayTeam.id === TEAM_ID) ? 'W' : 'L'}</span></div>`
      ).join('') : '<div class="status">No recent results</div>'}
    </div>
          <img src="fcb.svg" alt="FC Barcelona" class="logo" height="50" width="50" style="display: block; margin: 0 auto;">

  `;
}

async function fetchDataAndRender() {
  setLoading();
  try {
    // live match
    const liveRes = await fetch(`${BASE_URL}/matches?status=LIVE&team=${TEAM_ID}`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    const liveData = await liveRes.json();
    const live = liveData.matches && liveData.matches.length ? liveData.matches[0] : null;

    // upcoming fixtures
    const fixturesRes = await fetch(`${BASE_URL}/teams/${TEAM_ID}/matches?status=SCHEDULED&limit=3`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    const fixturesData = await fixturesRes.json();
    const fixtures = fixturesData.matches || [];

    // recent results 
    const resultsRes = await fetch(`${BASE_URL}/teams/${TEAM_ID}/matches?status=FINISHED&limit=10`, {
      headers: { 'X-Auth-Token': API_KEY }
    });
    const resultsData = await resultsRes.json();
    let results = resultsData.matches || [];
    results = results
      .filter(m => m.status === 'FINISHED')
      .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate))
      .slice(0, 3);

    render({ live, fixtures, results });
  } catch (e) {
    setError();
  }
}

fetchDataAndRender();
setInterval(fetchDataAndRender, REFRESH_INTERVAL); 