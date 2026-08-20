# 🎬 CinePilot Studio — Community Edition

<div align="center">

![CinePilot Banner](https://img.shields.io/badge/CinePilot-v6.2.0_Community_Edition-7a5af8?style=for-the-badge&logo=stremio&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Stremio](https://img.shields.io/badge/Stremio-Addon-5c46e3?style=for-the-badge&logo=stremio&logoColor=white)](https://stremio.com)
[![Patreon](https://img.shields.io/badge/Patreon-Support_Project-FF424D?style=for-the-badge&logo=patreon&logoColor=white)](https://www.patreon.com/cagrigoksel)

**The Ultimate Modular Stremio Catalog Builder & Intelligent Companion**  
*Curated Catalogs • Letterboxd & TMDB Custom Lists • 9 Languages • 4K Official Trailers • RPDB Ratings*

[🚀 Launch Web Studio](https://cinepilot-8mg0.onrender.com/configure) • [✨ Features](#-key-features) • [📦 Installation](#-instant-installation) • [☕ Support on Patreon](https://www.patreon.com/cagrigoksel)

</div>

---

## 🌟 Overview

**CinePilot** is a next-generation, high-performance Stremio Addon designed to revolutionize how you discover, organize, and browse movies and series. Built from the ground up with pure Node.js and modern Web technologies, CinePilot gives you complete modular control over your Stremio home screen.

---

## ✨ Key Features

### 🌐 1. Global Multi-Language Support (9 Languages)
CinePilot speaks your language! Switch seamlessly between **9 languages**:
* 🇺🇸 **English** *(Default)*
* 🇹🇷 **Türkçe**
* 🇪🇸 **Español**
* 🇩🇪 **Deutsch**
* 🇫🇷 **Français**
* 🇮🇹 **Italiano**
* 🇯🇵 **日本語**
* 🇰🇷 **한국어**
* 🇨🇳 **中文**

> Localized catalog titles, UI configurator, and TMDB overviews/synopses are translated in real-time according to your selection.

### 📚 2. Custom Letterboxd & TMDB Lists & Collections
Add **ANY** public list URL from:
* 🟢 **Letterboxd Lists** (e.g. `https://letterboxd.com/arinbicer/list/mcu/`, Top 500, user lists)
* 🔵 **TMDB Franchise Collections** (e.g. `https://www.themoviedb.org/collection/86311` Avengers Collection)
* 🔵 **TMDB Lists** (e.g. `https://www.themoviedb.org/list/1` Marvel Universe)

### 📌 3. Letterboxd Watchlist & Diary Sync
Enter your Letterboxd username to automatically sync:
* 📌 **Personal Watchlist**
* 🍿 **Watched Movies Log (Diary)**

### 🔥 4. High-Quality Curated Catalogs
* **Trending Movies:** Top 100 weekly trending movies with multi-genre filters.
* **Trending TV Series:** Top 100 weekly trending TV shows with episode metadata.
* **Oscar Collection:** Decades of Academy Award Best Picture winners.
* **IMDb Top 250:** The all-time greatest cinematic masterpieces.

### 🎬 5. Smart 4K / HD Official Trailers
Watch official YouTube trailers and teasers directly inside Stremio with a single click.

### 🎨 6. Rating Poster Database (RPDB) Integration
Optionally provide your personal [RPDB](https://ratingposterdb.com/) API key to view posters with embedded IMDb, TMDb, Rotten Tomatoes, and Metacritic ratings.

---

## 📦 Instant Installation

1. Open the **[CinePilot Web Studio](https://cinepilot-8mg0.onrender.com/configure)**.
2. Select your preferred language.
3. Toggle the catalogs you want, add your custom Letterboxd or TMDB lists, or enter your Letterboxd username.
4. Click **"🚀 Install to Stremio"** or copy the generated Manifest URL.
5. Enjoy your personalized cinematic universe in Stremio on PC, Mac, Android, iOS, Android TV, and Samsung Smart TV!

---

## 🛠️ Self-Hosting / Deployment

### Option A: 1-Click Deploy on Render
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/cagrigoksel/CinePilot)

### Option B: Docker
```bash
docker build -t cinepilot .
docker run -p 7050:7050 cinepilot
```

### Option C: Local Node.js
```bash
git clone https://github.com/cagrigoksel/CinePilot.git
cd CinePilot
npm install
npm start
```
Then visit `http://localhost:7050/configure`.

---

## ☕ Support the Project

CinePilot is an open-source project created and maintained for the global Stremio community. If CinePilot enhances your movie nights, consider supporting ongoing development, hosting, and server maintenance:

[![Support on Patreon](https://img.shields.io/badge/Patreon-Support_CinePilot-FF424D?style=for-the-badge&logo=patreon&logoColor=white)](https://www.patreon.com/cagrigoksel)

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

---

<div align="center">
  <sub>Built with ❤️ for movie lovers worldwide. Powered by Stremio, TMDB & Letterboxd.</sub>
</div>
