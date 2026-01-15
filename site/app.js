/* global L */
const DATA_URL = './data/tournaments.json';

let map, cluster;
let all = [];
let markersById = new Map();

function parseDate(dmy){
  if(!dmy) return null;
  const m = String(dmy).trim().match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if(!m) return null;
  const dd = Number(m[1]), mm = Number(m[2]);
  let yy = Number(m[3]);
  if(String(m[3]).length === 2) yy = 2000 + yy;
  const dt = new Date(Date.UTC(yy, mm-1, dd));
  return isNaN(dt.getTime()) ? null : dt;
}

function uniq(arr){
  return [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function createMap(){
  map = L.map('map', { zoomControl: true }).setView([51.1657, 10.4515], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  cluster = L.markerClusterGroup({ showCoverageOnHover: false });
  map.addLayer(cluster);

  // --- User location layer (not clustered) ---
  let userMarker = null;
  let userCircle = null;

  function locateMe() {
    map.locate({
      setView: true,
      maxZoom: 13,
      enableHighAccuracy: true,
      timeout: 10000
    });
  }

  map.on("locationfound", (e) => {
    // e.latlng, e.accuracy (meters)
    if (!userMarker) {
      const userIcon = L.icon({
        iconUrl: './baf01fb517749ccf4e1215d7576fe262-tennis-ball.webp',
        iconSize: [50, 50],
        iconAnchor: [25, 25],
        popupAnchor: [0, -25]
      });
      userMarker = L.marker(e.latlng, { icon: userIcon, keyboard: false }).addTo(map);
      userMarker.bindPopup("You are here");
    } else {
      userMarker.setLatLng(e.latlng);
    }

    if (!userCircle) {
      userCircle = L.circle(e.latlng, { radius: e.accuracy }).addTo(map);
    } else {
      userCircle.setLatLng(e.latlng);
      userCircle.setRadius(e.accuracy);
    }
  });

  map.on("locationerror", (e) => {
    console.warn("Geolocation error:", e.message);
    alert(`Couldn't get your location: ${e.message}`);
  });

  // --- Button control ---
  const LocateControl = L.Control.extend({
    onAdd() {
      const btn = L.DomUtil.create("button", "locate-btn");
      btn.type = "button";
      btn.title = "Center on my location";
      btn.innerHTML = "📍";

      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.on(btn, "click", (ev) => {
        L.DomEvent.stop(ev);
        locateMe();
      });

      return btn;
    }
  });

  new LocateControl({ position: "topleft" }).addTo(map);

  // Trigger geolocation on load
  locateMe();
}

function makePopup(t){
  const title = escapeHtml(t.title);
  const club = escapeHtml(t.club ?? '');
  const city = escapeHtml(t.city ?? '');
  const date = escapeHtml(t.date ?? '');
  const status = escapeHtml(t.status ?? '');
  const typ = escapeHtml(t.type ?? '');
  const label = escapeHtml(t.label ?? '');
  const url = t.url;
  const joinUrl = t.joinUrl;

  const chips = [
    typ && `<span class="pill">${typ}</span>`,
    status && `<span class="pill accent">${status}</span>`,
    label && `<span class="pill">${label}</span>`
  ].filter(Boolean).join(' ');

  const btns = [
    url ? `<a class="primary" target="_blank" rel="noreferrer" href="${url}">Open in RankedIn</a>` : '',
    joinUrl ? `<a target="_blank" rel="noreferrer" href="${joinUrl}">Join</a>` : ''
  ].filter(Boolean).join(' ');

  return `
    <div style="min-width:240px; max-width:320px;">
      <div style="font-weight:700; margin-bottom:6px;">${title}</div>
      <div style="font-size:13px; opacity:.9; margin-bottom:8px;">${date} · ${city}${club ? ' · '+club : ''}</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">${chips}</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">${btns}</div>
    </div>
  `;
}

function addMarkers(items){
  cluster.clearLayers();
  markersById.clear();

  for(const t of items){
    if(typeof t.lat !== 'number' || typeof t.lon !== 'number') continue;
    const m = L.marker([t.lat, t.lon]);
    m.bindPopup(makePopup(t));
    cluster.addLayer(m);
    markersById.set(t.id, m);
  }
}

function renderList(items){
  const list = document.getElementById('list');
  list.innerHTML = '';
  const frag = document.createDocumentFragment();

  for(const t of items){
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = t.id;

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = t.title || '(untitled)';

    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.innerHTML = `<span>${t.date || ''}</span><span>${(t.postcode||'')} ${(t.city||'')}`.trim() + `</span>`;

    const pills = document.createElement('div');
    pills.className = 'pills';
    const addPill = (txt, accent=false)=>{
      if(!txt) return;
      const s = document.createElement('span');
      s.className = 'pill' + (accent ? ' accent' : '');
      s.textContent = txt;
      pills.appendChild(s);
    };
    addPill(t.type);
    addPill(t.status, true);
    addPill(t.label);

    const actions = document.createElement('div');
    actions.className = 'actions';
    if(t.url){
      const a = document.createElement('a');
      a.href = t.url; a.target = '_blank'; a.rel = 'noreferrer';
      a.className = 'primary';
      a.textContent = 'Open in RankedIn';
      actions.appendChild(a);
    }
    if(t.joinUrl){
      const a = document.createElement('a');
      a.href = t.joinUrl; a.target = '_blank'; a.rel = 'noreferrer';
      a.textContent = 'Join';
      actions.appendChild(a);
    }

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(pills);
    card.appendChild(actions);

    card.addEventListener('click', () => {
      const m = markersById.get(t.id);
      if(m){
        map.setView(m.getLatLng(), Math.max(map.getZoom(), 11), { animate:true });
        m.openPopup();
      }else if(typeof t.lat === 'number' && typeof t.lon === 'number'){
        map.setView([t.lat, t.lon], 11, { animate:true });
      }
    });

    frag.appendChild(card);
  }

  list.appendChild(frag);
  document.getElementById('count').textContent = `${items.length} tournaments shown`;
}

function applyFilters(){
  const q = document.getElementById('search').value.trim().toLowerCase();
  const type = document.getElementById('type').value;
  const status = document.getElementById('status').value;
  const label = document.getElementById('state').value;
  const sort = document.getElementById('sort').value;

  let items = all.slice();

  if(q){
    items = items.filter(t => {
      const hay = `${t.title||''} ${t.club||''} ${t.city||''} ${t.postcode||''}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if(type) items = items.filter(t => (t.type||'') === type);
  if(status) items = items.filter(t => (t.status||'') === status);
  if(label) items = items.filter(t => (t.label||'') === label);

  items.sort((a,b)=>{
    const da = parseDate(a.date)?.getTime() ?? 0;
    const db = parseDate(b.date)?.getTime() ?? 0;
    return sort === 'dateDesc' ? (db - da) : (da - db);
  });

  renderList(items);
  addMarkers(items);
}

async function init(){
  createMap();

  const res = await fetch(DATA_URL, { cache: 'no-store' });
  const payload = await res.json();

  all = payload.items || [];
  document.getElementById('lastUpdated').textContent =
    payload.updatedAt ? `Updated: ${payload.updatedAt}` : 'Updated: (unknown)';

  const types = uniq(all.map(x=>x.type));
  const statuses = uniq(all.map(x=>x.status));
  const labels = uniq(all.map(x=>x.label));

  const typeSel = document.getElementById('type');
  types.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; typeSel.appendChild(o); });

  const statusSel = document.getElementById('status');
  statuses.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; statusSel.appendChild(o); });

  const labelSel = document.getElementById('state');
  labels.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; labelSel.appendChild(o); });

  ['search','type','status','state','sort'].forEach(id => {
    document.getElementById(id).addEventListener('input', applyFilters);
    document.getElementById(id).addEventListener('change', applyFilters);
  });

  document.getElementById('reset').addEventListener('click', () => {
    document.getElementById('search').value = '';
    document.getElementById('type').value = '';
    document.getElementById('status').value = '';
    document.getElementById('state').value = '';
    document.getElementById('sort').value = 'dateAsc';
    applyFilters();
  });

  // Apply button - collapse filters on mobile after applying
  document.getElementById('apply').addEventListener('click', () => {
    applyFilters();
    const controlsPanel = document.getElementById('controlsPanel');
    if(controlsPanel && controlsPanel.classList.contains('expanded')){
      controlsPanel.classList.remove('expanded');
    }
  });

  // Mobile filter toggle
  const filterToggle = document.getElementById('filterToggle');
  const controlsPanel = document.getElementById('controlsPanel');
  if(filterToggle && controlsPanel){
    filterToggle.addEventListener('click', () => {
      controlsPanel.classList.toggle('expanded');
    });
  }

  applyFilters();
}

init().catch(err=>{
  console.error(err);
  alert('Failed to load data. Run the scraper to generate site/data/tournaments.json');
});
