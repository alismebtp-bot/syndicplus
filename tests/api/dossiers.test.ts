import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

type Dossier = { id: string; status: string; type: string; description: string; history: { text: string }[] };

const call = (path: string, init?: RequestInit) => exports.default.fetch(new Request(`https://test.local${path}`, init));
const post = (path: string, body: unknown) =>
  call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('GET /api/dossiers', () => {
  it('renvoie les dossiers de démonstration, du plus récent au plus ancien, avec leur historique', async () => {
    const res = await call('/api/dossiers');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const list = (await res.json()) as Dossier[];
    expect(list.map((d) => d.id)).toEqual(['D-1001', 'D-1000']);
    expect(list[0]!.history).toHaveLength(2);
  });
});

describe('POST /api/dossiers', () => {
  it('crée un dossier « À qualifier » avec une première ligne d’historique', async () => {
    const res = await post('/api/dossiers', { type: 'Ascenseur', place: 'Hall A', description: 'Ascenseur bloqué au 4e' });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(id).toBe('D-1002');
    const list = (await (await call('/api/dossiers')).json()) as Dossier[];
    const d = list.find((x) => x.id === id)!;
    expect(d.status).toBe('À qualifier');
    expect(d.history.map((h) => h.text)).toEqual(['Signalement reçu depuis l’espace résident']);
  });

  it('refuse un type inconnu, un champ vide ou un JSON invalide', async () => {
    expect((await post('/api/dossiers', { type: 'Hack', place: 'x', description: 'y' })).status).toBe(400);
    expect((await post('/api/dossiers', { type: 'Autre', place: '', description: 'y' })).status).toBe(400);
    expect((await post('/api/dossiers', '{pas du json')).status).toBe(400);
  });

  it('refuse un corps trop volumineux', async () => {
    const res = await post('/api/dossiers', { type: 'Autre', place: 'x', description: 'a'.repeat(20_000) });
    expect(res.status).toBe(400);
  });

  it('stocke le texte tel quel (l’échappement HTML est fait à l’affichage)', async () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { id } = (await (await post('/api/dossiers', { type: 'Autre', place: 'x', description: payload })).json()) as { id: string };
    const list = (await (await call('/api/dossiers')).json()) as Dossier[];
    expect(list.find((x) => x.id === id)!.description).toBe(payload);
  });
});

describe('POST /api/dossiers/:ref/updates', () => {
  it('change le statut, ajoute la note à l’historique', async () => {
    const res = await post('/api/dossiers/D-1001/updates', { status: 'Résolu', note: 'Vanne remplacée' });
    expect(res.status).toBe(200);
    const list = (await (await call('/api/dossiers')).json()) as Dossier[];
    const d = list.find((x) => x.id === 'D-1001')!;
    expect(d.status).toBe('Résolu');
    expect(d.history.at(-1)!.text).toBe('Vanne remplacée — statut : Résolu');
  });

  it('refuse une mise à jour sans changement ni note', async () => {
    // D-1000 est « Résolu » dans les données de démonstration
    const res = await post('/api/dossiers/D-1000/updates', { status: 'Résolu', note: '' });
    expect(res.status).toBe(400);
  });

  it('refuse un statut inconnu', async () => {
    expect((await post('/api/dossiers/D-1001/updates', { status: 'Annulé', note: 'x' })).status).toBe(400);
  });

  it('renvoie 404 pour un dossier inexistant ou une référence mal formée', async () => {
    expect((await post('/api/dossiers/D-99999/updates', { status: 'Résolu', note: '' })).status).toBe(404);
    expect((await post('/api/dossiers/1001/updates', { status: 'Résolu', note: '' })).status).toBe(404);
  });
});

describe('routes inconnues', () => {
  it('renvoie 404 en JSON sous /api', async () => {
    const res = await call('/api/inconnu');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Introuvable' });
  });
  it('sert l’interface sur /', async () => {
    const res = await call('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('SyndicPlus');
  });
});
