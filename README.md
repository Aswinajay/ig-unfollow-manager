# 🚀 IG Unfollow Manager

**A Chrome Extension to find and unfollow Instagram users who don't follow you back.**

![Version](https://img.shields.io/badge/Version-2.0.0-blue.svg)
![MV3](https://img.shields.io/badge/Manifest-V3-green.svg)
![Local Only](https://img.shields.io/badge/Data-100%25%20Local-orange.svg)

## ✨ Features

- **Scan your own account** or any public profile
- **Mutual detection** — auto-unticks accounts that follow you back
- **Follower threshold** — auto-skip large accounts (celebrities etc.)
- **Whitelist** — protect specific accounts from being unfollowed
- **Fast Scan** — instant results without fetching follower counts
- **Live search** — filter results as you type
- **Select All / Deselect All** — bulk control
- **Export** — download results as `.txt` or `.csv`
- **Auto-retry** — rate limit recovery with exponential backoff
- **OTA update banner** — notified when a new version is available
- **Remove Follower mode** — remove followers from your account

## 🛠 Installation (Developer Mode)

1. Clone or download this repo
2. Go to `chrome://extensions/`
3. Enable **Developer Mode** (top right)
4. Click **Load unpacked**
5. Select the `ig-unfollow-extension` folder

## 📖 How to Use

1. Open [instagram.com](https://instagram.com) and log in
2. Click the extension icon
3. Leave Target blank to scan **your own account**, or enter any **public** username
4. Click **Scan Non-Followers**
5. Review the list — mutual followers are auto-unticked
6. Select who to unfollow and click **Unfollow Selected**

## 🔄 Updating

When a new version is available, a yellow banner appears. Click it to go to GitHub and download the latest zip, then re-load the extension in Chrome.

Or run in terminal:
```bash
cd path/to/ig-unfollow-extension
git pull origin main
```
Then reload in `chrome://extensions`.

## 🔐 Privacy

- No passwords collected
- No data sent to any server
- All processing is 100% local in your browser
- Uses your existing Instagram session cookies

## ⚠️ Use Responsibly

Unfollowing too many accounts too quickly can trigger Instagram's action blocks. Use the delay slider to slow down the pace. Recommended: 3-5 seconds between actions.
