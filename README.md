# 🚀 CinePilot Studio — Personal Stremio Catalog Builder

<p align="center">
  <img src="https://image.tmdb.org/t/p/original/mDeUmq3iJ5j7H6yQn3oF1bVq3bB.jpg" alt="CinePilot Banner" width="100%" style="border-radius: 12px; max-height: 360px; object-fit: cover;" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Stremio-Addon%20v5.0.0-7a5af8?style=for-the-badge&logo=stremio&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Architecture-100%25%20Stateless-00d26a?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Cloud-Render%20%7C%20Docker-46E3B7?style=for-the-badge&logo=render&logoColor=black" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" />
</p>

---

## 🌟 Overview

**CinePilot Studio** is a modular, privacy-focused, and 100% customizable **Stremio Catalog Suite**.

Unlike static catalog addons, CinePilot allows every user to design their own personalized Stremio home screen:
* **🔥 Default Templates:** Auto-updating 100+ Weekly Trending Movies & 100+ Trending Series.
* **📋 Custom List Importer:** Paste ANY **Letterboxd** or **Trakt.tv** public list URL to convert it into a permanent Stremio catalog!
* **🎬 4K / HD Trailers:** Official YouTube studio trailers for all movies and series.
* **🔒 100% Private & Stateless:** Your custom configuration is encoded directly into your manifest URL. Zero database, zero data tracking.

---

## ⚡ Web Studio & Configurator

Build your personalized catalog layout in 30 seconds:

👉 **[Launch CinePilot Web Studio](https://cinepilot-8mg0.onrender.com/configure)**

---

## ✨ Features

### 1. 🔥 100+ Weekly Trending Engine
* Multi-page TMDB trending scraper providing 100+ freshest movies and 100+ series every week.
* 2-hour smart memory cache.

### 2. 📋 Universal Custom List Importer
* Paste any public **Letterboxd** list or **Trakt.tv** list URL.
* CinePilot resolves IMDb & TMDB metadata on the fly with rich overviews, genres, release dates, and cast.

### 3. ⭐ Bring Your Own RPDB Key (Optional)
* Users can optionally input their own **RPDB (Rating Poster DB)** API key to get IMDb, Letterboxd, and RottenTomatoes score badges on posters.
* If left blank, standard high-resolution TMDB posters are served.

### 4. 🎬 Official 4K / HD Trailers
* Restores official studio trailers directly in Stremio's stream selector.

---

## 🛠️ Tech Stack & Self-Hosting

* **Backend:** Node.js 20, Express.js
* **Scraper Engine:** Python 3 `cloudscraper`
* **Metadata Provider:** TMDB API & RPDB API
* **Cloud Platform:** Render.com (Blueprint IaC), Docker Container

### Quick Start with Docker
```bash
docker build -t cinepilot .
docker run -d -p 7050:7050 --name cinepilot-suite cinepilot
```

---

## 📄 License

Licensed under the [MIT License](LICENSE).

<p align="center">
  Crafted with ❤️ by <a href="https://github.com/cagrigoksel">Bican Çağrı Göksel</a> for the global Stremio community.
</p>
