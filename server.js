const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 7050;

const TMDB_API_KEY = 'caad8d4dace6ad77f0e22f5b746d5a20';

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

function parseConfig(configStr) {
  const defaults = {
    enableTrendingMovies: true,
    enableTrendingSeries: true,
    enableTrailers: true,
    rpdbKey: '',
    letterboxdUser: '',
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

// ONLY Pure Genres in dropdowns
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

// Poster URL Generator with User's Own RPDB Key or TMDB Fallback
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
// Manifest Builder (Modular & Dynamic)
// -------------------------------------------------------------

function getManifest(config) {
  const catalogs = [];

  // 1. Default Template: Haftalık Trend Filmler (if enabled)
  if (config.enableTrendingMovies !== false) {
    catalogs.push({
      id: 'trending_movies',
      type: 'movie',
      name: `🔥 Haftalık Trend Filmler`,
      extra: [
        { name: 'search', isRequired: false },
        { name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES },
        { name: 'skip', isRequired: false }
      ]
    });
  }

  // 2. Default Template: Haftalık Trend Diziler (if enabled)
  if (config.enableTrendingSeries !== false) {
    catalogs.push({
      id: 'trending_series',
      type: 'series',
      name: `📺 Haftalık Trend Diziler`,
      extra: [
        { name: 'search', isRequired: false },
        { name: 'genre', isRequired: false, options: PURE_SERIES_GENRES },
        { name: 'skip', isRequired: false }
      ]
    });
  }

  // 3. User Defined Custom Lists
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

  // 4. Optional Personal Letterboxd (if username provided)
  if (config.letterboxdUser && config.letterboxdUser.trim() !== '') {
    const user = config.letterboxdUser.trim();
    catalogs.push({
      id: 'my_watchlist',
      type: 'movie',
      name: `📌 İzleme Listem (${user})`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
    });
    catalogs.push({
      id: 'my_diary',
      type: 'movie',
      name: `🍿 Son İzlediklerim (${user})`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
    });
  }

  return {
    id: 'community.cinepilot.studio',
    name: 'CinePilot — Custom Cinema Suite',
    version: '5.0.0',
    description: 'Modüler ve Kişiselleştirilebilir Stremio Katalog Oluşturucu, 100+ Trendler, Özel Letterboxd/Trakt Listeleri ve 4K Fragmanlar.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: catalogs,
    idPrefixes: ['tt', 'tmdb:']
  };
}

// -------------------------------------------------------------
// TMDB & Scraper Helpers
// -------------------------------------------------------------

async function fetchTmdbDetails(tmdbId, type = 'movie') {
  const cacheKey = `tmdb_${type}_${tmdbId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${TMDB_API_KEY}&language=tr-TR&append_to_response=external_ids,videos,credits,images`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    setCache(cacheKey, data);
    return data;
  } catch (e) {
    return null;
  }
}

async function fetchTmdbVideosFallback(tmdbId, type = 'movie') {
  const cacheKey = `tmdb_videos_${type}_${tmdbId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    let url = `https://api.themoviedb.org/3/${type}/${tmdbId}/videos?api_key=${TMDB_API_KEY}&language=tr-TR`;
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

async function fetchTmdbSeasonDetails(tmdbId, seasonNum) {
  const cacheKey = `tmdb_season_${tmdbId}_${seasonNum}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=tr-TR`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    setCache(cacheKey, data, 24 * 60 * 60 * 1000);
    return data;
  } catch (e) {
    return null;
  }
}

async function findTmdbByImdb(imdbId) {
  const cacheKey = `imdb_${imdbId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id&language=tr-TR`;
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

async function searchTmdb(title, year = null, type = 'movie') {
  const cacheKey = `search_${type}_${title}_${year || ''}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  try {
    let url = `https://api.themoviedb.org/3/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=tr-TR`;
    if (year) url += `&year=${year}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results && data.results[0] ? data.results[0] : null;
    if (result) setCache(cacheKey, result);
    return result;
  } catch (e) {
    return null;
  }
}

function scrapeUniversalList(urlOrUser, mode = 'letterboxd') {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'list_scraper.py');
    const py = spawn('python3', [scriptPath, urlOrUser, mode]);

    let output = '';
    py.stdout.on('data', (d) => { output += d.toString(); });
    py.stderr.on('data', () => {});
    py.on('close', () => {
      try {
        const json = JSON.parse(output.trim());
        resolve(json);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

// Convert Scraped Film List (title, year) to Stremio Metas concurrently
async function resolveScrapedListToMetas(scrapedList, type = 'movie', rpdbKey = '') {
  const endpointType = type === 'series' ? 'tv' : 'movie';

  const promises = scrapedList.map(async (item) => {
    try {
      const searched = await searchTmdb(item.title, item.year, endpointType);
      if (searched) {
        const details = await fetchTmdbDetails(searched.id, endpointType);
        const imdbId = details?.external_ids?.imdb_id;
        const genres = extractGenres(details);
        return {
          id: imdbId || `tmdb:${searched.id}`,
          type: type,
          name: item.title,
          poster: getPosterUrl(imdbId, searched.poster_path, rpdbKey),
          description: searched.overview,
          genres: genres,
          releaseInfo: item.year || (searched.release_date || searched.first_air_date || '').split('-')[0]
        };
      }
    } catch (e) {}
    return null;
  });

  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

// Multi-page TMDB Weekly Trending Fetcher (100+ items with Genre Support)
async function fetchTrending100(type = 'movie', rpdbKey = '', genreName = null) {
  const endpointType = type === 'series' ? 'tv' : 'movie';
  const genreId = genreName && genreName !== 'Tümü' ? TMDB_GENRE_MAP[genreName] : null;

  const cacheKey = `trending_100_${type}_${genreName || 'all'}_${rpdbKey || 'no_rpdb'}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let pagePromises = [];

  if (genreId) {
    pagePromises = [1, 2, 3, 4, 5].map(p =>
      fetch(`https://api.themoviedb.org/3/discover/${endpointType}?api_key=${TMDB_API_KEY}&with_genres=${genreId}&language=tr-TR&sort_by=popularity.desc&page=${p}`)
        .then(r => r.json())
        .catch(() => ({ results: [] }))
    );
  } else {
    pagePromises = [1, 2, 3, 4, 5].map(p =>
      fetch(`https://api.themoviedb.org/3/trending/${endpointType}/week?api_key=${TMDB_API_KEY}&language=tr-TR&page=${p}`)
        .then(r => r.json())
        .catch(() => ({ results: [] }))
    );
  }

  const pages = await Promise.all(pagePromises);
  const rawItems = pages.flatMap(p => p.results || []);

  const metaPromises = rawItems.map(async (item) => {
    try {
      const details = await fetchTmdbDetails(item.id, endpointType);
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
async function searchTmdbCatalog(query, type = 'movie', rpdbKey = '') {
  const endpointType = type === 'series' ? 'tv' : 'movie';
  try {
    const url = `https://api.themoviedb.org/3/search/${endpointType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=tr-TR`;
    const res = await fetch(url).then(r => r.json());
    const metas = [];
    for (const item of (res.results || []).slice(0, 30)) {
      const details = await fetchTmdbDetails(item.id, endpointType);
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
// Routes
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
  const type = req.params.type;
  const id = req.params.id;

  let selectedGenre = null;
  let searchQuery = null;

  if (req.params.extra) {
    const raw = decodeURIComponent(req.params.extra).replace(/\.json$/, '');
    const searchMatch = raw.match(/search=([^&]+)/);
    if (searchMatch) searchQuery = searchMatch[1].trim();

    const genreMatch = raw.match(/genre=([^&]+)/);
    if (genreMatch) selectedGenre = genreMatch[1].trim();
  }

  let metas = [];

  try {
    // 0. GLOBAL SEARCH BAR HANDLER
    if (searchQuery) {
      metas = await searchTmdbCatalog(searchQuery, type, config.rpdbKey);
      return res.json({ metas });
    }

    // 1. HAFTALIK TREND FİLMLER (100+ with Genre Support)
    if (id === 'trending_movies') {
      metas = await fetchTrending100('movie', config.rpdbKey, selectedGenre);
      return res.json({ metas });
    }

    // 2. HAFTALIK TREND DİZİLER (100+ with Genre Support)
    else if (id === 'trending_series') {
      metas = await fetchTrending100('series', config.rpdbKey, selectedGenre);
      return res.json({ metas });
    }

    // 3. USER DEFINED CUSTOM LISTS (e.g. custom_0, custom_1)
    else if (id.startsWith('custom_')) {
      const idx = parseInt(id.split('_')[1], 10);
      const customList = config.customLists && config.customLists[idx];

      if (customList && customList.url) {
        const cacheKey = `custom_list_${idx}_${encodeURIComponent(customList.url)}_${config.rpdbKey || 'no_rpdb'}`;
        metas = getCache(cacheKey);

        if (!metas) {
          const scraped = await scrapeUniversalList(customList.url);
          metas = await resolveScrapedListToMetas(scraped, customList.type || type, config.rpdbKey);
          setCache(cacheKey, metas, 2 * 60 * 60 * 1000); // 2 hours cache
        }
      }
    }

    // 4. WATCHLIST (Letterboxd)
    else if (id === 'my_watchlist' && config.letterboxdUser) {
      const cacheKey = `user_wl_${config.letterboxdUser}_${config.rpdbKey || 'no_rpdb'}`;
      metas = getCache(cacheKey);
      if (!metas) {
        const scraped = await scrapeUniversalList(`https://letterboxd.com/${config.letterboxdUser}/watchlist/`);
        metas = await resolveScrapedListToMetas(scraped, 'movie', config.rpdbKey);
        setCache(cacheKey, metas, 30 * 60 * 1000);
      }
    }

    // 5. DIARY (Letterboxd)
    else if (id === 'my_diary' && config.letterboxdUser) {
      const cacheKey = `user_diary_${config.letterboxdUser}_${config.rpdbKey || 'no_rpdb'}`;
      metas = getCache(cacheKey);
      if (!metas) {
        const scraped = await scrapeUniversalList(`https://letterboxd.com/${config.letterboxdUser}/films/`);
        metas = await resolveScrapedListToMetas(scraped, 'movie', config.rpdbKey);
        setCache(cacheKey, metas, 30 * 60 * 1000);
      }
    }

    // Apply Bilingual Genre Filtering in Discover
    if (selectedGenre && selectedGenre !== 'Tümü' && metas.length > 0) {
      metas = metas.filter(item => matchesGenre(item.genres, selectedGenre));
    }

    res.json({ metas });
  } catch (err) {
    console.error('Catalog error:', err);
    res.json({ metas: [] });
  }
});

// Meta Endpoint (Rich Details + Dynamic Episode Tree with Thumbnails)
app.get(['/meta/:type/:id.json', '/:config/meta/:type/:id.json'], async (req, res) => {
  const config = parseConfig(req.params.config);
  const type = req.params.type;
  const id = req.params.id;

  try {
    let tmdbData = null;
    let tmdbIdNum = null;
    let imdbId = null;

    if (id.startsWith('tt')) {
      imdbId = id;
      const found = await findTmdbByImdb(id);
      if (found) {
        tmdbIdNum = found.id;
        tmdbData = await fetchTmdbDetails(found.id, type === 'series' ? 'tv' : 'movie');
      }
    } else if (id.startsWith('tmdb:')) {
      tmdbIdNum = id.split(':')[1];
      tmdbData = await fetchTmdbDetails(tmdbIdNum, type === 'series' ? 'tv' : 'movie');
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

    // Build interactive videos (episodes) array with authentic thumbnails
    const videos = [];
    if (type === 'series' && tmdbData.seasons && tmdbIdNum) {
      const seasonPromises = tmdbData.seasons.map(s => {
        if (s.season_number === 0) return Promise.resolve(null);
        return fetchTmdbSeasonDetails(tmdbIdNum, s.season_number);
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

// Stream Endpoint: Official 4K / HD Trailers Only (No full episode YouTube streams)
app.get(['/stream/:type/:id.json', '/:config/stream/:type/:id.json'], async (req, res) => {
  const config = parseConfig(req.params.config);
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
        const found = await findTmdbByImdb(imdbId);
        targetTmdbId = found?.id;
        if (found?.title) targetType = 'movie';
        else if (found?.name) targetType = 'tv';
      } else if (rawId.startsWith('tmdb:')) {
        targetTmdbId = rawId.split(':')[1];
      }

      if (targetTmdbId) {
        const videos = await fetchTmdbVideosFallback(targetTmdbId, targetType);
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
  console.log(`🚀 CinePilot v5.0.0 [Community Studio] running on http://127.0.0.1:${PORT}`);
  console.log(`📡 Local Network URL: http://${ip}:${PORT}`);
  console.log(`⚙️ Web Configurator: http://127.0.0.1:${PORT}/configure`);
});
