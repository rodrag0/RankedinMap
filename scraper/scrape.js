import { chromium } from 'playwright';
import { applyFilters } from './applyFilters.js';
import { makeAbsoluteRankedInUrl, normalizeWhitespace, makeId, isDPVClubName, sleep } from './utils.js';
import { geocodeMany } from './geocode.js';
import fs from 'node:fs';
import path from 'node:path';

const LIST_URL = process.env.RANKEDIN_LIST_URL;
if(!LIST_URL){
  console.error('Missing env var RANKEDIN_LIST_URL');
  process.exit(1);
}

const OUT_PATH = path.join(process.cwd(), '..', 'site', 'data', 'tournaments.json');

async function scrapeTablePage(page){
  try {
    await page.waitForSelector('table#vdtnetable1 tbody tr', { timeout: 5_000 });
  } catch (e) {
    console.log('Table not found, returning empty');
    return [];
  }

  const rows = await page.$$eval('table#vdtnetable1 tbody tr', trs => {
    return trs.map(tr => {
      const tds = Array.from(tr.querySelectorAll('td'));
      const a = tr.querySelector('a.rin-dt-table-action[data-action-click="go-to-event"]');
      const title = a?.textContent?.trim() || '';
      const href = a?.getAttribute('href') || '';


      //example info [title link, date, "42855 Remscheid", club, show details, status, type label]
      const date = tds?.[2]?.textContent?.trim() || tds?.[1]?.textContent?.trim() || '';
      const cityRaw = tds?.[3]?.textContent?.trim() || '';
      const club = tds?.[4]?.textContent?.trim() || '';
      const status = tds?.[6]?.textContent?.trim() || '';
      const type = (tds?.[7]?.textContent || '').replace(/\s+/g,' ').trim();

      const parts = cityRaw.split(' ');
      const postcode = parts[0] && /^\d{4,5}$/.test(parts[0]) ? parts[0] : '';
      const city = postcode ? parts.slice(1).join(' ').trim() : cityRaw;

      return { title, href, date, postcode, city, club, status, type };
    });
  }).catch(e => {
    console.log('Error scraping rows:', e.message);
    return [];
  });

  return rows.map(r => ({
    title: normalizeWhitespace(r.title),
    url: makeAbsoluteRankedInUrl(r.href),
    date: normalizeWhitespace(r.date),
    postcode: normalizeWhitespace(r.postcode),
    city: normalizeWhitespace(r.city),
    club: normalizeWhitespace(r.club),
    status: normalizeWhitespace(r.status),
    type: normalizeWhitespace(r.type)
  })).filter(r => r.url);
}

async function fetchJoinUrl(browser, url){
  const page = await browser.newPage();
  try{
    await page.goto(url, { waitUntil:'domcontentloaded', timeout: 60_000 });
    const join = await page.locator('a.org-join-btn').first();
    if(await join.count()){
      const href = await join.getAttribute('href');
      return href ? makeAbsoluteRankedInUrl(href) : null;
    }
  }catch{}
  finally{ await page.close().catch(()=>{}); }
  return null;
}

async function main(){
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Go to', LIST_URL);
  await page.goto(LIST_URL, { waitUntil:'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(2000); // Wait for content to load

  // Dismiss cookie consent popup
  try {
    await page.evaluate(() => {
      const cmp = document.getElementById('sd-cmp');
      if(cmp) cmp.remove();
    });
    console.log('Dismissed popup');
  } catch {}

  // Wait for table to appear
  try {
    await page.waitForSelector('table#vdtnetable1 tbody tr', { timeout: 10_000 });
    console.log('Table loaded');
  } catch (e) {
    console.log('Warning: Table selector timeout', e.message);
  }

  // Paste your working filter clicks into applyFilters.js
  await applyFilters(page);
  console.log('Filters applied, starting scrape loop');

  const all = [];
  const seen = new Set();

  while(true){
    const chunk = await scrapeTablePage(page);
    for(const t of chunk){
      if(seen.has(t.url)) continue;
      seen.add(t.url);
      all.push(t);
    }

    const nextLi = page.locator('li#vdtnetable1_next');
    const cls = await nextLi.getAttribute('class');
    const disabled = (cls || '').includes('disabled');
    if(disabled) break;

    // Use JavaScript to trigger the pagination instead of clicking through overlay
    await page.evaluate(() => {
      const link = document.querySelector('li#vdtnetable1_next a.page-link');
      if(link) link.click();
    });
    await page.waitForTimeout(600);
    await page.waitForSelector('table#vdtnetable1 tbody tr');
  }

  console.log('Rows scraped:', all.length);

  const enriched = all.map(t => ({
    ...t,
    label: t.type, // adjust if you have a separate “state”
    id: makeId(t)
  }));
  console.log('Enriched items:', enriched.length);
  // Optional join lookups (limited to reduce load)
  const MAX_JOIN = Number(process.env.MAX_JOIN_LOOKUPS || 25);
  const targets = enriched.slice(0, MAX_JOIN);
  let i = 0;
  for(const t of targets){
    i++;
    console.log(`Join lookup ${i}/${targets.length}`);
    t.joinUrl = await fetchJoinUrl(browser, t.url);
    await sleep(250);
  }

  // Geocode query logic
  for(const t of enriched){
    // Clean up city names - remove "Deutschland" or "Germany" if already present
    let cleanCity = t.city ? t.city.replace(/,?\s*(Deutschland|Germany)\s*$/i, '').trim() : '';
    const cityQ = cleanCity ? `${cleanCity}, Germany` : 'Germany';

    if(isDPVClubName(t.club)){
      t.geocodeQuery = cityQ;
    }else if(t.club && cleanCity){
      t.geocodeQuery = `${t.club}, ${cleanCity}, Germany`;
    }else if(cleanCity){
      t.geocodeQuery = cityQ;
    }else if(t.club){
      t.geocodeQuery = `${t.club}, Germany`;
    }else{
      t.geocodeQuery = null;
    }
  }

  console.log('Starting geocoding of', enriched.length, 'items');
  try {
    await geocodeMany(enriched, {
      userAgent: process.env.NOMINATIM_USER_AGENT || 'rankedin-padel-map/1.0 (contact: you@example.com)'
    });
  } catch (e) {
    console.log('Geocoding error:', e.message);
    // Continue anyway with whatever data we have
  }
  console.log('Geocoding complete, items now:', enriched.length);

  const out = { updatedAt: new Date().toISOString(), items: enriched };
  console.log('Writing output:', out.items.length, 'items');
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive:true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log('Wrote', OUT_PATH);

  await browser.close();
}

main().catch(e=>{
  console.error(e);
  process.exit(1);
});
