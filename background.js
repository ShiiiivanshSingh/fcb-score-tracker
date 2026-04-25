import { API_KEY } from './config.js';
import { getSettings } from './settings.js';

const TEAM_ID = 81;
const BASE_URL = 'https://api.football-data.org/v4';

// Alarm names
const ALARM_LIVE = 'fcb_live_poll';   // fires every 1 min while live
const ALARM_IDLE = 'fcb_idle_poll';   // fires every 10 min when no match

/* ── Notification IDs ───────────────────────────────────────── */
const N_MATCH_START = 'fcb_match_start';
const N_HALF_TIME = 'fcb_half_time';
const N_FULL_TIME = 'fcb_full_time';
const N_GOAL = 'fcb_goal';

/* ── State keys stored in chrome.storage.session ───────────── */
const KEY_LAST_STATUS = 'bg_lastStatus';
const KEY_LAST_GOAL_CNT = 'bg_lastGoalCount';
const KEY_LAST_MATCH_ID = 'bg_lastMatchId';
const KEY_LAST_SCORE = 'bg_lastScore';
const KEY_PREMATCH_ID = 'bg_prematchNotified';

/* ── Helpers ────────────────────────────────────────────────── */
function isHome(match) { return match.homeTeam.id === TEAM_ID; }

function getScore(match) {
  const s = match.score || {};
  const rtHome = s.regularTime?.home;
  const rtAway = s.regularTime?.away;
  const htHome = s.halfTime?.home;
  const htAway = s.halfTime?.away;
  const ftHome = s.fullTime?.home;
  const ftAway = s.fullTime?.away;
  const home = rtHome != null ? rtHome : (htHome != null ? htHome : (ftHome != null ? ftHome : 0));
  const away = rtAway != null ? rtAway : (htAway != null ? htAway : (ftAway != null ? ftAway : 0));
  return {
    barca: isHome(match) ? home : away,
    opp: isHome(match) ? away : home,
  };
}

function getOpponent(match) {
  return isHome(match) ? match.awayTeam.shortName : match.homeTeam.shortName;
}

async function getState() {
  const data = await chrome.storage.session.get([
    KEY_LAST_STATUS, KEY_LAST_GOAL_CNT, KEY_LAST_MATCH_ID, KEY_LAST_SCORE, KEY_PREMATCH_ID,
  ]);
  return {
    lastStatus: data[KEY_LAST_STATUS] ?? null,
    lastGoalCnt: data[KEY_LAST_GOAL_CNT] ?? 0,
    lastMatchId: data[KEY_LAST_MATCH_ID] ?? null,
    lastScore: data[KEY_LAST_SCORE] ?? null,
    prematchNotified: data[KEY_PREMATCH_ID] ?? null,
  };
}

async function setState(patch) {
  const mapped = {};
  if ('lastStatus' in patch) mapped[KEY_LAST_STATUS] = patch.lastStatus;
  if ('lastGoalCnt' in patch) mapped[KEY_LAST_GOAL_CNT] = patch.lastGoalCnt;
  if ('lastMatchId' in patch) mapped[KEY_LAST_MATCH_ID] = patch.lastMatchId;
  if ('lastScore' in patch) mapped[KEY_LAST_SCORE] = patch.lastScore;
  if ('prematchNotified' in patch) mapped[KEY_PREMATCH_ID] = patch.prematchNotified;
  await chrome.storage.session.set(mapped);
}

function notify(id, title, message, iconPath = 'icon128.png') {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: iconPath,
    title,
    message,
    priority: 2,
    silent: false,
  });
}

/* ── Core polling logic ─────────────────────────────────────── */
async function poll() {
  try {
    const headers = { 'X-Auth-Token': API_KEY };

    // Use two separate requests — API v4 doesn't accept comma-separated statuses
    const [inPlayRes, pausedRes] = await Promise.all([
      fetch(`${BASE_URL}/teams/${TEAM_ID}/matches?status=IN_PLAY`, { headers }),
      fetch(`${BASE_URL}/teams/${TEAM_ID}/matches?status=PAUSED`, { headers }),
    ]);

    // Back off silently on rate limit
    if (inPlayRes.status === 429 || pausedRes.status === 429) return;
    if (!inPlayRes.ok && !pausedRes.ok) return;

    const [inPlayData, pausedData] = await Promise.all([
      inPlayRes.ok ? inPlayRes.json() : Promise.resolve({ matches: [] }),
      pausedRes.ok ? pausedRes.json() : Promise.resolve({ matches: [] }),
    ]);

    const allLive = [
      ...(inPlayData.matches || []),
      ...(pausedData.matches || []),
    ];

    const match = allLive[0] || null;
    const state = await getState();

    if (!match) {
      // No live match — check for pre-match alert and reset state
      if (state.lastStatus === 'IN_PLAY' || state.lastStatus === 'PAUSED') {
        await setState({ lastStatus: null, lastGoalCnt: 0, lastMatchId: null, lastScore: null });
      }
      await checkPreMatch(headers, state);
      scheduleIdleAlarm();
      return;
    }

    const matchId = match.id;
    const status = match.status;
    const opp = getOpponent(match);
    const score = getScore(match);
    const isNewMatch = matchId !== state.lastMatchId;

    if (isNewMatch) {
      await setState({ lastMatchId: matchId, lastStatus: null, lastGoalCnt: 0, lastScore: null });
    }

    // ── Match Start ──────────────────────────────────────────
    if (
      status === 'IN_PLAY' &&
      (state.lastStatus === null || state.lastStatus === 'SCHEDULED' || state.lastStatus === 'TIMED' || isNewMatch)
    ) {
      const s = await getSettings();
      if (s.notifyMatchStart) {
        const venue = isHome(match) ? 'Home' : 'Away';
        notify(
          N_MATCH_START,
          '⚽ FC Barcelona — Kick Off!',
          `${isHome(match) ? 'FC Barcelona' : opp} vs ${isHome(match) ? opp : 'FC Barcelona'} · ${match.competition?.name || 'Match'} · ${venue}`
        );
      }
      await setState({ lastStatus: 'IN_PLAY', lastScore: score });
      scheduleLiveAlarm();
      return;
    }

    // ── Half Time (API reports as PAUSED) ────────────────────
    if (status === 'PAUSED' && state.lastStatus === 'IN_PLAY') {
      const s = await getSettings();
      if (s.notifyHalfTime) {
        notify(N_HALF_TIME, '🕑 Half Time', `Barça ${score.barca} – ${score.opp} ${opp}`);
      }
      await setState({ lastStatus: 'PAUSED', lastScore: score });
      return;
    }

    // ── Goal events (need detailed match data for scorer info) ──
    if (status === 'IN_PLAY' || status === 'PAUSED') {
      try {
        const detailRes = await fetch(`${BASE_URL}/matches/${matchId}`, { headers });
        if (detailRes.status === 429) { scheduleLiveAlarm(); return; }
        if (detailRes.ok) {
          const detail = await detailRes.json();
          const goals = detail.goals || [];
          const totalGoals = goals.length;

          if (totalGoals > state.lastGoalCnt) {
            const newGoals = goals.slice(state.lastGoalCnt);
            const s = await getSettings();
            if (s.notifyGoals) {
              for (const g of newGoals) {
                const isBarcaGoal = g.team?.id === TEAM_ID;
                const scorer = g.scorer?.name?.split(' ').pop() || g.player?.name?.split(' ').pop() || '?';
                const goalType = g.type === 'OWN_GOAL' ? ' (OG)' : g.type === 'PENALTY' ? ' (P)' : '';
                const goalsUpToThis = goals.slice(0, state.lastGoalCnt + newGoals.indexOf(g) + 1);
                const barcaTotal = goalsUpToThis.filter(x => x.team?.id === TEAM_ID && x.type !== 'OWN_GOAL').length
                  + goalsUpToThis.filter(x => x.team?.id !== TEAM_ID && x.type === 'OWN_GOAL').length;
                const oppTotal = goalsUpToThis.filter(x => x.team?.id !== TEAM_ID && x.type !== 'OWN_GOAL').length
                  + goalsUpToThis.filter(x => x.team?.id === TEAM_ID && x.type === 'OWN_GOAL').length;
                if (isBarcaGoal && g.type !== 'OWN_GOAL') {
                  notify(`${N_GOAL}_${totalGoals}`, `🔵🔴 GOAL! ${scorer}${goalType} ${g.minute}'`, `Barça ${barcaTotal} – ${oppTotal} ${opp}`);
                } else {
                  notify(`${N_GOAL}_${totalGoals}`, `😤 Goal Against — ${scorer}${goalType} ${g.minute}'`, `Barça ${barcaTotal} – ${oppTotal} ${opp}`);
                }
              }
            }
            await setState({ lastGoalCnt: totalGoals, lastScore: score });
          }
        }
      } catch (_) { }

      await setState({ lastStatus: status });
      scheduleLiveAlarm();
    }

  } catch (e) {
    // Silently fail — network might be down
  }
}

/* ── Pre-match alert (15 min before kickoff) ────────────────── */
async function checkPreMatch(headers, state) {
  try {
    const schRes = await fetch(
      `${BASE_URL}/teams/${TEAM_ID}/matches?status=SCHEDULED&limit=5`,
      { headers }
    );
    if (!schRes.ok) return;
    const schData = await schRes.json();
    const next = (schData.matches || [])
      .filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED')
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0];
    if (next) {
      const mins = (new Date(next.utcDate) - Date.now()) / 60000;
      if (mins >= 14 && mins <= 16 && state.prematchNotified !== next.id) {
        const opp2 = isHome(next) ? next.awayTeam.shortName : next.homeTeam.shortName;
        notify('fcb_prematch', '⏰ Barça kick off soon!',
          `vs ${opp2} in ~15 min · ${next.competition?.name || ''}`);
        await setState({ prematchNotified: next.id });
      }
    }
  } catch (_) { }
}

/* ── Alarm management ───────────────────────────────────────── */
function scheduleLiveAlarm() {
  chrome.alarms.getAll(alarms => {
    const hasLive = alarms.some(a => a.name === ALARM_LIVE);
    if (!hasLive) {
      chrome.alarms.create(ALARM_LIVE, { periodInMinutes: 1 });
    }
    chrome.alarms.clear(ALARM_IDLE);
  });
}

function scheduleIdleAlarm() {
  chrome.alarms.getAll(alarms => {
    const hasIdle = alarms.some(a => a.name === ALARM_IDLE);
    if (!hasIdle) {
      // 10 min idle poll — gives popup plenty of headroom within the 10 req/min free tier
      chrome.alarms.create(ALARM_IDLE, { periodInMinutes: 10 });
    }
    chrome.alarms.clear(ALARM_LIVE);
  });
}

/* ── Extension lifecycle ────────────────────────────────────── */
chrome.runtime.onInstalled.addListener(() => {
  scheduleIdleAlarm();
  poll();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleIdleAlarm();
  poll();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === ALARM_LIVE || alarm.name === ALARM_IDLE) {
    poll();
  }
});
