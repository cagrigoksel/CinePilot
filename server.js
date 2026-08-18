const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');
const https = require('https');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 7050;

const TMDB_API_KEY = 'caad8d4dace6ad77f0e22f5b746d5a20';
const RPDB_KEY = 't0-free-rpdb';

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

function parseConfig(configStr) {
  const defaults = {
    letterboxdUser: 'cagrigoksel',
    useRpdb: true,
    enableTrailers: true
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

// ONLY Pure Genres in 3rd dropdown
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

// Manifest with Pure Free TV Series & Search Support
function getManifest(config) {
  const user = config.letterboxdUser || 'cagrigoksel';

  const catalogs = [
    // 1. Haftalık Trend Filmler
    {
      id: 'trending_movies',
      type: 'movie',
      name: `🔥 Haftalık Trend Filmler`,
      extra: [
        { name: 'search', isRequired: false },
        { name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES },
        { name: 'skip', isRequired: false }
      ]
    },
    // 2. Haftalık Trend Diziler
    {
      id: 'trending_series',
      type: 'series',
      name: `📺 Haftalık Trend Diziler`,
      extra: [
        { name: 'search', isRequired: false },
        { name: 'genre', isRequired: false, options: PURE_SERIES_GENRES },
        { name: 'skip', isRequired: false }
      ]
    },
    // 3. Oscar Ödüllü & Aday Filmler (~96)
    {
      id: 'oscar_collection',
      type: 'movie',
      name: `✨ Oscar Ödüllü & Aday Filmler`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
    },
    // 4. IMDb & Letterboxd Top 250 (~98)
    {
      id: 'top250_collection',
      type: 'movie',
      name: `🏆 IMDb & Letterboxd Top 250`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
    },
    // 5. Tüm Zamanların En İyi 100 TV Dizisi (~88)
    {
      id: 'rolling_stone_series',
      type: 'series',
      name: `🎸 Tüm Zamanların En İyi 100 TV Dizisi`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_SERIES_GENRES }, { name: 'skip', isRequired: false }]
    },
    // 6. Popüler Kore Dizileri (K-Drama) (~97)
    {
      id: 'kdrama_series',
      type: 'series',
      name: `🌸 Popüler Kore Dizileri (K-Drama)`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_SERIES_GENRES }, { name: 'skip', isRequired: false }]
    },
    // 7. Türk Sineması Başyapıtları (~88, Authentic Masters)
    {
      id: 'turkish_movies',
      type: 'movie',
      name: `🇹🇷 Türk Sineması Başyapıtları`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
    },
    // 8. Aksiyon Sineması Başyapıtları (~128 Shuffled)
    {
      id: 'action_movies',
      type: 'movie',
      name: `💥 Aksiyon Sineması Başyapıtları`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
    },
    // 9. Efsane & Popüler Türk TV Dizileri (~65 Pure Free TV)
    {
      id: 'turkish_series',
      type: 'series',
      name: `🇹🇷 Efsane & Popüler Türk Dizileri`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_SERIES_GENRES }, { name: 'skip', isRequired: false }]
    },
    // Discover-only: Personal Letterboxd lists
    {
      id: 'my_watchlist',
      type: 'movie',
      name: `📌 İzleme Listem (${user})`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
    },
    {
      id: 'my_diary',
      type: 'movie',
      name: `🍿 Son İzlediklerim (${user})`,
      extra: [{ name: 'genre', isRequired: false, options: PURE_MOVIE_GENRES }, { name: 'skip', isRequired: false }]
    }
  ];

  return {
    id: 'community.cinepilot.suite',
    name: 'CinePilot - Ultimate Cinema Suite',
    version: '3.8.0',
    description: 'Arama Motoru, 100+ Trendler, Bölüm Görselleri, K-Drama, Türk TV Dizileri, Aksiyon, YouTube 1080p ve 4K Fragmanlar.',
    resources: ['catalog', 'meta', 'stream'],
    types: ['movie', 'series'],
    catalogs: catalogs,
    idPrefixes: ['tt', 'tmdb:']
  };
}

// -------------------------------------------------------------
// Helper Functions
// -------------------------------------------------------------

function getPosterUrl(imdbId, tmdbPosterPath, useRpdb = true, isTurkish = false) {
  if (isTurkish && tmdbPosterPath) {
    return `https://image.tmdb.org/t/p/w500${tmdbPosterPath}`;
  }
  if (useRpdb && imdbId && imdbId.startsWith('tt')) {
    return `https://api.ratingposterdb.com/${RPDB_KEY}/imdb/poster-default/${imdbId}.jpg`;
  }
  if (tmdbPosterPath) {
    return `https://image.tmdb.org/t/p/w500${tmdbPosterPath}`;
  }
  return 'https://images.metahub.space/poster/medium/no_poster.png';
}

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

function scrapeLetterboxdPython(username, section) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'letterboxd.py');
    const py = spawn('python3', [scriptPath, username, section]);

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

// Convert Letterboxd scraped films to Stremio Metas concurrently
async function resolveLetterboxdFilms(films, useRpdb = true) {
  const promises = films.map(async (f) => {
    try {
      const searched = await searchTmdb(f.title, f.year, 'movie');
      if (searched) {
        const details = await fetchTmdbDetails(searched.id, 'movie');
        const imdbId = details?.external_ids?.imdb_id;
        const genres = extractGenres(details);
        return {
          id: imdbId || `tmdb:${searched.id}`,
          type: 'movie',
          name: f.title,
          poster: getPosterUrl(imdbId, searched.poster_path, useRpdb),
          description: searched.overview,
          genres: genres,
          releaseInfo: f.year || (searched.release_date ? searched.release_date.split('-')[0] : undefined)
        };
      }
    } catch (e) {}
    return null;
  });

  const results = await Promise.all(promises);
  return results.filter(Boolean);
}

// Convert IMDb / TMDB ID List to Metas concurrently
async function resolveImdbList(imdbIds, type = 'movie', useRpdb = true, isTurkish = false) {
  const promises = imdbIds.map(async (imdbId) => {
    try {
      let found = null;
      if (imdbId.startsWith('tmdb:')) {
        const tmdbId = imdbId.split(':')[1];
        found = await fetchTmdbDetails(tmdbId, type === 'series' ? 'tv' : 'movie');
      } else {
        found = await findTmdbByImdb(imdbId);
      }
      if (found) {
        const genres = extractGenres(found);
        return {
          id: imdbId,
          type: type,
          name: found.title || found.name,
          poster: getPosterUrl(imdbId, found.poster_path, useRpdb, isTurkish),
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

// Multi-page TMDB Weekly Trending Fetcher (100+ items with Genre Support)
async function fetchTrending100(type = 'movie', useRpdb = true, genreName = null) {
  const endpointType = type === 'series' ? 'tv' : 'movie';
  const genreId = genreName && genreName !== 'Tümü' ? TMDB_GENRE_MAP[genreName] : null;

  const cacheKey = `trending_100_${type}_${genreName || 'all'}_${useRpdb}`;
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
        poster: getPosterUrl(imdbId, item.poster_path, useRpdb),
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
async function searchTmdbCatalog(query, type = 'movie', useRpdb = true) {
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
        poster: getPosterUrl(imdbId, item.poster_path, useRpdb),
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

// Verified YouTube Search via Native HTTPS + Consent Cookies
function searchVerifiedYouTube(query) {
  const cacheKey = `yt_verified_https_${query}`;
  const cached = getCache(cacheKey);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+417; SOCS=CAESEwgDEgk2MzQ0MzY0NjAaAmVuIAEaBgiAo_OtBg'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const matches = data.match(/\"videoId\":\"([a-zA-Z0-9_-]{11})\"/g);
        if (matches) {
          const ids = matches.map(m => m.match(/\"videoId\":\"([a-zA-Z0-9_-]{11})\"/)[1]);
          const unique = [...new Set(ids)];
          if (unique.length > 0) {
            setCache(cacheKey, unique[0], 24 * 60 * 60 * 1000);
            return resolve(unique[0]);
          }
        }
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(6000, () => { req.destroy(); resolve(null); });
  });
}

// -------------------------------------------------------------
// Routes
// -------------------------------------------------------------

app.get(['/', '/configure'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Direct Watch Redirect (Allows IINA / Browser 1-click open)
app.get('/watch/:ytId', (req, res) => {
  res.redirect(`https://www.youtube.com/watch?v=${req.params.ytId}`);
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
      metas = await searchTmdbCatalog(searchQuery, type, config.useRpdb);
      return res.json({ metas });
    }

    // 1. HAFTALIK TREND FİLMLER (100+ with Genre Support)
    if (id === 'trending_movies') {
      metas = await fetchTrending100('movie', config.useRpdb, selectedGenre);
      return res.json({ metas });
    }

    // 2. HAFTALIK TREND DİZİLER (100+ with Genre Support)
    else if (id === 'trending_series') {
      metas = await fetchTrending100('series', config.useRpdb, selectedGenre);
      return res.json({ metas });
    }

    // 3. OSCAR ÖDÜLLÜ & ADAY FİLMLER (~96)
    else if (id === 'oscar_collection') {
      const cacheKey = `full_oscar_v8_${config.useRpdb}`;
      metas = getCache(cacheKey);
      if (!metas) {
        metas = await resolveImdbList(curatedData.oscar, 'movie', config.useRpdb);
        setCache(cacheKey, metas, 24 * 60 * 60 * 1000);
      }
    }

    // 4. TOP 250 MOVIES (~98)
    else if (id === 'top250_collection') {
      const cacheKey = `full_top250_v8_${config.useRpdb}`;
      metas = getCache(cacheKey);
      if (!metas) {
        metas = await resolveImdbList(curatedData.top250, 'movie', config.useRpdb);
        setCache(cacheKey, metas, 24 * 60 * 60 * 1000);
      }
    }

    // 5. ROLLING STONE TOP 100 TV SERIES (~88)
    else if (id === 'rolling_stone_series') {
      const cacheKey = `full_series100_v8_${config.useRpdb}`;
      metas = getCache(cacheKey);
      if (!metas) {
        metas = await resolveImdbList(curatedData.series100, 'series', config.useRpdb);
        setCache(cacheKey, metas, 24 * 60 * 60 * 1000);
      }
    }

    // 6. POPÜLER KORE DİZİLERİ (K-DRAMA) (~97)
    else if (id === 'kdrama_series') {
      const cacheKey = `full_kdrama_v8_${config.useRpdb}`;
      metas = getCache(cacheKey);
      if (!metas) {
        metas = await resolveImdbList(curatedData.kdrama, 'series', config.useRpdb);
        setCache(cacheKey, metas, 24 * 60 * 60 * 1000);
      }
    }

    // 7. TÜRK SİNEMASI BAŞYAPITLARI (~88, Authentic)
    else if (id === 'turkish_movies') {
      const cacheKey = `full_turkish_movies_v8`;
      metas = getCache(cacheKey);
      if (!metas) {
        metas = await resolveImdbList(curatedData.turkish_movies, 'movie', config.useRpdb, true);
        setCache(cacheKey, metas, 24 * 60 * 60 * 1000);
      }
    }

    // 8. AKSİYON SİNEMASI BAŞYAPITLARI (~128 Shuffled)
    else if (id === 'action_movies') {
      const cacheKey = `full_action_movies_v8_${config.useRpdb}`;
      metas = getCache(cacheKey);
      if (!metas) {
        metas = await resolveImdbList(curatedData.action_movies, 'movie', config.useRpdb);
        setCache(cacheKey, metas, 24 * 60 * 60 * 1000);
      }
    }

    // 9. EFSANE & POPÜLER TÜRK DİZİLERİ (~65 Pure Free TV)
    else if (id === 'turkish_series') {
      const cacheKey = `full_turkish_series_v8`;
      metas = getCache(cacheKey);
      if (!metas) {
        metas = await resolveImdbList(curatedData.turkish_series, 'series', config.useRpdb, true);
        setCache(cacheKey, metas, 24 * 60 * 60 * 1000);
      }
    }

    // 10. WATCHLIST (Full Letterboxd)
    else if (id === 'my_watchlist') {
      const cacheKey = `full_wl_v8_${config.letterboxdUser}_${config.useRpdb}`;
      metas = getCache(cacheKey);
      if (!metas) {
        const raw = await scrapeLetterboxdPython(config.letterboxdUser, 'watchlist');
        metas = await resolveLetterboxdFilms(raw, config.useRpdb);
        setCache(cacheKey, metas, 20 * 60 * 1000);
      }
    }

    // 11. DIARY / RECENT (Full Letterboxd)
    else if (id === 'my_diary') {
      const cacheKey = `full_diary_v8_${config.letterboxdUser}_${config.useRpdb}`;
      metas = getCache(cacheKey);
      if (!metas) {
        const raw = await scrapeLetterboxdPython(config.letterboxdUser, 'films');
        metas = await resolveLetterboxdFilms(raw, config.useRpdb);
        setCache(cacheKey, metas, 20 * 60 * 1000);
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
    const isTurkish = tmdbData.original_language === 'tr' || tmdbData.origin_country?.includes('TR');
    const poster = getPosterUrl(imdbId, tmdbData.poster_path, config.useRpdb, isTurkish);
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

// Stream Endpoint: Full Episodes, Full Movies & Official Trailers!
app.get(['/stream/:type/:id.json', '/:config/stream/:type/:id.json'], async (req, res) => {
  const config = parseConfig(req.params.config);
  const type = req.params.type;
  const rawId = req.params.id;

  try {
    const streams = [];

    // 1. Series Episode Stream Handling
    let isSeriesEp = false;
    let showTitle = null;
    let season = '1';
    let episode = '1';
    let tmdbData = null;
    let tmdbIdNum = null;

    if (type === 'series') {
      const parts = rawId.split(':');
      if (rawId.startsWith('tmdb:') && parts.length >= 4) {
        isSeriesEp = true;
        tmdbIdNum = parts[1];
        season = parts[2];
        episode = parts[3];
        tmdbData = await fetchTmdbDetails(tmdbIdNum, 'tv');
        showTitle = tmdbData?.name;
      } else if (rawId.startsWith('tt') && parts.length >= 3) {
        isSeriesEp = true;
        const imdbId = parts[0];
        season = parts[1];
        episode = parts[2];
        const found = await findTmdbByImdb(imdbId);
        if (found) {
          tmdbIdNum = found.id;
          tmdbData = await fetchTmdbDetails(found.id, 'tv');
          showTitle = tmdbData?.name;
        }
      }
    }

    if (isSeriesEp && showTitle) {
      const epQueries = [
        `${showTitle} ${episode}. Bölüm`,
        `${showTitle} ${season}. Sezon ${episode}. Bölüm`,
        `${showTitle} ${episode}. Bölüm Tek Parça`
      ];

      let epVid = null;
      for (const q of epQueries) {
        epVid = await searchVerifiedYouTube(q);
        if (epVid) break;
      }

      if (epVid) {
        // Native YouTube stream
        streams.push({
          name: "▶️ YouTube Full HD",
          title: `📺 ${showTitle} - S${season}E${episode}\nResmi YouTube Oynatıcısı (1080p)`,
          ytId: epVid
        });

        // Direct HTTP External URL (Copies directly into IINA / Browser with 100% valid URL!)
        streams.push({
          name: "🌐 IINA / Harici Bağlantı",
          title: `📺 ${showTitle} - S${season}E${episode}\nIINA ve Tarayıcı İçin Geçerli URL`,
          externalUrl: `https://www.youtube.com/watch?v=${epVid}`
        });
      }
    }

    // 2. Movie Handling: YouTube Full Movie Fallback for Turkish / Classic Films
    if (type === 'movie') {
      let movieTitle = null;
      if (rawId.startsWith('tt')) {
        const found = await findTmdbByImdb(rawId);
        movieTitle = found?.title;
        if (found) {
          tmdbIdNum = found.id;
          tmdbData = await fetchTmdbDetails(found.id, 'movie');
        }
      } else if (rawId.startsWith('tmdb:')) {
        tmdbIdNum = rawId.split(':')[1];
        tmdbData = await fetchTmdbDetails(tmdbIdNum, 'movie');
        movieTitle = tmdbData?.title;
      }

      if (movieTitle) {
        const isTurkish = tmdbData?.original_language === 'tr' || tmdbData?.origin_country?.includes('TR');
        if (isTurkish) {
          const fullMovieQueries = [
            `${movieTitle} Full HD Tek Parça`,
            `${movieTitle} Full Film İzle`,
            `${movieTitle} Tek Parça`
          ];
          for (const q of fullMovieQueries) {
            const vid = await searchVerifiedYouTube(q);
            if (vid) {
              streams.push({
                name: "▶️ YouTube Full Film",
                title: `🍿 ${movieTitle} (1080p Full Film)\nResmi YouTube Yayını`,
                ytId: vid
              });
              streams.push({
                name: "🌐 IINA / Harici Film",
                title: `🍿 ${movieTitle} (Full Film)\nIINA ve Tarayıcı Doğrudan Link`,
                externalUrl: `https://www.youtube.com/watch?v=${vid}`
              });
              break;
            }
          }
        }
      }
    }

    // 3. Official 4K / HD Trailers for ALL Movies & Series
    if (config.enableTrailers) {
      let targetTmdbId = tmdbIdNum;
      let targetType = type === 'series' ? 'tv' : 'movie';

      if (!targetTmdbId) {
        if (rawId.startsWith('tt')) {
          const imdbId = rawId.split(':')[0];
          const found = await findTmdbByImdb(imdbId);
          targetTmdbId = found?.id;
          if (found?.title) targetType = 'movie';
          else if (found?.name) targetType = 'tv';
        } else if (rawId.startsWith('tmdb:')) {
          targetTmdbId = rawId.split(':')[1];
        }
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
  console.log(`🚀 CinePilot v3.8.0 Server running on http://127.0.0.1:${PORT}`);
  console.log(`📡 Local Network URL (For Samsung TV & AndroidTV): http://${ip}:${PORT}`);
  console.log(`⚙️ Web Configurator: http://127.0.0.1:${PORT}/configure`);
});
