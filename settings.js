// Shared notification preference helpers used by both popup.js and background.js

const SETTINGS_KEY = 'fcb_notification_settings';

export const DEFAULTS = {
  notifyGoals:      true,
  notifyMatchStart: true,
  notifyHalfTime:   true,
  notifyFullTime:   true,
};

export async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULTS, ...(data[SETTINGS_KEY] || {}) };
}

export async function saveSettings(patch) {
  const current = await getSettings();
  const updated  = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: updated });
  return updated;
}
