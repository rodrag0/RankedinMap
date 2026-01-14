export function sleep(ms){
  return new Promise(res=>setTimeout(res, ms));
}

export function normalizeWhitespace(s){
  return String(s ?? '').replace(/\s+/g,' ').trim();
}

export function makeAbsoluteRankedInUrl(pathOrUrl){
  const u = String(pathOrUrl ?? '').trim();
  if(!u) return null;
  if(u.startsWith('http://') || u.startsWith('https://')) return u;
  if(u.startsWith('/')) return `https://www.rankedin.com${u}`;
  return `https://www.rankedin.com/${u}`;
}

export function makeId(obj){
  const raw = `${obj.url || ''}|${obj.date || ''}|${obj.postcode || ''}|${obj.city || ''}|${obj.club || ''}`;
  let h = 2166136261;
  for(let i=0;i<raw.length;i++){
    h ^= raw.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return `t_${h.toString(16)}`;
}

export function isDPVClubName(club){
  const c = String(club||'').toLowerCase();
  return c.includes('dpv');
}
