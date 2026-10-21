/** Routes /api/procedures/* : calculs sans état (aucune écriture en base, aucun envoi). */
import { findBlocked, findDuplicates, findRecurrences, summarize, type CaseSnapshot } from './automation';
import { INCIDENT_TYPES, PATHWAYS, type Pathway } from './catalog';
import { DEMO_BUILDING, parseBuildingConfig, type BuildingConfig } from './config';
import { compareQuotes, presidentCan, type CouncilAction, type Quote } from './council';
import { afterGuardianCannotResolve, routeIncident, type ReporterRole } from './engine';

type Json = (data: unknown, status?: number) => Response;

const REPORTERS: readonly ReporterRole[] = ['resident', 'guardian', 'council_president', 'manager', 'contractor'];
const ACTIONS: readonly CouncilAction[] = [
  'declare_problem',
  'record_observation',
  'request_verification',
  'request_quote',
  'compare_and_advise',
  'confirm_apparent_completion',
  'issue_reserves',
  'authorize_expenditure',
  'issue_purchase_order',
];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function signals(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').map((s) => s.trim().slice(0, 120)).filter(Boolean).slice(0, 10) : [];
}

function config(body: Record<string, unknown>): { ok: true; value: BuildingConfig; warnings: string[] } | { ok: false; errors: string[] } {
  if (body.config === undefined) return parseBuildingConfig(DEMO_BUILDING);
  return parseBuildingConfig(body.config);
}

const PATHWAY_IDS = new Set(Object.keys(PATHWAYS));
const MAX_CASES = 60;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ms = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e14 ? v : null);

function snapshot(v: unknown): CaseSnapshot | null {
  if (!isObj(v)) return null;
  const createdAt = ms(v.createdAt);
  const updatedAt = ms(v.updatedAt) ?? createdAt;
  const id = text(v.id, 40);
  const typeId = text(v.typeId, 60);
  if (!id || !typeId || !createdAt || !updatedAt) return null;
  const pathway = typeof v.pathway === 'string' && PATHWAY_IDS.has(v.pathway) ? (v.pathway as Pathway) : null;
  const deadline = typeof v.deadlineHours === 'number' && Number.isFinite(v.deadlineHours) && v.deadlineHours >= 0 && v.deadlineHours <= 10_000 ? v.deadlineHours : null;
  const list = (x: unknown, n: number, max: number) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(-n).map((s) => s.slice(0, max)) : []);
  return { id, typeId, location: text(v.location, 100), description: text(v.description, 300), status: text(v.status, 30), statusLabel: text(v.statusLabel, 60) || undefined, pathway, createdAt, updatedAt, deadlineHours: deadline, nextActor: text(v.nextActor, 120), history: list(v.history, 12, 200), missing: list(v.missing, 5, 200) };
}

function snapshots(v: unknown): CaseSnapshot[] {
  return Array.isArray(v) ? v.slice(0, MAX_CASES).map(snapshot).filter((x): x is CaseSnapshot => x !== null) : [];
}

function amount(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 10_000_000 ? v : undefined;
}

export async function handleProcedures(request: Request, path: string, body: () => Promise<unknown>, json: Json): Promise<Response | null> {
  if (path === '/api/procedures/catalog' && request.method === 'GET') {
    return json({ pathways: PATHWAYS, types: INCIDENT_TYPES });
  }
  if (path === '/api/procedures/demo-config' && request.method === 'GET') {
    return json(DEMO_BUILDING);
  }
  if (request.method !== 'POST' || !path.startsWith('/api/procedures/')) return null;

  const b = await body();
  if (!isObj(b)) return json({ error: 'Requête invalide' }, 400);

  if (path === '/api/procedures/duplicates') {
    const inc = isObj(b.incoming) ? b.incoming : null;
    const typeId = inc ? text(inc.typeId, 60) : '';
    if (!inc || !typeId) return json({ error: 'incoming.typeId requis' }, 400);
    const now = ms(b.now) ?? Date.now();
    return json({ candidates: findDuplicates({ typeId, location: text(inc.location, 100), description: text(inc.description, 300) }, snapshots(b.cases), now) });
  }

  if (path === '/api/procedures/review') {
    const now = ms(b.now) ?? Date.now();
    const cs = snapshots(b.cases);
    return json({ blocked: findBlocked(cs, now), recurrences: findRecurrences(cs, now), summaries: Object.fromEntries(cs.map((c) => [c.id, summarize(c)])) });
  }

  if (path === '/api/procedures/validate-config') {
    const c = parseBuildingConfig(b.config);
    return c.ok ? json({ ok: true, config: c.value, warnings: c.warnings }) : json({ ok: false, errors: c.errors }, 400);
  }

  if (path === '/api/procedures/route') {
    const c = config(b);
    if (!c.ok) return json({ error: 'Configuration de l’immeuble invalide', details: c.errors }, 400);
    const typeId = typeof b.typeId === 'string' ? b.typeId.slice(0, 60) : '';
    const reportedBy = REPORTERS.find((r) => r === b.reportedBy);
    if (!typeId || !reportedBy) return json({ error: 'typeId et reportedBy requis' }, 400);
    const now = typeof b.now === 'string' && !Number.isNaN(Date.parse(b.now)) ? new Date(b.now) : new Date();
    const decision = routeIncident({ typeId, reportedBy, dangerSignals: signals(b.dangerSignals), now }, c.value);
    return json({ decision, warnings: c.warnings });
  }

  if (path === '/api/procedures/after-guardian') {
    const c = config(b);
    if (!c.ok) return json({ error: 'Configuration de l’immeuble invalide', details: c.errors }, 400);
    const typeId = typeof b.typeId === 'string' ? b.typeId.slice(0, 60) : '';
    if (!typeId) return json({ error: 'typeId requis' }, 400);
    return json({ decision: afterGuardianCannotResolve(typeId, c.value, amount(b.estimateHT), signals(b.dangerSignals)) });
  }

  if (path === '/api/procedures/president-permission') {
    const c = config(b);
    if (!c.ok) return json({ error: 'Configuration de l’immeuble invalide', details: c.errors }, 400);
    const action = ACTIONS.find((a) => a === b.action);
    if (!action) return json({ error: 'Action inconnue' }, 400);
    return json({ permission: presidentCan(action, c.value, amount(b.amountHT)) });
  }

  if (path === '/api/procedures/compare-quotes') {
    if (!Array.isArray(b.quotes)) return json({ error: 'quotes requis' }, 400);
    const quotes: Quote[] = b.quotes.slice(0, 10).filter(isObj).map((q) => ({
      company: typeof q.company === 'string' ? q.company.trim().slice(0, 120) : '',
      amountHT: amount(q.amountHT) ?? Number.NaN,
      vatRate: typeof q.vatRate === 'number' && [0, 5.5, 10, 20].includes(q.vatRate) ? q.vatRate : 20,
      delayDays: typeof q.delayDays === 'number' && Number.isInteger(q.delayDays) && q.delayDays >= 0 && q.delayDays <= 3650 ? q.delayDays : null,
      scope: typeof q.scope === 'string' ? q.scope.trim().slice(0, 500) : '',
      warranty: typeof q.warranty === 'string' ? q.warranty.trim().slice(0, 200) : '',
    }));
    return json({ comparison: compareQuotes(quotes) });
  }

  return json({ error: 'Introuvable' }, 404);
}
