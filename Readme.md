<a name="readme-top"></a>

<div align="center">

  <img src="fcb.svg" alt="FC Barcelona Crest" width="72" height="72"/>

  <h1>FC Barcelona Live Tracker 🔵🔴</h1>

  <p>A feature-rich Chrome extension for real-time FC Barcelona scores, fixtures, standings, and more — in pure Blaugrana style.</p>

  <a href="https://github.com/ShiiiivanshSingh/fcb-score-tracker/releases/tag/final"><img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome Extension"></a>
  <a href="#-getting-started"><img src="https://img.shields.io/badge/🔧%20How%20to%20Install-FF1411?style=for-the-badge" alt="How to Install"></a>
  <a href="#️-api-key-setup"><img src="https://img.shields.io/badge/⚠️%20API%20Key%20Setup-FF4136?style=for-the-badge&logo=github" alt="API Key Setup"></a>

</div>

---

## why i made this

ok i want to confess something — most of the time when i make something i don't really interact with you. yes, you. this makes my whole profile feel very robotic, no personality or soul, while it may seem like it, but that's not the case. i've realised all i want is perfection and that comes with a cost — the cost of having no soul, no personality.

so here it is. i made this because (a) i love barça and (b) i was bored at home. i hope at least one person finds it useful, and even if you don't — honestly it doesn't matter. i've been building stuff for so long but always felt like i didn't put any personality into it. so that's why i'm writing this, as a message to myself: put yourself out there no matter how much this world will clown you for it. peace. ✌️

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 🟡 | **Live Score** | Real-time score, match minute, and status pill (LIVE / HT / FT) with auto-refresh |
| ⚽ | **Goal Events** | In-popup animated toast + live event strip showing goalscorers, OGs, and penalties |
| 🟥 | **Card Events** | Yellow ⚠️ and red 🟥 card bookings shown inline with goals in the live strip |
| 🏟 | **Venue & Referee** | Stadium name and referee shown on the live card |
| 👕 | **Starting XI** | Tap "Lineup ▼" during a live match to expand both teams' starting elevens |
| 📅 | **Upcoming Fixtures** | Next scheduled matches with countdown timer and H/A indicator |
| 🏁 | **Recent Results** | Last results with score, W/D/L badge, and "Show more" to expand up to 20 |
| 📊 | **La Liga Standings** | Barça's current La Liga position, played/won/drawn/lost/points |
| 🏆 | **UCL Standings** | Champions League standing with a La Liga / UCL tab switcher |
| ⚽ | **Top Scorers** | Barça's top 5 La Liga goalscorers for the season |
| 📈 | **Form Guide** | Recent form dots (W/D/L) calculated from last results |
| 🔍 | **Competition Filter** | Filter fixtures and results by competition (La Liga, UCL, Copa…) from the ⚙️ settings panel |
| 🔔 | **Smart Notifications** | Background push notifications for kick-off, half time, full time, goals — individually toggleable |
| ⏰ | **Pre-Match Alarm** | Notification 15 minutes before kick-off |
| 🔗 | **Clickable Rows** | Click any fixture or result to open a Google search for that match |
| ⚡ | **Rate-Limit Safe Cache** | API responses cached for 60 seconds — popup opens are instant and never hit your rate limit |

---

## 📸 Preview

<div align="center">
  <img width="404" alt="FC Barcelona Live Tracker Preview" src="https://github.com/user-attachments/assets/40ba1052-696a-44a4-8003-e97924e4175b" />
</div>

---

## 🛡️ API Key Setup

This extension uses the free [football-data.org](https://www.football-data.org/) API.

**Free tier:** 10 requests/minute — the extension is designed to stay well within this limit via response caching.

### Steps

1. **Sign up** at [football-data.org](https://www.football-data.org/) and copy your API key from the dashboard.

2. **Create `config.js`** in the extension directory:
   ```js
   // config.js
   export const API_KEY = 'YOUR_API_KEY_HERE';
   ```

3. **`config.js` is in `.gitignore`** — it will never be committed to your repo. Keep your key private.

4. **Reload the extension** at `chrome://extensions/` after adding the file.

> If you see a "Could not load data" or "API key missing" error in the popup, click **"See why ↗"** which links directly here.

---

## 🚀 Getting Started

### Installation

1. [**Download the ZIP**](https://github.com/ShiiiivanshSingh/fcb-score-tracker/archive/refs/heads/main.zip) and extract it.
2. Open Chrome and navigate to:
   ```
   chrome://extensions/
   ```
3. Enable **Developer Mode** (top-right toggle).
4. Click **"Load unpacked"** and select the extracted folder.
5. The Barça crest 🔵🔴 appears in your toolbar — you're done.

### Requirements

- Any Chromium-based browser (Chrome, Edge, Brave, Arc, etc.)
- A free [football-data.org](https://www.football-data.org/) API key

---

## 🛠️ Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| "API key missing or invalid" | `config.js` missing or wrong key | Re-check [API Key Setup](#️-api-key-setup) |
| Data not updating | Rate limited (> 10 req/min) | Wait 60 s, the cache will expire and retry |
| UCL standings empty | Barça not currently in a UCL group stage | Expected — only shows when data is available |
| Lineup not showing | API doesn't return lineups until closer to kick-off | Check back nearer match time |

---

## 🔧 Tech Stack

<div align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Chrome%20Extensions%20API-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome Extensions">
  <img src="https://img.shields.io/badge/football--data.org-004D98?style=for-the-badge" alt="Football Data API">
</div>

**Architecture:**
- `manifest.json` — MV3 extension manifest
- `popup.html / popup.css / popup.js` — the extension popup UI
- `background.js` — service worker for background polling and push notifications
- `settings.js` — shared notification preference helpers (`chrome.storage.local`)
- `config.js` — your API key (not committed, gitignored)

---

## 🤝 Contributing

1. Fork the [repository](https://github.com/ShiiiivanshSingh/fcb-score-tracker/)
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🔗 Connect

<div align="center">
  <a href="https://github.com/ShiiiivanshSingh"><img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"></a>
  <a href="https://www.linkedin.com/in/shivansh-pratap-singh-23b3b92b1"><img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
  <a href="https://x.com/de_mirage_fan"><img src="https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white" alt="Twitter"></a>
</div>

<br>

<div align="center">
  <a href="https://github.com/ShiiiivanshSingh/fcb-score-tracker/archive/refs/heads/main.zip"><img src="https://img.shields.io/badge/🔽%20Download%20Extension-FF5733?style=for-the-badge" alt="Download"></a>
  <a href="https://github.com/ShiiiivanshSingh/fcb-score-tracker/"><img src="https://img.shields.io/badge/📦%20View%20on%20GitHub-28A745?style=for-the-badge" alt="GitHub"></a>
</div>

<br>

<div align="center">
  Built with ♥️ by <a href="https://github.com/ShiiiivanshSingh">sh1vansh</a> — Visca el Barça! 🔵🔴
</div>
