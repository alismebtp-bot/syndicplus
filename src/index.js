// SyndicPlus — API partagée (Cloudflare Worker + D1)
const TYPES = ['Chauffage', 'Fuite d’eau', 'Éclairage', 'Ascenseur', 'Autre'];
const STATUSES = ['À qualifier', 'En cours', 'En attente prestataire', 'Résolu'];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function readBody(request) {
  if (Number(request.headers.get('content-length') || 0) > 10_000) return null;
  try { return await request.json(); } catch { return null; }
}

async function listDossiers(env) {
  const [d, h] = await env.DB.batch([
    env.DB.prepare('SELECT num,type,description,place,status,created_at FROM dossiers ORDER BY num DESC LIMIT 500'),
    env.DB.prepare('SELECT dossier_num,text,created_at FROM history ORDER BY id ASC'),
  ]);
  const byNum = new Map();
  const out = d.results.map((r) => {
    const o = { id: 'D-' + r.num, num: r.num, type: r.type, description: r.description, place: r.place, status: r.status, created_at: r.created_at, history: [] };
    byNum.set(r.num, o);
    return o;
  });
  for (const x of h.results) byNum.get(x.dossier_num)?.history.push({ text: x.text, created_at: x.created_at });
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      if (path === '/api/dossiers' && request.method === 'GET') {
        return json(await listDossiers(env));
      }

      if (path === '/api/dossiers' && request.method === 'POST') {
        const b = await readBody(request);
        if (!b) return json({ error: 'Requête invalide' }, 400);
        const type = clean(b.type, 40), place = clean(b.place, 100), description = clean(b.description, 1000);
        if (!TYPES.includes(type) || !place || !description) return json({ error: 'Champs manquants ou invalides' }, 400);
        const row = await env.DB.prepare('INSERT INTO dossiers (type,description,place) VALUES (?,?,?) RETURNING num')
          .bind(type, description, place).first();
        await env.DB.prepare('INSERT INTO history (dossier_num,text) VALUES (?,?)')
          .bind(row.num, 'Signalement reçu depuis l’espace résident').run();
        return json({ id: 'D-' + row.num }, 201);
      }

      const m = path.match(/^\/api\/dossiers\/D-(\d+)\/updates$/);
      if (m && request.method === 'POST') {
        const num = Number(m[1]);
        const b = await readBody(request);
        if (!b) return json({ error: 'Requête invalide' }, 400);
        const status = clean(b.status, 40), note = clean(b.note, 1000);
        if (!STATUSES.includes(status)) return json({ error: 'Statut invalide' }, 400);
        const cur = await env.DB.prepare('SELECT status FROM dossiers WHERE num=?').bind(num).first();
        if (!cur) return json({ error: 'Dossier introuvable' }, 404);
        if (!note && cur.status === status) return json({ error: 'Ajoutez une note ou modifiez le statut.' }, 400);
        await env.DB.batch([
          env.DB.prepare('UPDATE dossiers SET status=? WHERE num=?').bind(status, num),
          env.DB.prepare('INSERT INTO history (dossier_num,text) VALUES (?,?)').bind(num, (note || 'Statut modifié') + ' — statut : ' + status),
        ]);
        return json({ ok: true });
      }

      return json({ error: 'Introuvable' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'Erreur serveur' }, 500);
    }
  },
};
