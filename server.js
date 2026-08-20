const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 7050;

const TMDB_API_KEY = process.env.TMDB_API_KEY || 'caad8d4dace6ad77f0e22f5b746d5a20';

// Load Curated Lists
const curatedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'curated_lists.json'), 'utf8'));

// Cache memory
const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCache(key) {
  const item = cache.get(key);
  if (item && item.expiresAt > Date.now()) {
    return item.data;
  }
  return null;
}

function setCache(key, data, ttl = CACHE_TTL_MS) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// CORS Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseConfig(configStr) {
  const defaults = {
    lang: 'tr',
    enableTrendingMovies: true,
    enableTrendingSeries: true,
    enableOscar: true,
    enableTop250: true,
    enableTrailers: true,
    rpdbKey: '',
    letterboxdUser: '',
    enableLbxWatchlist: true,
    enableLbxDiary: true,
    customLists: []
  };

  if (!configStr || configStr === 'manifest.json') return defaults;

  try {
    const raw = decodeURIComponent(configStr);
    let base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    return { ...defaults, ...JSON.parse(decoded) };
  } catch (e) {
    return defaults;
  }
}

// Multi-Language I18N Catalog Names & Locales
const LANG_LOCALES = {
  tr: 'tr-TR',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN'
};

const CATALOG_NAMES = {
  tr: {
    trendingMovies: '🔥 Haftalık Trend Filmler',
    trendingSeries: '📺 Haftalık Trend Diziler',
    oscar: '✨ Oscar Ödüllü Filmler',
    top250: '🏆 IMDb Top 250',
    watchlist: (u) => `📌 İzleme Listem (${u})`,
    diary: (u) => `🍿 İzlediklerim (${u})`,
    desc: 'Modüler Stremio Katalog Oluşturucu, Trendler, Oscar, Top 250, Özel Letterboxd & TMDB Listeleri ve Fragmanlar.'
  },
  en: {
    trendingMovies: '🔥 Trending Movies',
    trendingSeries: '📺 Trending Series',
    oscar: '✨ Oscar Collection',
    top250: '🏆 IMDb Top 250',
    watchlist: (u) => `📌 Watchlist (${u})`,
    diary: (u) => `🍿 Diary (${u})`,
    desc: 'Modular Stremio Catalog Builder, Trending, Oscars, Top 250, Custom Letterboxd & TMDB Lists, and 4K Trailers.'
  },
  es: {
    trendingMovies: '🔥 Películas Populares',
    trendingSeries: '📺 Series Populares',
    oscar: '✨ Colección Óscar',
    top250: '🏆 Top 250 Películas',
    watchlist: (u) => `📌 Lista de Seguimiento (${u})`,
    diary: (u) => `🍿 Películas Vistas (${u})`,
    desc: 'Creador modular de catálogos de Stremio, tendencias, listas personalizadas y tráilers en 4K.'
  },
  de: {
    trendingMovies: '🔥 Beliebte Filme',
    trendingSeries: '📺 Beliebte Serien',
    oscar: '✨ Oscar-Gewinner',
    top250: '🏆 Top 250 Filme',
    watchlist: (u) => `📌 Merkliste (${u})`,
    diary: (u) => `🍿 Gesehene Filme (${u})`,
    desc: 'Modularer Stremio Katalog-Builder mit Trends, Oscar-Gewinnern und 4K-Trailern.'
  },
  fr: {
    trendingMovies: '🔥 Films Tendances',
    trendingSeries: '📺 Séries Tendances',
    oscar: '✨ Collection Oscars',
    top250: '🏆 Top 250 Films',
    watchlist: (u) => `📌 Liste à voir (${u})`,
    diary: (u) => `🍿 Films vus (${u})`,
    desc: 'Générateur modulaire de catalogues Stremio avec tendances, Oscars et bandes-annonces 4K.'
  },
  it: {
    trendingMovies: '🔥 Film di Tendenza',
    trendingSeries: '📺 Serie di Tendenza',
    oscar: '✨ Collezione Oscar',
    top250: '🏆 Top 250 Film',
    watchlist: (u) => `📌 Watchlist (${u})`,
    diary: (u) => `🍿 Film Visti (${u})`,
    desc: 'Creatore modulare di cataloghi Stremio con tendenze, Oscar e trailer in 4K.'
  },
  ja: {
    trendingMovies: '🔥 トレンド映画',
    trendingSeries: '📺 トレンドドラマ',
    oscar: '✨ アカデミー賞受賞作',
    top250: '🏆 歴代映画トップ250',
    watchlist: (u) => `📌 ウォッチリスト (${u})`,
    diary: (u) => `🍿 視聴履歴 (${u})`,
    desc: 'Stremio向けモジュール式カタログビルダー。'
  },
  ko: {
    trendingMovies: '🔥 주간 인기 영화',
    trendingSeries: '📺 주간 인기 시리즈',
    oscar: '✨ 오스카 수상작 컬렉션',
    top250: '🏆 역대 영화 Top 250',
    watchlist: (u) => `📌 보고 싶은 영화 (${u})`,
    diary: (u) => `🍿 시청한 영화 (${u})`,
    desc: 'Stremio 맞춤형 카탈로그 빌더.'
  },
  zh: {
    trendingMovies: '🔥 每周热门电影',
    trendingSeries: '📺 每周热门剧集',
    oscar: '✨ 奥斯卡获奖作品',
    top250: '🏆 经典电影 Top 250',
    watchlist: (u) => `📌 待看清单 (${u})`,
    diary: (u) => `🍿 观影记录 (${u})`,
    desc: 'Stremio 模块化片单构建器。'
  }
};

// Pure Genres
const PURE_MOVIE_GENRES = [
  "Tümü",
  "Aksiyon",
  "Bilim Kurgu",
  "Dram",
  "Gerilim",
  "Komedi",
  "Korku",
  "Romantik",
  "Suç",
  "Macera",
  "Gizem",
  "Animasyon",
  "Belgesel"
];

const PURE_SERIES_GENRES = [
  "Tümü",
  "Dram",
  "Romantik",
  "Suç & Gizem",
  "Bilim Kurgu & Fantastik",
  "Komedi",
  "Aksiyon & Macera",
  "Animasyon & Anime",
  "Belgesel"
];

const TMDB_GENRE_MAP = {
  'Aksiyon': 28,
  'Macera': 12,
  'Animasyon': 16,
  'Komedi': 35,
  'Suç': 80,
  'Belgesel': 99,
  'Dram': 18,
  'Korku': 27,
  'Gizem': 9648,
  'Romantik': 10749,
  'Bilim Kurgu': 878,
  'Gerilim': 53,
  'Suç & Gizem': 80,
  'Bilim Kurgu & Fantastik': 10765,
  'Aksiyon & Macera': 10759,
  'Animasyon & Anime': 16
};

const TMDB_ID_TO_NAME = {
  28: 'Aksiyon',
  12: 'Macera',
  16: 'Animasyon',
  35: 'Komedi',
  80: 'Suç',
  99: 'Belgesel',
  18: 'Dram',
  10751: 'Aile',
  14: 'Fantastik',
  36: 'Tarih',
  27: 'Korku',
  10402: 'Müzik',
  9648: 'Gizem',
  10749: 'Romantik',
  878: 'Bilim Kurgu',
  10770: 'TV Film',
  53: 'Gerilim',
  10752: 'Savaş',
  37: 'Vahşi Batı',
  10759: 'Aksiyon & Macera',
  10762: 'Çocuk',
  10763: 'Haber',
  10764: 'Reality',
  10765: 'Bilim Kurgu & Fantastik',
  10766: 'Pembe Dizi',
  10767: 'Talk',
  10768: 'Savaş & Politik'
};

const GENRE_SYNONYMS = {
  'Aksiyon': ['action', 'aksiyon', 'macera', 'adventure', 'dövüş'],
  'Bilim Kurgu': ['sci-fi', 'science fiction', 'bilim kurgu', 'bilim-kurgu', 'fantastik', 'fantasy'],
  'Dram': ['drama', 'dram'],
  'Gerilim': ['thriller', 'gerilim', 'gizem', 'mystery', 'suspense'],
  'Komedi': ['comedy', 'komedi'],
  'Korku': ['horror', 'korku'],
  'Romantik': ['romance', 'romantik', 'romantic', 'aşk'],
  'Suç': ['crime', 'suç', 'polisiye', 'gangster', 'mafya'],
  'Macera': ['adventure', 'macera', 'action', 'aksiyon'],
  'Gizem': ['mystery', 'gizem', 'dedektif'],
  'Animasyon': ['animation', 'animasyon', 'anime', 'çizgi'],
  'Belgesel': ['documentary', 'belgesel']
};

function extractGenres(obj) {
  if (!obj) return [];
  if (obj.genres && Array.isArray(obj.genres)) {
    return obj.genres.map(g => (typeof g === 'string' ? g : g.name));
  }
  if (obj.genre_ids && Array.isArray(obj.genre_ids)) {
    return obj.genre_ids.map(id => TMDB_ID_TO_NAME[id]).filter(Boolean);
  }
  return [];
}

function matchesGenre(itemGenres, selectedGenre) {
  if (!selectedGenre || selectedGenre === 'Tümü') return true;
  if (!itemGenres || itemGenres.length === 0) return false;
  const synonyms = GENRE_SYNONYMS[selectedGenre] || [selectedGenre.toLowerCase()];
  return itemGenres.some(g => {
    const gl = g.toLowerCase();
    return synonyms.some(syn => gl.includes(syn) || syn.includes(gl));
  });
}

function getPosterUrl(imdbId, tmdbPosterPath, rpdbKey = '') {
  if (rpdbKey && rpdbKey.trim() !== '' && imdbId && imdbId.startsWith('tt')) {
    return `https://api.ratingposterdb.com/${rpdbKey.trim()}/imdb/poster-default/${imdbId}.jpg`;
  }
  if (tmdbPosterPath) {
    return `https://image.tmdb.org/t/p/w500${tmdbPosterPath}`;
  }
  return 'https://images.metahub.space/poster/medium/no_poster.png';
}

// -------------------------------------------------------------
// Pure Node.js Multi-Page Letterboxd Scraper (Powered by got-scraping)
// -------------------------------------------------------------

async function scrapeLetterboxdNode(targetUrl, maxPages = 20) {
  const { gotScraping } = await import('got-scraping');
  const allFilms = [];
  const seen = new Set();
  const cleanUrl = targetUrl.replace(/\/+$/, '');

  for (let page = 1; page <= maxPages; page++) {
    const pageUrl = page === 1 ? cleanUrl + '/' : cleanUrl + '/page/' + page + '/';
    let res = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await gotScraping(pageUrl);
        if (res.statusCode === 200) break;
      } catch (e) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    if (!res || res.statusCode !== 200) break;

    const matches = [...res.body.matchAll(/data-item-name=\"([^\"]+)\"/g)].map(x => x[1]);
    if (matches.length === 0) {
      const altMatches = [...res.body.matchAll(/class=\"[^\"]*film-poster[^\"]*\"[^>]*alt=\"([^\"]+)\"/g)].map(x => x[1]);
      if (altMatches.length > 0) {
        for (const raw of altMatches) {
          if (seen.has(raw)) continue;
          seen.add(raw);
          const ym = raw.match(/\((\d{4})\)$/);
          const year = ym ? ym[1] : null;
          const title = decodeHtmlEntities(raw.replace(/\s*\(\d{4}\)$/, '').trim());
          if (title) allFilms.push({ title, year });
        }
      }
      break;
    }

    for (const raw of matches) {
      if (seen.has(raw)) continue;
      seen.add(raw);
      const ym = raw.match(/\((\d{4})\)$/);
      const year = ym ? ym[1] : null;
      const title = decodeHtmlEntities(raw.replace(/\s*\(\d{4}\)$/, '').trim());
      if (title) allFilms.push({ title, year });
    }
  }

  return allFilms;
}

async function scrapeUniversalList(urlOrUser, langLocale = 'tr-TR') {
  const target = urlOrUser.trim();

  // 1. TMDB Platform Resolution
  if (target.includes('themoviedb.org')) {
    const listMatch = target.match(/\/list\/(\d+)/);
    const collectionMatch = target.match(/\/collection\/(\d+)/);

    if (listMatch) {
      const listId = listMatch[1];
      try {
        const res = await fetch(`https://api.themoviedb.org/3/list/${listId}?api_key=${TMDB_API_KEY}&language=${langLocale}`).then(r => r.json());
        if (res.items && Array.isArray(res.items)) {
          return res.items.map(i => ({
            title: decodeHtmlEntities(i.title || i.name),
            year: (i.release_date || i.first_air_date || '').split('-')[0],
            tmdbId: i.id,
            type: i.media_type || (i.title ? 'movie' : 'series')
          }));
        }
      } catch (e) {}
    } else if (collectionMatch) {
      const colId = collectionMatch[1];
      try {
        const res = await fetch(`https://api.themoviedb.org/3/collection/${colId}?api_key=${TMDB_API_KEY}&language=${langLocale}`).then(r => r.json());
        if (res.parts && Array.isArray(res.parts)) {
          return res.parts.map(i => ({
            title: decodeHtmlEntities(i.title),
            year: (i.release_date || '').split('-')[0],
            tmdbId: i.id,
            type: 'movie'
          }));
        }
      } catch (e) {}
    }
    return [];
  }

  // 2. Primary Scraper: Pure Node.js with got-scraping (Bypasses Cloudflare on all pages)
  let targetUrl = target;
  if (!target.startsWith('http')) {
    targetUrl = `https://letterboxd.com/${target}/watchlist/`;
  }

  try {
    const results = await scrapeLetterboxdNode(targetUrl, 20);
    if (results && results.length > 0) {
      return results;
    }
  } catch (e) {
    console.error('Scrape error:', e.message);
  }

  return [];
}

// -------------------------------------------------------------
// Manifest Builder
// -------------------------------------------------------------

function getManifest(config) {
  const lang = config.lang && CATALOG_NAMES[config.lang] ? config.lang : 'tr';
  const t = CATALOG_NAMES[lang];
  const catalogs = [];

  // 1. Haftalık Trend Filmler
  if (config.enableTrendingMovies !== false) {
    catalogs.push({
      id: 'trending_movies',
      type: 'movie',
      name: t.trendingMovies,
      extra: [
        { name: 'search', isRequired: false },
        { name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES },
        { name: 'skip', isRequired: false }
      ]
    });
  }

  // 2. Haftalık Trend Diziler
  if (config.enableTrendingSeries !== false) {
    catalogs.push({
      id: 'trending_series',
      type: 'series',
      name: t.trendingSeries,
      extra: [
        { name: 'search', isRequired: false },
        { name: 'genre', isRequired: false, options: PURE_SERIES_GENRES },
        { name: 'skip', isRequired: false }
      ]
    });
  }

  // 3. Oscar Ödüllü Filmler
  if (config.enableOscar !== false) {
    catalogs.push({
      id: 'oscar_collection',
      type: 'movie',
      name: t.oscar,
      extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
    });
  }

  // 4. IMDb Top 250
  if (config.enableTop250 !== false) {
    catalogs.push({
      id: 'top250_collection',
      type: 'movie',
      name: t.top250,
      extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
    });
  }

  // 5. User Defined Custom Lists (Letterboxd / TMDB)
  if (Array.isArray(config.customLists)) {
    config.customLists.forEach((list, idx) => {
      const type = list.type === 'series' ? 'series' : 'movie';
      const genreOptions = type === 'series' ? PURE_SERIES_GENRES : PURE_MOVIE_GENRES;
      catalogs.push({
        id: `custom_${idx}`,
        type: type,
        name: list.name || `📋 Özel Liste ${idx + 1}`,
        extra: [
          { name: 'genre', isRequired: false, options: genreOptions },
          { name: 'skip', isRequired: false }
        ]
      });
    });
  }

  // 6. Letterboxd Watchlist & Diary
  if (config.letterboxdUser && config.letterboxdUser.trim() !== '') {
    const user = config.letterboxdUser.trim();
    if (config.enableLbxWatchlist !== false) {
      catalogs.push({
        id: 'my_watchlist',
        type: 'movie',
        name: t.watchlist(user),
        extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
      });
    }
    if (config.enableLbxDiary !== false) {
      catalogs.push({
        id: 'my_diary',
        type: 'movie',
        name: t.diary(user),
        extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
      });
    }
  }

  return {
    id: 'community.cinepilot.studio',
    name: 'CinePilot Studio',
    version: '6.1.0',
    description: t.desc,
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: catalogs,
    idPrefixes: ['tt', 'tmdb:']
  };
}

// -------------------------------------------------------------
// TMDB & Smart Search Helpers (Multi-Language Supported)
// -------------------------------------------------------------

async function fetchTmdbDetails(tmdbId, type = 'movie', langLocale = 'tr-TR') {
  const cacheKey = `tmdb_${type}_${tmdbId}_${langLocale}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=${langLocale}&append_to_response=external_ids,videos,credits,images`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    setCache(cacheKey, data);
    return data;
  } catch (e) {
    return null;
  }
}

async function fetchTmdbVideosFallback(tmdbId, type = 'movie', langLocale = 'tr-TR') {
  const cacheKey = `tmdb_videos_${type}_${tmdbId}_${langLocale}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    let url = `https://api.themoviedb.org/3/${type}/${tmdbId}/videos?api_key=${TMDB_API_KEY}&language=${langLocale}`;
    let res = await fetch(url).then(r => r.json());
    let results = res.results || [];

    if (results.length === 0) {
      url = `https://api.themoviedb.org/3/${type}/${tmdbId}/videos?api_key=${TMDB_API_KEY}&language=en-US`;
      res = await fetch(url).then(r => r.json());
      results = res.results || [];
    }

    setCache(cacheKey, results, 24 * 60 * 60 * 1000);
    return results;
  } catch (e) {
    return [];
  }
}

async function fetchTmdbSeasonDetails(tmdbId, seasonNum, langLocale = 'tr-TR') {
  const cacheKey = `tmdb_season_${tmdbId}_${seasonNum}_${langLocale}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=${langLocale}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    setCache(cacheKey, data, 24 * 60 * 60 * 1000);
    return data;
  } catch (e) {
    return null;
  }
}

async function findTmdbByImdb(imdbId, langLocale = 'tr-TR') {
  const cacheKey = `imdb_${imdbId}_${langLocale}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=${langLocale}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const movie = data.movie_results?.[0];
    const series = data.tv_results?.[0];
    const result = movie ? { ...movie, type: 'movie' } : (series ? { ...series, type: 'series' } : null);
    if (result) setCache(cacheKey, result);
    return result;
  } catch (e) {
    return null;
  }
}

// Smart TMDB Search with Multi-Search & Year Flexibility
async function smartSearchTmdb(title, year = null, preferredType = 'movie', langLocale = 'tr-TR') {
  const cleanTitle = decodeHtmlEntities(title).trim();
  const cacheKey = `smart_search_${preferredType}_${cleanTitle}_${year || ''}_${langLocale}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const endpoint = preferredType === 'series' ? 'tv' : 'movie';

    // 1. Try search with preferred type and year
    let url = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=${langLocale}`;
    if (year && endpoint === 'movie') url += `&year=${year}`;
    if (year && endpoint === 'tv') url += `&first_air_date_year=${year}`;

    let res = await fetch(url).then(r => r.json()).catch(() => ({}));
    if (res.results && res.results.length > 0) {
      const match = { ...res.results[0], detectedType: endpoint };
      setCache(cacheKey, match);
      return match;
    }

    // 2. Try search with preferred type WITHOUT year
    url = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=${langLocale}`;
    res = await fetch(url).then(r => r.json()).catch(() => ({}));
    if (res.results && res.results.length > 0) {
      const match = { ...res.results[0], detectedType: endpoint };
      setCache(cacheKey, match);
      return match;
    }

    // 3. Multi-Search Fallback (Finds TV series in movie lists & vice-versa)
    url = `https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=${langLocale}`;
    res = await fetch(url).then(r => r.json()).catch(() => ({}));
    const multiMatch = res.results?.find(r => r.media_type === 'movie' || r.media_type === 'tv');
    if (multiMatch) {
      const match = { ...multiMatch, detectedType: multiMatch.media_type };
      setCache(cacheKey, match);
      return match;
    }
  } catch (e) {}

  return null;
}

// Convert Scraped List to Metas with Batch Chunking (Zero Missing Films)
async function resolveScrapedListToMetas(scrapedList, type = 'movie', rpdbKey = '', langLocale = 'tr-TR') {
  const chunkSize = 25;
  const allMetas = [];

  for (let i = 0; i < scrapedList.length; i += chunkSize) {
    const chunk = scrapedList.slice(i, i + chunkSize);
    const chunkPromises = chunk.map(async (item) => {
      try {
        let details = null;
        let searchedId = item.tmdbId;
        let actualType = item.type || type;

        if (searchedId) {
          details = await fetchTmdbDetails(searchedId, actualType === 'series' ? 'tv' : 'movie', langLocale);
        } else {
          const searched = await smartSearchTmdb(item.title, item.year, type, langLocale);
          if (searched) {
            searchedId = searched.id;
            actualType = searched.detectedType === 'tv' ? 'series' : 'movie';
            details = await fetchTmdbDetails(searched.id, searched.detectedType, langLocale);
          }
        }

        if (details) {
          const imdbId = details?.external_ids?.imdb_id;
          const genres = extractGenres(details);
          return {
            id: imdbId || `tmdb:${details.id}`,
            type: actualType,
            name: details.title || details.name || item.title,
            poster: getPosterUrl(imdbId, details.poster_path, rpdbKey),
            description: details.overview,
            genres: genres,
            releaseInfo: item.year || (details.release_date || details.first_air_date || '').split('-')[0]
          };
        }
      } catch (e) {}
      return null;
    });

    const chunkResults = await Promise.all(chunkPromises);
    allMetas.push(...chunkResults.filter(Boolean));
  }

  return allMetas;
}

// Convert Curated IMDb ID List to Metas concurrently
async function resolveImdbList(imdbIds, type = 'movie', rpdbKey = '', langLocale = 'tr-TR') {
  const promises = imdbIds.map(async (imdbId) => {
    try {
      let found = null;
      if (imdbId.startsWith('tmdb:')) {
        const tmdbId = imdbId.split(':')[1];
        found = await fetchTmdbDetails(tmdbId, type === 'series' ? 'tv' : 'movie', langLocale);
      } else {
        found = await findTmdbByImdb(imdbId, langLocale);
      }
      if (found) {
        const genres = extractGenres(found);
        return {
          id: imdbId,
          type: type,
          name: found.title || found.name,
          poster: getPosterUrl(imdbId, found.poster_path, rpdbKey),
          description: found.overview,
          genres: genres,
          releaseInfo: (found.release_date || found.first_air_date || '').split('-')[0]
        };
      }
    } catch (e) {}
    return null;
  });

  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

// Multi-page TMDB Weekly Trending Fetcher
async function fetchTrending100(type = 'movie', rpdbKey = '', genreName = null, langLocale = 'tr-TR') {
  const endpointType = type === 'series' ? 'tv' : 'movie';
  const genreId = genreName && genreName !== 'Tümü' ? TMDB_GENRE_MAP[genreName] : null;

  const cacheKey = `trending_100_${type}_${genreName || 'all'}_${rpdbKey || 'no_rpdb'}_${langLocale}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let pagePromises = [];

  if (genreId) {
    pagePromises = [1, 2, 3, 4, 5].map(p =>
      fetch(`https://api.themoviedb.org/3/discover/${endpointType}?api_key=${TMDB_API_KEY}&with_genres=${genreId}&language=${langLocale}&sort_by=popularity.desc&page=${p}`)
        .then(r => r.json())
        .catch(() => ({ results: [] }))
    );
  } else {
    pagePromises = [1, 2, 3, 4, 5].map(p =>
      fetch(`https://api.themoviedb.org/3/trending/${endpointType}/week?api_key=${TMDB_API_KEY}&language=${langLocale}&page=${p}`)
        .then(r => r.json())
        .catch(() => ({ results: [] }))
    );
  }

  const pages = await Promise.all(pagePromises);
  const rawItems = pages.flatMap(p => p.results || []);

  const metaPromises = rawItems.map(async (item) => {
    try {
      const details = await fetchTmdbDetails(item.id, endpointType, langLocale);
      const imdbId = details?.external_ids?.imdb_id;
      return {
        id: imdbId || `tmdb:${item.id}`,
        type: type,
        name: item.title || item.name,
        poster: getPosterUrl(imdbId, item.poster_path, rpdbKey),
        description: item.overview,
        genres: extractGenres(details),
        releaseInfo: (item.release_date || item.first_air_date || '').split('-')[0]
      };
    } catch (e) {
      return null;
    }
  });

  const metas = (await Promise.all(metaPromises)).filter(Boolean);
  setCache(cacheKey, metas, 2 * 60 * 60 * 1000);
  return metas;
}

// Search TMDB directly for User Search Queries
async function searchTmdbCatalog(query, type = 'movie', rpdbKey = '', langLocale = 'tr-TR') {
  const endpointType = type === 'series' ? 'tv' : 'movie';
  try {
    const url = `https://api.themoviedb.org/3/search/${endpointType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=${langLocale}`;
    const res = await fetch(url).then(r => r.json());
    const metas = [];
    for (const item of (res.results || []).slice(0, 30)) {
      const details = await fetchTmdbDetails(item.id, endpointType, langLocale);
      const imdbId = details?.external_ids?.imdb_id;
      metas.push({
        id: imdbId || `tmdb:${item.id}`,
        type: type,
        name: item.title || item.name,
        poster: getPosterUrl(imdbId, item.poster_path, rpdbKey),
        description: item.overview,
        genres: extractGenres(details),
        releaseInfo: (item.release_date || item.first_air_date || '').split('-')[0]
      });
    }
    return metas;
  } catch (e) {
    return [];
  }
}

// -------------------------------------------------------------
// Live Validation API Endpoints
// -------------------------------------------------------------

app.get('/api/validate-list', async (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith('http')) {
    return res.json({ valid: false, error: 'Lütfen geçerli bir HTTP/HTTPS liste bağlantısı girin.' });
  }

  try {
    const items = await scrapeUniversalList(url);
    if (items.length > 0) {
      return res.json({ valid: true, count: items.length, sample: items.slice(0, 3).map(i => i.title) });
    } else {
      return res.json({ valid: false, error: 'Bu bağlantıdan liste verisi çekilemedi. Bağlantının herkese açık bir Letterboxd veya TMDB listesi olduğundan emin olun.' });
    }
  } catch (err) {
    return res.json({ valid: false, error: 'Liste kontrol edilirken hata: ' + err.message });
  }
});

app.get('/api/validate-user', async (req, res) => {
  const { platform, username } = req.query;
  if (!username || !/^[a-zA-Z0-9_-]+$/.test(username)) {
    return res.json({ valid: false, error: 'Geçersiz kullanıcı adı formatı.' });
  }

  if (platform === 'letterboxd') {
    try {
      const resp = await fetch(`https://letterboxd.com/${username}/`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (resp.ok) return res.json({ valid: true });
      return res.json({ valid: false, error: 'Letterboxd profili bulunamadı (404).' });
    } catch (e) {
      return res.json({ valid: true });
    }
  }

  res.json({ valid: true });
});

// -------------------------------------------------------------
// Core Stremio Routes
// -------------------------------------------------------------

app.get(['/', '/configure'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/manifest.json', '/:config/manifest.json'], (req, res) => {
  const config = parseConfig(req.params.config);
  res.json(getManifest(config));
});

// Catalog Handler
app.get([
  '/catalog/:type/:id.json',
  '/catalog/:type/:id/:extra.json',
  '/:config/catalog/:type/:id.json',
  '/:config/catalog/:type/:id/:extra.json'
], async (req, res) => {
  const config = parseConfig(req.params.config);
  const langLocale = LANG_LOCALES[config.lang] || 'tr-TR';
  const type = req.params.type;
  const id = req.params.id;

  let selectedGenre = null;
  let searchQuery = null;
  let skip = 0;

  if (req.params.extra) {
    const raw = decodeURIComponent(req.params.extra).replace(/\.json$/, '');
    const searchMatch = raw.match(/search=([^&]+)/);
    if (searchMatch) searchQuery = searchMatch[1].trim();

    const genreMatch = raw.match(/genre=([^&]+)/);
    if (genreMatch) selectedGenre = genreMatch[1].trim();

    const skipMatch = raw.match(/skip=(\d+)/);
    if (skipMatch) skip = parseInt(skipMatch[1], 10);
  }

  let metas = [];

  try {
    // 0. GLOBAL SEARCH BAR HANDLER
    if (searchQuery) {
      metas = await searchTmdbCatalog(searchQuery, type, config.rpdbKey, langLocale);
      return res.json({ metas });
    }

    // 1. HAFTALIK TREND FİLMLER
    if (id === 'trending_movies') {
      metas = await fetchTrending100('movie', config.rpdbKey, selectedGenre, langLocale);
      return res.json({ metas });
    }

    // 2. HAFTALIK TREND DİZİLER
    else if (id === 'trending_series') {
      metas = await fetchTrending100('series', config.rpdbKey, selectedGenre, langLocale);
      return res.json({ metas });
    }

    // 3. OSCAR ÖDÜLLÜ FİLMLER (~96)
    else if (id === 'oscar_collection') {
      const cacheKey = `full_oscar_v20_${config.rpdbKey || 'no_rpdb'}_${langLocale}`;
      metas = getCache(cacheKey);
      if (!metas) {
        metas = await resolveImdbList(curatedData.oscar, 'movie', config.rpdbKey, langLocale);
        setCache(cacheKey, metas, 24 * 60 * 60 * 1000);
      }
    }

    // 4. TOP 250 MOVIES (~98)
    else if (id === 'top250_collection') {
      const cacheKey = `full_top250_v20_${config.rpdbKey || 'no_rpdb'}_${langLocale}`;
      metas = getCache(cacheKey);
      if (!metas) {
        metas = await resolveImdbList(curatedData.top250, 'movie', config.rpdbKey, langLocale);
        setCache(cacheKey, metas, 24 * 60 * 60 * 1000);
      }
    }

    // 5. USER DEFINED CUSTOM LISTS (Letterboxd / TMDB)
    else if (id.startsWith('custom_')) {
      const idx = parseInt(id.split('_')[1], 10);
      const customList = config.customLists && config.customLists[idx];

      if (customList && customList.url) {
        const cacheKey = `custom_list_v20_${idx}_${encodeURIComponent(customList.url)}_${config.rpdbKey || 'no_rpdb'}_${langLocale}`;
        metas = getCache(cacheKey);

        if (!metas) {
          const scraped = await scrapeUniversalList(customList.url, langLocale);
          metas = await resolveScrapedListToMetas(scraped, customList.type || type, config.rpdbKey, langLocale);
          setCache(cacheKey, metas, 2 * 60 * 60 * 1000); // 2 hours cache
        }
      }
    }

    // 6. WATCHLIST (Letterboxd)
    else if (id === 'my_watchlist' && config.letterboxdUser) {
      const cacheKey = `user_wl_v30_${config.letterboxdUser}_${config.rpdbKey || 'no_rpdb'}_${langLocale}`;
      metas = getCache(cacheKey);
      if (!metas) {
        const scraped = await scrapeUniversalList(`https://letterboxd.com/${config.letterboxdUser}/watchlist/`, langLocale);
        metas = await resolveScrapedListToMetas(scraped, 'movie', config.rpdbKey, langLocale);
        setCache(cacheKey, metas, 60 * 60 * 1000);
      }
    }

    // 7. DIARY (Letterboxd)
    else if (id === 'my_diary' && config.letterboxdUser) {
      const cacheKey = `user_diary_v30_${config.letterboxdUser}_${config.rpdbKey || 'no_rpdb'}_${langLocale}`;
      metas = getCache(cacheKey);
      if (!metas) {
        const scraped = await scrapeUniversalList(`https://letterboxd.com/${config.letterboxdUser}/films/`, langLocale);
        metas = await resolveScrapedListToMetas(scraped, 'movie', config.rpdbKey, langLocale);
        setCache(cacheKey, metas, 60 * 60 * 1000);
      }
    }

    // Apply Bilingual Genre Filtering in Discover
    if (selectedGenre && selectedGenre !== 'Tümü' && metas.length > 0) {
      metas = metas.filter(item => matchesGenre(item.genres, selectedGenre));
    }

    // Handle skip pagination if requested by Stremio
    if (skip > 0 && metas.length > 0) {
      metas = metas.slice(skip);
    }

    res.json({ metas });
  } catch (err) {
    console.error('Catalog error:', err);
    res.json({ metas: [] });
  }
});

// Meta Endpoint
app.get(['/meta/:type/:id.json', '/:config/meta/:type/:id.json'], async (req, res) => {
  const config = parseConfig(req.params.config);
  const langLocale = LANG_LOCALES[config.lang] || 'tr-TR';
  const type = req.params.type;
  const id = req.params.id;

  try {
    let tmdbData = null;
    let tmdbIdNum = null;
    let imdbId = null;

    if (id.startsWith('tt')) {
      imdbId = id;
      const found = await findTmdbByImdb(id, langLocale);
      if (found) {
        tmdbIdNum = found.id;
        tmdbData = await fetchTmdbDetails(found.id, type === 'series' ? 'tv' : 'movie', langLocale);
      }
    } else if (id.startsWith('tmdb:')) {
      tmdbIdNum = id.split(':')[1];
      tmdbData = await fetchTmdbDetails(tmdbIdNum, type === 'series' ? 'tv' : 'movie', langLocale);
      imdbId = tmdbData?.external_ids?.imdb_id;
    }

    if (!tmdbData) return res.json({ meta: null });

    const title = tmdbData.title || tmdbData.name;
    const releaseYear = (tmdbData.release_date || tmdbData.first_air_date || '').split('-')[0];
    const poster = getPosterUrl(imdbId, tmdbData.poster_path, config.rpdbKey);
    const background = tmdbData.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}` : undefined;

    const genres = extractGenres(tmdbData);
    const cast = (tmdbData.credits?.cast || []).slice(0, 5).map(c => c.name);
    const director = (tmdbData.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name);

    // Build interactive videos (episodes) array
    const videos = [];
    if (type === 'series' && tmdbData.seasons && tmdbIdNum) {
      const seasonPromises = tmdbData.seasons.map(s => {
        if (s.season_number === 0) return Promise.resolve(null);
        return fetchTmdbSeasonDetails(tmdbIdNum, s.season_number, langLocale);
      });

      const seasonsDetails = await Promise.all(seasonPromises);

      for (let i = 0; i < tmdbData.seasons.length; i++) {
        const s = tmdbData.seasons[i];
        if (s.season_number === 0) continue;

        const sData = seasonsDetails[i];
        if (sData && sData.episodes && sData.episodes.length > 0) {
          for (const ep of sData.episodes) {
            videos.push({
              id: `${id}:${s.season_number}:${ep.episode_number}`,
              title: ep.name ? `${ep.episode_number}. ${ep.name}` : `${ep.episode_number}. Bölüm`,
              name: ep.name || `${ep.episode_number}. Bölüm`,
              season: s.season_number,
              episode: ep.episode_number,
              number: ep.episode_number,
              thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : poster,
              overview: ep.overview || '',
              released: ep.air_date ? new Date(ep.air_date).toISOString() : undefined
            });
          }
        } else {
          const count = s.episode_count || 1;
          for (let ep = 1; ep <= count; ep++) {
            videos.push({
              id: `${id}:${s.season_number}:${ep}`,
              title: `${ep}. Bölüm`,
              name: `${ep}. Bölüm`,
              season: s.season_number,
              episode: ep,
              number: ep,
              thumbnail: poster
            });
          }
        }
      }
    }

    res.json({
      meta: {
        id: id,
        type: type,
        name: title,
        genres: genres,
        poster: poster,
        background: background,
        description: tmdbData.overview || 'Açıklama bulunamadı.',
        releaseInfo: releaseYear,
        imdbRating: tmdbData.vote_average ? tmdbData.vote_average.toFixed(1) : undefined,
        runtime: tmdbData.runtime ? `${tmdbData.runtime} dk` : undefined,
        cast: cast,
        director: director,
        videos: videos.length > 0 ? videos : undefined
      }
    });
  } catch (e) {
    res.json({ meta: null });
  }
});

// Stream Endpoint: Official 4K / HD Trailers Only
app.get(['/stream/:type/:id.json', '/:config/stream/:type/:id.json'], async (req, res) => {
  const config = parseConfig(req.params.config);
  const langLocale = LANG_LOCALES[config.lang] || 'tr-TR';
  const type = req.params.type;
  const rawId = req.params.id;

  try {
    const streams = [];

    // Official 4K / HD Trailers
    if (config.enableTrailers !== false) {
      let targetTmdbId = null;
      let targetType = type === 'series' ? 'tv' : 'movie';

      if (rawId.startsWith('tt')) {
        const imdbId = rawId.split(':')[0];
        const found = await findTmdbByImdb(imdbId, langLocale);
        targetTmdbId = found?.id;
        if (found?.title) targetType = 'movie';
        else if (found?.name) targetType = 'tv';
      } else if (rawId.startsWith('tmdb:')) {
        targetTmdbId = rawId.split(':')[1];
      }

      if (targetTmdbId) {
        const videos = await fetchTmdbVideosFallback(targetTmdbId, targetType, langLocale);
        const trailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')) || videos[0];

        if (trailer && trailer.site === 'YouTube' && trailer.key) {
          streams.push({
            name: "🎬 [RESMİ FRAGMAN]",
            title: `🎬 Resmi Fragman (${trailer.name || 'HD / 4K'})\nYouTube`,
            ytId: trailer.key
          });
        }
      }
    }

    res.json({ streams });
  } catch (e) {
    res.json({ streams: [] });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIp();
  console.log(`🚀 CinePilot Studio v6.0.0 [Pure Node.js High-Speed Engine] running on http://127.0.0.1:${PORT}`);
  console.log(`📡 Local Network URL: http://${ip}:${PORT}`);
  console.log(`⚙️ Web Configurator: http://127.0.0.1:${PORT}/configure`);
});
