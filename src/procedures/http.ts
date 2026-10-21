/** Routes /api/procedures/* : calculs sans état (aucune écriture en base, aucun envoi). */
import { INCIDENT_TYPES, PATHWAYS } from './catalog';
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
