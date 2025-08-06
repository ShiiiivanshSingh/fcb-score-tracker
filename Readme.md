<a name="readme-top"></a>

<div align="center">
  <h1>FC Barcelona Live Score Tracker ⚽🔵🔴</h1>
  <p>A minimal browser extension for real-time FC Barcelona scores, fixtures, and results — in pure Blaugrana style!</p>
  
  <a href="https://github.com/ShiiiivanshSingh/fcb-score-tracker/archive/refs/heads/main.zip"><img src="https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white" alt="Chrome Extension"></a>

  <a href="#-getting-started"><img src="https://img.shields.io/badge/🔧%20How%20to%20Install-FF5733?style=for-the-badge" alt="How to Install"></a>

  
</div>

Welcome to FC Barcelona Live Tracker! Instantly see live scores, match time, upcoming fixtures, and recent results for Barça — right from your browser. No ads, no clutter, just pure football.

<div align="center">
 <h1>Preview ⚽️</h1>


  <img src="preview.gif" alt="Preview" width="400"/>
</div>

## ✨ Key Features

* 🟦🔴 **Barça!!**<br>Beautiful, modern UI in FC Barcelona's iconic blue and garnet.
* 🟡 **Live Score & Match Time**<br>See the current score and match status (with auto-refresh).
* 📅 **Upcoming Fixtures**<br>Next 3 scheduled matches, always up to date.
* 🏁 **Recent Results**<br>Past 3 match results, with win/draw/loss indicator.
* ⚡ **Super Fast**<br>Minimal, clutter-free, and refreshes automatically.

## 🔧 Technologies Used

<div align="center">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Football%20Data%20API-004D98?style=for-the-badge" alt="Football Data API">
</div>







## 🚀 Getting Started

### Installation
1. [Download the extension files](https://github.com/ShiiiivanshSingh/fcb-score-tracker/archive/refs/heads/main.zip)
2. Open Chrome and go to:
   ```bash
   chrome://extensions/
   ```
3. Enable Developer Mode.
4. Click "Load unpacked" and select the extension directory.
5. The Barça icon will appear in your browser toolbar.

### Usage
1. Click the extension icon to open the popup
2. Instantly see live score, match time, fixtures, and results
3. Enjoy the beautiful Blaugrana UI and real-time updates!

### Prerequisites
- Any Chromium-based browser (Chrome, Edge, Brave, etc.)

## 📅 What You Get

* **Live Score** — Real-time score and match time for FC Barcelona
* **Upcoming Fixtures** — Next 3 matches, always current
* **Recent Results** — Last 3 results, with W/D/L
* **No Ads, No News, No Distractions**

## 🎯 Features Coming Soon

* 📦 More customization options
* 🌐 Multi-language support
* 📱 Mobile-friendly popup

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. Fork the [repository](https://github.com/ShiiiivanshSingh/fcb-score-tracker/)
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
5. Push to the branch (`git push origin feature/AmazingFeature`)
6. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Connect With the Developer

<div align="center">
  <a href="https://github.com/ShiiiivanshSingh"><img src="https://img.shields.io/badge/GitHub-100000?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"></a>
  <a href="https://www.linkedin.com/in/shivansh-pratap-singh-23b3b92b1"><img src="https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn"></a>
  <a href="https://x.com/de_mirage_fan"><img src="https://img.shields.io/badge/Twitter-1DA1F2?style=for-the-badge&logo=twitter&logoColor=white" alt="Twitter"></a>
</div>
<div align="center">
  <a href="https://github.com/ShiiiivanshSingh/fcb-score-tracker/archive/refs/heads/main.zip"><img src="https://img.shields.io/badge/🔽%20Download%20Extension-FF5733?style=for-the-badge" alt="Download Extension"></a>
  <a href="https://github.com/ShiiiivanshSingh/fcb-score-tracker/"><img src="https://img.shields.io/badge/📦%20View%20on%20GitHub-28A745?style=for-the-badge" alt="View on GitHub"></a>
</div>

<div align="center">
  Built with ♥️ by sh1vansh!
</div>
#  fcb-score-tracker

## 🛡️ API Key Setup

To use this extension, you need a free API key from [football-data.org](https://www.football-data.org/).

### How to Get and Use Your API Key

1. **Sign up at [football-data.org](https://www.football-data.org/)**
   - Register for a free account and get your API key from your dashboard.
2. **Create a file named `config.js` in the extension directory.**
3. **Paste the following code into `config.js`:**
   ```js
   // config.js
   export const API_KEY = 'YOUR_API_KEY_HERE';
   ```
   Replace `'YOUR_API_KEY_HERE'` with your actual API key.
4. **Do not share your API key publicly!**
   - `config.js` is already in `.gitignore` and will not be committed to your repository.
5. **Reload the extension in your browser.**

If you see an error in the extension, click the "See why" button to get troubleshooting help and API setup instructions in this README.

---

## 🛠️ Troubleshooting & API Errors

If you get an error or see the "See why" button in the extension, it usually means:
- Your API key is missing or incorrect
- You have exceeded your free API request limit
- The football-data.org API is temporarily unavailable

For detailed help, see the [API Key Setup](#️-api-key-setup) section above or visit the [GitHub repo README](https://github.com/ShiiiivanshSingh/fcb-score-tracker#️-api-key-setup).
