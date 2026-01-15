export default async function handler(req, res) {
  console.log('[log-location] method', req.method);
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_LOC_TABLE || 'location_logs';

  if (!supabaseUrl || !supabaseKey) {
    console.log('[log-location] missing env vars');
    res.status(500).json({ error: 'Missing Supabase env vars' });
    return;
  }

  let payload;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch (_err) {
    console.log('[log-location] invalid JSON');
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const lat = Number(payload?.lat);
  const lon = Number(payload?.lon);
  const accuracy = payload?.accuracy ?? null;
  const source = String(payload?.source || 'unknown');

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.log('[log-location] invalid coordinates', payload);
    res.status(400).json({ error: 'Invalid coordinates' });
    return;
  }

  // Rough Norway bounding box to prevent logging elsewhere.
  const inNorway = lat >= 57.9 && lat <= 71.5 && lon >= 4.0 && lon <= 31.5;
  if (!inNorway) {
    console.log('[log-location] outside Norway', { lat, lon });
    res.status(204).end();
    return;
  }

  const insert = [{
    lat,
    lon,
    accuracy,
    source,
    user_agent: req.headers['user-agent'] || null
  }];

  const resp = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(insert)
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.log('[log-location] insert failed', text);
    res.status(500).json({ error: 'Insert failed', detail: text });
    return;
  }

  console.log('[log-location] insert ok', { lat, lon, accuracy, source });
  res.status(204).end();
}
