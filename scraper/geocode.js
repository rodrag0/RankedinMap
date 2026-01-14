import fs from 'node:fs';
import path from 'node:path';
import { sleep, normalizeWhitespace } from './utils.js';

const CACHE_PATH = path.join(process.cwd(), 'cache', 'geocode-cache.json');

function loadCache(){
  try{ return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8')); }
  catch{ return {}; }
}

function saveCache(cache){
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive:true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export async function geocodeMany(items, { userAgent = 'rankedin-padel-map/1.0 (contact: you@example.com)' } = {}){
  const cache = loadCache();
  let last = 0;

  async function geocodeOne(query){
    const q = normalizeWhitespace(query);
    if(!q) return null;
    if(Object.prototype.hasOwnProperty.call(cache, q)) return cache[q];

    // rate limit (~1 req/s)
    const now = Date.now();
    const wait = Math.max(0, 1100 - (now - last));
    if(wait) await sleep(wait);
    last = Date.now();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format','json');
    url.searchParams.set('limit','1');

    const res = await fetch(url, {
      headers: { 'User-Agent': userAgent, 'Accept-Language': 'en' }
    });
    if(!res.ok){
      console.warn(`Geocode failed ${res.status} for query: "${q}". Skipping.`);
      cache[q] = null;
      saveCache(cache);
      return null;
    }
    const arr = await res.json();
    const best = arr?.[0];
    if(!best){
      cache[q] = null;
      saveCache(cache);
      return null;
    }

    const out = { lat: Number(best.lat), lon: Number(best.lon), display_name: best.display_name };
    cache[q] = out;
    saveCache(cache);
    return out;
  }

  function cleanCity(city){
    return (city || '')
      .replace(/\s*,?\s*(Deutschland|Germany)\s*$/i, '')
      .trim();
  }

  function buildCandidates(t){
    const country = 'Germany';
    const club = (t.club || '').trim();
    const city = cleanCity(t.city);
    const postcode = (t.postcode || '').trim();

    // If DPV or club missing, don't rely on club name.
    const clubAllowed = club && !/^dpv\b/i.test(club);

    const candidates = [];

    // 1) original geocodeQuery first (what you already compute)
    if (t.geocodeQuery) candidates.push(t.geocodeQuery);

    // 2) club + city
    if (clubAllowed && city) candidates.push(`${club}, ${city}, ${country}`);

    // 3) club + postcode + city
    if (clubAllowed && postcode && city) candidates.push(`${club}, ${postcode} ${city}, ${country}`);

    // 4) postcode + city (very reliable)
    if (postcode && city) candidates.push(`${postcode} ${city}, ${country}`);

    // 5) city only (fallback of last resort)
    if (city) candidates.push(`${city}, ${country}`);

    // de-dupe
    return [...new Set(candidates.map(s => normalizeWhitespace(s)).filter(Boolean))];
  }

  for (const t of items) {
    if (typeof t.lat === 'number' && typeof t.lon === 'number') continue;

    const candidates = buildCandidates(t);
    let geo = null;

    for (const q of candidates) {
      geo = await geocodeOne(q);
      if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)) {
        t.lat = geo.lat;
        t.lon = geo.lon;
        t.geocodeDisplay = geo.display_name;
        t.geocodeQueryUsed = q;   // helpful for debugging
        break;
      }
    }
  }

  return items;
}
