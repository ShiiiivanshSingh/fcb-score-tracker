import { API_KEY } from './config.js';
import { getSettings } from './settings.js';

const TEAM_ID  = 86;
const BASE_URL = 'https://api.football-data.org/v4';

// Alarm names
const ALARM_LIVE   = 'fcb_live_poll';   // fires every 1 min while live
const ALARM_IDLE   = 'fcb_idle_poll';   // fires every 5 min when no match

/* ── Notification IDs ───────────────────────────────────────── */
// Using fixed IDs lets Chrome replace/update a notification instead
// of stacking duplicates.
const N_MATCH_START = 'fcb_match_start';
const N_HALF_TIME   = 'fcb_half_time';
const N_FULL_TIME   = 'fcb_full_time';
const N_GOAL        = 'fcb_goal';       // replaced each time a goal lands

/* ── State keys stored in chrome.storage.session ───────────── */
// session storage is cleared when the browser/service-worker restarts,
// which is exactly what we want — fresh state per browser session.
const KEY_LAST_STATUS    = 'bg_lastStatus';
const KEY_LAST_GOAL_CNT  = 'bg_lastGoalCount';
const KEY_LAST_MATCH_ID  = 'bg_lastMatchId';
const KEY_LAST_SCORE     = 'bg_lastScore';
const KEY_PREMATCH_ID    = 'bg_prematchNotified'; // Feature 15

/* ── Helpers ────────────────────────────────────────────────── */
function isHome(match) { return match.homeTeam.id === TEAM_ID; }

function getScore(match) {
  const s = match.score || {};
  const home = s.regularTime?.home ?? s.halfTime?.home ?? s.fullTime?.home ?? 0;
  const away = s.regularTime?.away ?? s.halfTime?.away ?? s.fullTime?.away ?? 0;
  return {
    barca: isHome(match) ? home : away,
    opp:   isHome(match) ? away : home,
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
    lastStatus:        data[KEY_LAST_STATUS]   ?? null,
    lastGoalCnt:       data[KEY_LAST_GOAL_CNT] ?? 0,
    lastMatchId:       data[KEY_LAST_MATCH_ID] ?? null,
    lastScore:         data[KEY_LAST_SCORE]    ?? null,
    prematchNotified:  data[KEY_PREMATCH_ID]   ?? null,
  };
}

async function setState(patch) {
  const mapped = {};
  if ('lastStatus'       in patch) mapped[KEY_LAST_STATUS]   = patch.lastStatus;
  if ('lastGoalCnt'      in patch) mapped[KEY_LAST_GOAL_CNT] = patch.lastGoalCnt;
  if ('lastMatchId'      in patch) mapped[KEY_LAST_MATCH_ID] = patch.lastMatchId;
  if ('lastScore'        in patch) mapped[KEY_LAST_SCORE]    = patch.lastScore;
  if ('prematchNotified' in patch) mapped[KEY_PREMATCH_ID]   = patch.prematchNotified;
  await chrome.storage.session.set(mapped);
}

function notify(id, title, message, iconPath = 'icon128.png') {
  chrome.notifications.create(id, {
    type:    'basic',
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
    const res = await fetch(
      `${BASE_URL}/teams/${TEAM_ID}/matches?status=IN_PLAY,PAUSED,HALF_TIME,FINISHED&limit=5`,
      { headers }
    );
    if (!res.ok) return;
    const data = await res.json();

    // Find the most recent relevant match (today or very recent)
    const candidates = (data.matches || [])
      .filter(m => {
        const d = new Date(m.utcDate);
        const now = new Date();
        const hoursDiff = (now - d) / 3600000;
        return hoursDiff < 6; // only matches within last 6 h
      })
      .sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));

    const match = candidates[0] || null;
    const state = await getState();

    if (!match) {
      // No recent match — if we previously had a live match, reset
      if (state.lastStatus === 'IN_PLAY' || state.lastStatus === 'HALF_TIME') {
        await setState({ lastStatus: null, lastGoalCnt: 0, lastMatchId: null, lastScore: null });
      }
      scheduleIdleAlarm();
      return;
    }

    const matchId  = match.id;
    const status   = match.status;
    const opp      = getOpponent(match);
    const score    = getScore(match);

    // New match or same match continuing
    const isNewMatch = matchId !== state.lastMatchId;

    if (isNewMatch) {
      // Reset per-match state
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

    // ── Half Time ────────────────────────────────────────────
    if (status === 'HALF_TIME' && state.lastStatus !== 'HALF_TIME') {
      const s = await getSettings();
      if (s.notifyHalfTime) {
        notify(N_HALF_TIME, '🕑 Half Time', `Barça ${score.barca} – ${score.opp} ${opp}`);
      }
      await setState({ lastStatus: 'HALF_TIME', lastScore: score });
      return;
    }

    // ── Full Time ────────────────────────────────────────────
    if (status === 'FINISHED' && state.lastStatus !== 'FINISHED') {
      const s = await getSettings();
      if (s.notifyFullTime) {
        const result = score.barca > score.opp ? '🏆 Win!' : score.barca < score.opp ? '😞 Loss' : '🤝 Draw';
        notify(
          N_FULL_TIME,
          `${result} · Full Time`,
          `Barça ${score.barca} – ${score.opp} ${opp} · ${match.competition?.name || 'FT'}`
        );
      }
      await setState({ lastStatus: 'FINISHED', lastScore: score });
      scheduleIdleAlarm();
      return;
    }

    // ── Goal events (need detailed match data for scorer info) ──
    if (status === 'IN_PLAY' || status === 'PAUSED') {
      // Fetch match detail to count goals and get scorer names
      try {
        const detailRes = await fetch(`${BASE_URL}/matches/${matchId}`, { headers });
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
                const oppTotal   = goalsUpToThis.filter(x => x.team?.id !== TEAM_ID && x.type !== 'OWN_GOAL').length
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
      } catch (_) {}

      await setState({ lastStatus: status });
      scheduleLiveAlarm();
    }

    // ── Feature 15: Pre-match alarm (15 min before kickoff) ───
    if (!match) {
      try {
        const schRes = await fetch(
          `${BASE_URL}/teams/${TEAM_ID}/matches?status=SCHEDULED&limit=5`,
          { headers }
        );
        if (schRes.ok) {
          const schData = await schRes.json();
          const next = (schData.matches || [])
            .filter(m => m.status === 'SCHEDULED' || m.status === 'TIMED')
            .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))[0];
          if (next) {
            const mins = (new Date(next.utcDate) - Date.now()) / 60000;
            const prevNotified = state.prematchNotified;
            if (mins >= 14 && mins <= 16 && prevNotified !== next.id) {
              const opp2 = isHome(next) ? next.awayTeam.shortName : next.homeTeam.shortName;
              notify('fcb_prematch', '⏰ Barça kick off soon!',
                `vs ${opp2} in ~15 min · ${next.competition?.name || ''}`);
              await setState({ prematchNotified: next.id });
            }
          }
        }
      } catch (_) {}
    }

  } catch (e) {
    // Silently fail — network might be down
  }
}


/* ── Alarm management ───────────────────────────────────────── */
function scheduleLiveAlarm() {
  chrome.alarms.getAll(alarms => {
    const hasLive = alarms.some(a => a.name === ALARM_LIVE);
    if (!hasLive) {
      chrome.alarms.create(ALARM_LIVE, { periodInMinutes: 1 });
    }
    // Cancel the slow idle alarm while live
    chrome.alarms.clear(ALARM_IDLE);
  });
}

function scheduleIdleAlarm() {
  chrome.alarms.getAll(alarms => {
    const hasIdle = alarms.some(a => a.name === ALARM_IDLE);
    if (!hasIdle) {
      chrome.alarms.create(ALARM_IDLE, { periodInMinutes: 5 });
    }
    // Cancel live alarm when no match
    chrome.alarms.clear(ALARM_LIVE);
  });
}

/* ── Extension lifecycle ────────────────────────────────────── */
chrome.runtime.onInstalled.addListener(() => {
  scheduleIdleAlarm();
  poll(); // run immediately on install/reload
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
