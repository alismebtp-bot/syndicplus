import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { DEMO_BUILDING } from '../../src/procedures/config';

const call = (path: string, init?: RequestInit) => exports.default.fetch(new Request(`https://test.local${path}`, init));
const post = (path: string, body: unknown) =>
  call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const MERCREDI_10H = '2026-10-21T08:00:00Z';
const MERCREDI_22H = '2026-10-21T20:00:00Z';

describe('GET /api/procedures/*', () => {
  it('catalogue : 6 parcours et 37 types', async () => {
    const r = (await (await call('/api/procedures/catalog')).json()) as { pathways: Record<string, unknown>; types: unknown[] };
    expect(Object.keys(r.pathways)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6']);
    expect(r.types).toHaveLength(37);
  });
  it('fiche de démonstration', async () => {
    const r = (await (await call('/api/procedures/demo-config')).json()) as { name: string };
    expect(r.name).toMatch(/Victor-Hugo/);
  });
});

describe('POST /api/procedures/route', () => {
  it('éclairage en semaine : gardien en premier', async () => {
    const res = await post('/api/procedures/route', { typeId: 'eclairage_commun', reportedBy: 'resident', now: MERCREDI_10H });
    expect(res.status).toBe(200);
    const { decision } = (await res.json()) as { decision: { firstActor: string; pathway: string } };
    expect(decision).toMatchObject({ pathway: 'P1', firstActor: 'guardian' });
  });
  it('danger : urgence P5, sans attendre', async () => {
    const { decision } = (await (await post('/api/procedures/route', { typeId: 'eclairage_commun', reportedBy: 'council_president', dangerSignals: ['Étincelles'], now: MERCREDI_22H })).json()) as {
      decision: { pathway: string; notify: string[] };
    };
    expect(decision.pathway).toBe('P5');
    expect(decision.notify).toEqual(expect.arrayContaining(['manager', 'council_president']));
    expect(decision.notify).not.toContain('guardian');
  });
  it('utilise la fiche fournie', async () => {
    const config = structuredClone(DEMO_BUILDING);
    config.guardian = null;
    const { decision, warnings } = (await (await post('/api/procedures/route', { typeId: 'nettoyage', reportedBy: 'resident', config, now: MERCREDI_10H })).json()) as {
      decision: { firstActor: string };
      warnings: string[];
    };
    expect(decision.firstActor).toBe('manager');
    expect(warnings.join(' ')).toMatch(/Aucun gardien/);
  });
  it('refuse une fiche invalide avec le détail', async () => {
    const res = await post('/api/procedures/route', { typeId: 'nettoyage', reportedBy: 'resident', config: { name: '' } });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { details: string[] }).details.length).toBeGreaterThan(0);
  });
  it('refuse un rôle inconnu ou un type manquant', async () => {
    expect((await post('/api/procedures/route', { typeId: 'nettoyage', reportedBy: 'pirate' })).status).toBe(400);
    expect((await post('/api/procedures/route', { reportedBy: 'resident' })).status).toBe(400);
    expect((await post('/api/procedures/route', '[1,2]')).status).toBe(400);
  });
  it('refuse un corps trop volumineux', async () => {
    const res = await post('/api/procedures/route', { typeId: 'nettoyage', reportedBy: 'resident', pad: 'x'.repeat(40_000) });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/procedures/after-guardian', () => {
  it('dans le plafond vérifié : affectation automatique', async () => {
    const { decision } = (await (await post('/api/procedures/after-guardian', { typeId: 'eclairage_commun', estimateHT: 120 })).json()) as { decision: { next: string; autoAssign: boolean } };
    expect(decision).toMatchObject({ next: 'contractor', autoAssign: true });
  });
  it('montant négatif ignoré : décision du gestionnaire', async () => {
    const { decision } = (await (await post('/api/procedures/after-guardian', { typeId: 'eclairage_commun', estimateHT: -5 })).json()) as { decision: { next: string } };
    expect(decision.next).toBe('manager');
  });
});

describe('POST /api/procedures/president-permission et compare-quotes', () => {
  it('aucune dépense sans délégation, aucune commande', async () => {
    for (const action of ['authorize_expenditure', 'issue_purchase_order']) {
      const { permission } = (await (await post('/api/procedures/president-permission', { action, amountHT: 100 })).json()) as { permission: { allowed: boolean } };
      expect(permission.allowed).toBe(false);
    }
    expect((await post('/api/procedures/president-permission', { action: 'tout_faire' })).status).toBe(400);
  });
  it('compare des devis', async () => {
    const { comparison } = (await (await post('/api/procedures/compare-quotes', {
      quotes: [
        { company: 'A', amountHT: 1000, vatRate: 20, delayDays: 10, scope: 's', warranty: 'w' },
        { company: 'B', amountHT: 900, vatRate: 20, delayDays: 20, scope: 's', warranty: 'w' },
        { company: '', amountHT: 1 },
      ],
    })).json()) as { comparison: { rows: { company: string; lowestPrice: boolean }[] } };
    expect(comparison.rows.map((r) => r.company)).toEqual(['B', 'A']);
    expect(comparison.rows[0]!.lowestPrice).toBe(true);
  });
});
