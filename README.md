# RankedIn Padel Tournaments Map (no API)

This project:
- Scrapes RankedIn tournament listings by reading table rows (`<tr>`) and clicking the **Next** paginator until it becomes disabled.
- Geocodes each tournament (club name + city, or city-only for DPV entries) using OpenStreetMap **Nominatim** with caching + rate limiting.
- Publishes a static Leaflet map (GitHub Pages compatible) that lets users filter and click through to RankedIn (and "Join" when available).

## Quick start (local)

### 1) Scrape data
```bash
cd scraper
npm i
# Set your listing URL (the page that contains the DataTable with id "vdtnetable1")
export RANKEDIN_LIST_URL="https://www.rankedin.com/en/..."   # <-- change this
node scrape.js
```

This writes:
- `site/data/tournaments.json` (for the map)
- `scraper/cache/geocode-cache.json` (geocoding cache)

### 2) Serve the site
From repo root:
```bash
cd site
python3 -m http.server 8080
```
Open http://localhost:8080

## GitHub Pages (free hosting)

This repo includes a GitHub Actions workflow that:
- Runs the scraper on a schedule (daily by default)
- Builds the static site
- Deploys to GitHub Pages

Enable Pages in your repo settings:
- **Settings → Pages → Build and deployment → Source: GitHub Actions**

Then the map will update automatically.

### Change update frequency
Edit `.github/workflows/update-and-deploy.yml`:
- Default is daily at 03:15 UTC
- You can also run manually via the **workflow_dispatch** button in GitHub Actions.

## Notes
- If you need to apply filters (like in your prior code), edit `scraper/applyFilters.js`.
- The scraper uses Playwright, so it can click UI filters and pagination safely.
