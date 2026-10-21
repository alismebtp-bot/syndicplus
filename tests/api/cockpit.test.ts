import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import worker from '../../src/index';

const BASE = 'https://test.local';
const call = (path: string, init?: RequestInit) => exports.default.fetch(new Request(`${BASE}${path}`, init));
const jsonInit = (body: unknown, cookie?: string): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});

async function login(userId: string): Promise<string> {
  const res = await call('/api/demo/login', jsonInit({ userId }));
  expect(res.status).toBe(200);
  const set = res.headers.get('set-cookie') ?? '';
  expect(set).toContain('HttpOnly');
  expect(set).toContain('SameSite=Lax');
  return set.split(';')[0]!;
}
const get = async <T = Record<string, unknown>>(path: string, cookie: string) => {
  const res = await call(path, { headers: { cookie } });
  return { status: res.status, body: (await res.json()) as T };
};
const act = (num: number, body: unknown, cookie: string) => call(`/api/cockpit/dossiers/D-${num}/actions`, jsonInit(body, cookie));

type Kpi = { id: string; value: number };
type View = { ref: string; num: number; coproId: string; flags: { code: string }[]; assigneeId: string | null; owner: { name: string } };

let lea = '';
let marc = '';
let paul = '';
let claire = '';

beforeAll(async () => {
  lea = await login('dir_lea'); // le premier login génère les données fictives
  marc = await login('dir_marc');
  paul = await login('dir_paul');
  claire = await login('mgr_claire');
});

describe('Identité de démonstration', () => {
  it('production (DEMO_IDENTITY absent ou « disabled ») : le cockpit répond 401 et les personas sont indisponibles', async () => {
    const prodEnv = { ...env, DEMO_IDENTITY: 'disabled' } as Env;
    const r1 = await worker.fetch(new Request(`${BASE}/api/cockpit/overview`, { headers: { cookie: lea } }) as never, prodEnv);
    expect(r1.status).toBe(401);
    const r2 = await worker.fetch(new Request(`${BASE}/api/demo/personas`) as never, prodEnv);
    expect(r2.status).toBe(404);
    const noSecret = { ...env, DEMO_SECRET: 'court' } as unknown as Env;
    expect((await worker.fetch(new Request(`${BASE}/api/cockpit/overview`, { headers: { cookie: lea } }) as never, noSecret)).status).toBe(401);
  });

  it('refuse l’absence de session, une signature falsifiée et une persona inconnue', async () => {
    expect((await call('/api/cockpit/overview')).status).toBe(401);
    const forged = lea.replace(/.$/, (c) => (c === '0' ? '1' : '0'));
    expect((await call('/api/cockpit/overview', { headers: { cookie: forged } })).status).toBe(401);
    const otherUser = lea.replace('dir_lea', 'dir_paul');
    expect((await call('/api/cockpit/overview', { headers: { cookie: otherUser } })).status).toBe(401);
    expect((await call('/api/demo/login', jsonInit({ userId: 'admin' }))).status).toBe(400);
  });

  it('un gestionnaire n’a pas accès au cockpit (403), /me l’explique', async () => {
    const me = await get<{ canSupervise: boolean; reason: string }>('/api/cockpit/me', claire);
    expect(me.status).toBe(200);
    expect(me.body.canSupervise).toBe(false);
    expect((await call('/api/cockpit/overview', { headers: { cookie: claire } })).status).toBe(403);
  });
});

describe('Vue globale et briefing (données enregistrées uniquement)', () => {
  it('calcule les indicateurs du périmètre de Léa', async () => {
    const { status, body } = await get<{ kpis: Kpi[]; attention: { id: string; severity: string; dossiers: string[]; action: { kind: string }; responsible: string; justification: string }[] }>('/api/cockpit/overview', lea);
    expect(status).toBe(200);
    const k = Object.fromEntries(body.kpis.map((x) => [x.id, x.value]));
    expect(k).toEqual({ open: 10, urgent: 1, late: 3, no_next_action: 2, unassigned: 1, open_reserves: 1, pending_decisions: 2, uncovered: 1 });
    const ids = body.attention.map((a) => a.id);
    expect(body.attention[0]!.id).toBe('urgent-late-9001');
    expect(body.attention[0]!.severity).toBe('high');
    expect(ids).toContain('absence-mgr_nadia');
    expect(ids).toContain('unassigned-9007');
    expect(ids).toContain('failed-9004');
    expect(ids).toContain('reserves-9006');
    expect(ids).toContain('finance-CH-9003');
    expect(ids).toContain('contract-ctr_jardins_asc');
    expect(ids).toContain('satisfaction-9012');
    expect(ids.some((i) => i.startsWith('recurring-'))).toBe(true);
    for (const a of body.attention) {
      expect(a.justification.length).toBeGreaterThan(5);
      expect(a.responsible).toBeTruthy();
      expect(a.action.kind).toBeTruthy();
    }
  });

  it('identifie automatiquement les signaux du centre incidents', async () => {
    const { body } = await get<{ dossiers: View[] }>('/api/cockpit/dossiers', lea);
    const flags = (n: number) => body.dossiers.find((d) => d.num === n)!.flags.map((f) => f.code);
    expect(flags(9001)).toEqual(expect.arrayContaining(['urgent', 'late']));
    expect(flags(9007)).toEqual(expect.arrayContaining(['unassigned', 'no_next_action']));
    expect(flags(9004)).toEqual(expect.arrayContaining(['late', 'failed_intervention', 'owner_absent']));
    expect(flags(9008)).toEqual(expect.arrayContaining(['stale', 'no_next_action', 'owner_absent']));
    expect(flags(9006)).toEqual(expect.arrayContaining(['open_reserves', 'late']));
    expect(flags(9011)).toContain('recurring');
    expect(flags(9012)).toContain('contested');
    expect(body.dossiers.some((d) => d.num > 9100)).toBe(false);
  });
});

describe('Isolation des cabinets et périmètre', () => {
  it('un autre cabinet ne voit ni ne modifie rien du Cabinet Horizon', async () => {
    const { body } = await get<{ dossiers: View[] }>('/api/cockpit/dossiers', paul);
    expect(body.dossiers.map((d) => d.num).sort()).toEqual([9101, 9102]);
    expect((await call('/api/cockpit/dossiers/D-9001', { headers: { cookie: paul } })).status).toBe(404);
    expect((await call('/api/cockpit/portfolio/copro_vh', { headers: { cookie: paul } })).status).toBe(404);
    expect((await act(9001, { action: 'request_update' }, paul)).status).toBe(404);
    const reassignForeign = await act(9102, { action: 'reassign', to: 'mgr_claire', reason: 'test', confirm: true }, paul);
    expect(reassignForeign.status).toBe(403);
  });

  it('un responsable au périmètre limité ne voit que ses copropriétés', async () => {
    const { body } = await get<{ copros: { id: string }[] }>('/api/cockpit/portfolio', marc);
    expect(body.copros.map((c) => c.id).sort()).toEqual(['copro_parc', 'copro_tilleuls']);
    const d = await get<{ dossiers: View[] }>('/api/cockpit/dossiers', marc);
    expect(new Set(d.body.dossiers.map((x) => x.coproId))).toEqual(new Set(['copro_parc', 'copro_tilleuls']));
    expect((await call('/api/cockpit/dossiers/D-9002', { headers: { cookie: marc } })).status).toBe(404);
    expect((await act(9002, { action: 'request_update' }, marc)).status).toBe(404);
  });

  it('l’API publique du prototype n’expose pas les dossiers des cabinets', async () => {
    const list = (await (await call('/api/dossiers')).json()) as { id: string }[];
    expect(list.some((d) => /^D-9\d{3}$/.test(d.id))).toBe(false);
    const upd = await call('/api/dossiers/D-9001/updates', jsonInit({ status: 'Résolu', note: 'x' }));
    expect(upd.status).toBe(404);
  });
});

describe('Actions de supervision', () => {
  it('réaffecte avec confirmation, historise, audite et notifie les personnes concernées', async () => {
    expect((await act(9004, { action: 'reassign', to: 'mgr_hugo', reason: 'Absence de Nadia' }, lea)).status).toBe(400);
    const res = await act(9004, { action: 'reassign', to: 'mgr_hugo', reason: 'Absence de Nadia', confirm: true }, lea);
    expect(res.status).toBe(200);
    const out = (await res.json()) as { notified: string[] };
    expect(out.notified.sort()).toEqual(['Hugo Bernard', 'Nadia Kader']);
    const detail = await get<{ dossier: View; history: { text: string; actor: string; internal: boolean }[] }>('/api/cockpit/dossiers/D-9004', lea);
    expect(detail.body.dossier.assigneeId).toBe('mgr_hugo');
    expect(detail.body.history[0]).toMatchObject({ actor: 'Léa Fontaine', internal: true });
    expect(detail.body.history[0]!.text).toContain('Nadia Kader → Hugo Bernard');
    const audit = await env.DB.prepare("SELECT actor_user_id, detail FROM audit_log WHERE action='reassign' AND entity_id='D-9004'").first<{ actor_user_id: string; detail: string }>();
    expect(audit).toMatchObject({ actor_user_id: 'dir_lea' });
    const n = await env.DB.prepare("SELECT to_user_id FROM notifications WHERE dossier_num=9004 AND kind='assignment' ORDER BY to_user_id").all<{ to_user_id: string }>();
    expect(n.results.map((x) => x.to_user_id)).toEqual(['mgr_hugo', 'mgr_nadia']);
    // L'historique interne n'apparaît pas côté résident
    const pub = await env.DB.prepare('SELECT COUNT(*) AS c FROM history WHERE dossier_num=9004 AND internal=0').first<{ c: number }>();
    expect(pub!.c).toBe(2);
  });

  it('refuse les réaffectations non autorisées', async () => {
    const reason = 'test';
    const r = async (num: number, to: string) => (await act(num, { action: 'reassign', to, reason, confirm: true }, lea)).status;
    expect(await r(9002, 'mgr_nadia')).toBe(403); // absente
    expect(await r(9002, 'grd_martin')).toBe(403); // pas gestionnaire
    expect(await r(9002, 'mgr_ines')).toBe(403); // autre cabinet
    expect(await r(9002, 'mgr_claire')).toBe(403); // déjà en charge
    expect(await r(9009, 'mgr_hugo')).toBe(403); // dossier clôturé
    expect(await r(9002, 'Robert;DROP')).toBe(400);
  });

  it('désigne un remplaçant : l’absence est couverte et les personnes sont informées', async () => {
    const url = '/api/cockpit/team/mgr_nadia/replacement';
    expect((await call(url, jsonInit({ replacement: 'mgr_claire' }, lea))).status).toBe(400); // sans confirmation
    expect((await call(url, jsonInit({ replacement: 'mgr_nadia', confirm: true }, lea))).status).toBe(403);
    expect((await call(url, jsonInit({ replacement: 'mgr_claire', confirm: true }, paul))).status).toBe(404);
    const ok = await call(url, jsonInit({ replacement: 'mgr_claire', confirm: true }, lea));
    expect(ok.status).toBe(200);
    const { body } = await get<{ kpis: Kpi[] }>('/api/cockpit/overview', lea);
    expect(body.kpis.find((k) => k.id === 'uncovered')!.value).toBe(0);
    const d = await get<{ dossiers: View[] }>('/api/cockpit/dossiers', lea);
    expect(d.body.dossiers.find((x) => x.num === 9008)!.owner.name).toBe('Claire Moreau');
    const n = await env.DB.prepare("SELECT to_user_id FROM notifications WHERE kind='replacement' ORDER BY to_user_id").all<{ to_user_id: string }>();
    expect(n.results.map((x) => x.to_user_id)).toEqual(['mgr_claire', 'mgr_nadia']);
  });

  it('demande un point, une vérification, signale une priorité et programme une revue', async () => {
    expect((await act(9002, { action: 'request_update', message: 'Où en est le constat ?' }, lea)).status).toBe(200);
    expect((await act(9003, { action: 'request_verification' }, lea)).status).toBe(200);
    expect((await act(9003, { action: 'flag_priority', flagged: true }, lea)).status).toBe(200);
    expect((await act(9003, { action: 'flag_priority', flagged: true }, lea)).status).toBe(409);
    expect((await act(9003, { action: 'schedule_review', dueOn: '2001-01-01' }, lea)).status).toBe(400);
    const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    expect((await act(9003, { action: 'schedule_review', dueOn: due, note: 'Point chauffage' }, lea)).status).toBe(200);
    expect((await act(9003, { action: 'unknown' }, lea)).status).toBe(400);
    const v = await env.DB.prepare("SELECT to_user_id FROM notifications WHERE dossier_num=9003 AND kind='verification_request' ORDER BY to_user_id").all<{ to_user_id: string }>();
    expect(v.results.map((x) => x.to_user_id)).toEqual(['grd_martin', 'mgr_hugo']);
    const flagged = await env.DB.prepare('SELECT flagged FROM dossiers WHERE num=9003').first<{ flagged: number }>();
    expect(flagged!.flagged).toBe(1);
    const { body } = await get<{ entries: { action: string }[] }>('/api/cockpit/journal', lea);
    expect(body.entries.map((e) => e.action)).toEqual(expect.arrayContaining(['request_update', 'request_verification', 'flag_priority', 'schedule_review', 'reassign', 'set_replacement']));
  });

  it('préparer une décision ne crée aucune autorisation ni engagement financier', async () => {
    const before = await env.DB.prepare('SELECT COUNT(*) AS c FROM financial_items').first<{ c: number }>();
    expect((await act(9005, { action: 'prepare_decision', kind: 'quote_approval', label: 'Choisir', authority: 'Conseil syndical' }, lea)).status).toBe(400);
    const res = await act(9005, { action: 'prepare_decision', kind: 'quote_approval', label: 'Choisir l’entreprise', amountHt: 3800, authority: 'Conseil syndical', confirm: true }, lea);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { message: string }).message).toContain('ni approuvée ni engagée');
    const after = await env.DB.prepare('SELECT COUNT(*) AS c FROM financial_items').first<{ c: number }>();
    expect(after!.c).toBe(before!.c);
    const d = await env.DB.prepare("SELECT status, prepared_by FROM decisions WHERE dossier_num=9005 AND label='Choisir l’entreprise'").first();
    expect(d).toMatchObject({ status: 'pending', prepared_by: 'dir_lea' });
  });

  it('programme une revue de contrat dans le périmètre uniquement', async () => {
    const due = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect((await call('/api/cockpit/reviews', jsonInit({ entity: 'contract', entityId: 'ctr_jardins_asc', dueOn: due }, lea))).status).toBe(200);
    expect((await call('/api/cockpit/reviews', jsonInit({ entity: 'contract', entityId: 'ctr_jardins_asc', dueOn: due }, marc))).status).toBe(404);
    expect((await call('/api/cockpit/reviews', jsonInit({ entity: 'contract', entityId: 'ctr_lac', dueOn: due }, lea))).status).toBe(404);
  });

  it('refuse une écriture qui n’est pas en JSON (protection inter-sites)', async () => {
    const res = await call('/api/cockpit/dossiers/D-9002/actions', { method: 'POST', headers: { 'content-type': 'text/plain', cookie: lea }, body: '{"action":"request_update"}' });
    expect(res.status).toBe(400);
  });

  it('le journal d’audit est en ajout seul', async () => {
    await expect(env.DB.prepare("UPDATE audit_log SET detail='x'").run()).rejects.toThrow();
  });
});

describe('Finances, prestataires, qualité, assistant, export', () => {
  it('sépare devis, autorisation, commande, facture, paiement et signale les écarts', async () => {
    const { body } = await get<{ totals: { stage: string; amountHt: number | null }[]; chains: { chainId: string; alerts: string[]; currentStage: string }[] }>('/api/cockpit/finance', lea);
    expect(body.totals.map((t) => t.stage)).toEqual(['quote', 'authorized', 'ordered', 'invoiced', 'paid']);
    expect(body.totals[0]!.amountHt).toBeNull();
    const ch = body.chains.find((c) => c.chainId === 'CH-9003')!;
    expect(ch.currentStage).toBe('invoiced');
    expect(ch.alerts.join(' ')).toContain('Facture supérieure à la commande');
    expect(body.chains.find((c) => c.chainId === 'HA-9006')!.alerts).toEqual([]);
  });

  it('contextualise les prestataires sans jamais les déclarer défaillants', async () => {
    const res = await call('/api/cockpit/providers', { headers: { cookie: lea } });
    const text = await res.text();
    expect(text.toLowerCase()).not.toContain('défaillant');
    const body = JSON.parse(text) as { providers: { id: string; observations: string[]; sampleWarning: string | null; reservesOpen: number }[] };
    const asc = body.providers.find((p) => p.id === 'prov_asc')!;
    expect(asc.observations.join(' ')).toContain('2 interventions sans résolution sur D-9004');
    expect(asc.sampleWarning).toContain('Échantillon faible');
    expect(body.providers.find((p) => p.id === 'prov_toit')!.reservesOpen).toBe(2);
  });

  it('distingue clôture administrative et satisfaction', async () => {
    const { body } = await get<{ note: string; answered: number; closed: number; lowScores: { ref: string }[]; closedWithoutFeedback: string[] }>('/api/cockpit/quality', lea);
    expect(body.note).toContain('ne signifie pas');
    expect(body.lowScores.map((x) => x.ref)).toContain('D-9012');
    expect(body.closedWithoutFeedback).toContain('D-9015');
    expect(body.answered).toBeLessThan(body.closed);
  });

  it('l’assistant répond avec synthèse, faits sourcés, confiance et prochaine action — sans se présenter comme une IA générative', async () => {
    const list = await get<{ questions: { id: string }[] }>('/api/cockpit/assistant', lea);
    expect(list.body.questions.length).toBeGreaterThanOrEqual(8);
    for (const q of list.body.questions) {
      const { status, body } = await get<{ engine: string; summary: string; facts: { source: string }[]; confidence: { level: string } }>(`/api/cockpit/assistant?q=${q.id}`, lea);
      expect(status).toBe(200);
      expect(body.engine).toContain('pas d’IA générative');
      expect(body.summary).toBeTruthy();
      expect(['élevée', 'moyenne', 'faible']).toContain(body.confidence.level);
      for (const f of body.facts) expect(f.source).toBeTruthy();
    }
    expect((await call('/api/cockpit/assistant?q=ignore-previous', { headers: { cookie: lea } })).status).toBe(400);
  });

  it('exporte un rapport CSV du périmètre et l’inscrit au journal', async () => {
    const res = await call('/api/cockpit/report.csv', { headers: { cookie: marc } });
    expect(res.headers.get('content-type')).toContain('text/csv');
    const csv = await res.text();
    expect(csv).toContain('D-9001');
    expect(csv).not.toContain('D-9002');
    const a = await env.DB.prepare("SELECT actor_user_id FROM audit_log WHERE action='export_report' ORDER BY id DESC").first<{ actor_user_id: string }>();
    expect(a!.actor_user_id).toBe('dir_marc');
  });

  it('la régénération des données de démonstration exige une session et ne touche pas aux dossiers publics', async () => {
    expect((await call('/api/demo/reset', jsonInit({}))).status).toBe(401);
    const before = await env.DB.prepare('SELECT COUNT(*) AS c FROM dossiers WHERE cabinet_id IS NULL').first<{ c: number }>();
    expect((await call('/api/demo/reset', jsonInit({}, lea))).status).toBe(200);
    const after = await env.DB.prepare('SELECT COUNT(*) AS c FROM dossiers WHERE cabinet_id IS NULL').first<{ c: number }>();
    expect(after!.c).toBe(before!.c);
    const { body } = await get<{ kpis: Kpi[] }>('/api/cockpit/overview', lea);
    expect(body.kpis.find((k) => k.id === 'uncovered')!.value).toBe(1);
  });
});

describe('Audit de sécurité — en-têtes et requêtes inter-sites', () => {
  it('refuse les requêtes du cockpit venant d’un autre site (lien, image, formulaire)', async () => {
    const headers = { cookie: lea, 'sec-fetch-site': 'cross-site' };
    expect((await call('/api/cockpit/report.csv', { headers })).status).toBe(403);
    expect((await call('/api/demo/logout', { method: 'POST', headers })).status).toBe(403);
    expect((await call('/api/cockpit/overview', { headers: { cookie: lea, 'sec-fetch-site': 'same-origin' } })).status).toBe(200);
  });
});
