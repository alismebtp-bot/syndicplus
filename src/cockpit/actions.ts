/**
 * Validation des actions de supervision (pure). Listes fermées, longueurs bornées.
 * Les actions sensibles exigent une confirmation explicite (confirm: true).
 */
type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
export type Parsed<T> = Ok<T> | Err;

const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const err = (error: string): Err => ({ ok: false, error });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function text(v: unknown, max: number, required: boolean, field: string): Parsed<string> {
  if (v === undefined || v === null || v === '') return required ? err(`${field} : champ obligatoire.`) : ok('');
  if (typeof v !== 'string') return err(`${field} : texte attendu.`);
  const t = v.trim();
  if (required && !t) return err(`${field} : champ obligatoire.`);
  if (t.length > max) return err(`${field} : ${max} caractères maximum.`);
  return ok(t);
}
const ID = /^[a-z0-9_]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DossierAction =
  | { action: 'request_update'; message: string }
  | { action: 'request_verification'; message: string }
  | { action: 'flag_priority'; flagged: boolean; message: string }
  | { action: 'reassign'; to: string; reason: string }
  | { action: 'prepare_decision'; kind: 'quote_approval' | 'expenditure' | 'closure' | 'procedure_exception' | 'other'; label: string; amountHt: number | null; authority: string }
  | { action: 'schedule_review'; dueOn: string; note: string };

export const SENSITIVE = new Set(['reassign', 'prepare_decision', 'set_replacement']);
const DECISION_KINDS = ['quote_approval', 'expenditure', 'closure', 'procedure_exception', 'other'] as const;

export function validDate(v: string, nowMs: number, maxDays = 366): boolean {
  if (!DATE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v) return false;
  const today = Date.parse(`${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00Z`);
  return t >= today && t <= today + maxDays * 86_400_000;
}

export function parseDossierAction(body: unknown, nowMs: number): Parsed<DossierAction> {
  if (!isObj(body)) return err('Requête invalide.');
  const a = body.action;
  if (typeof a === 'string' && SENSITIVE.has(a) && body.confirm !== true) return err('Confirmation requise pour cette action.');
  switch (a) {
    case 'request_update':
    case 'request_verification': {
      const m = text(body.message, 500, false, 'Message');
      return m.ok ? ok({ action: a, message: m.value }) : m;
    }
    case 'flag_priority': {
      if (typeof body.flagged !== 'boolean') return err('Indiquez si le dossier est prioritaire.');
      const m = text(body.message, 500, false, 'Message');
      return m.ok ? ok({ action: a, flagged: body.flagged, message: m.value }) : m;
    }
    case 'reassign': {
      if (typeof body.to !== 'string' || !ID.test(body.to)) return err('Gestionnaire invalide.');
      const r = text(body.reason, 300, true, 'Motif');
      return r.ok ? ok({ action: a, to: body.to, reason: r.value }) : r;
    }
    case 'prepare_decision': {
      if (typeof body.kind !== 'string' || !(DECISION_KINDS as readonly string[]).includes(body.kind)) return err('Type de décision invalide.');
      const l = text(body.label, 200, true, 'Objet');
      if (!l.ok) return l;
      const au = text(body.authority, 120, true, 'Instance habilitée');
      if (!au.ok) return au;
      let amount: number | null = null;
      if (body.amountHt !== undefined && body.amountHt !== null && body.amountHt !== '') {
        if (typeof body.amountHt !== 'number' || !Number.isInteger(body.amountHt) || body.amountHt < 0 || body.amountHt > 10_000_000) return err('Montant HT invalide (euros entiers).');
        amount = body.amountHt;
      }
      return ok({ action: a, kind: body.kind as (typeof DECISION_KINDS)[number], label: l.value, amountHt: amount, authority: au.value });
    }
    case 'schedule_review': {
      if (typeof body.dueOn !== 'string' || !validDate(body.dueOn, nowMs)) return err('Date de revue invalide (aujourd’hui à un an maximum).');
      const n = text(body.note, 300, false, 'Note');
      return n.ok ? ok({ action: a, dueOn: body.dueOn, note: n.value }) : n;
    }
    default:
      return err('Action inconnue.');
  }
}

export function parseReplacement(body: unknown): Parsed<{ replacement: string | null }> {
  if (!isObj(body)) return err('Requête invalide.');
  if (body.confirm !== true) return err('Confirmation requise pour cette action.');
  if (body.replacement === null) return ok({ replacement: null });
  if (typeof body.replacement !== 'string' || !ID.test(body.replacement)) return err('Remplaçant invalide.');
  return ok({ replacement: body.replacement });
}

export function parseReview(body: unknown, nowMs: number): Parsed<{ entity: 'copro' | 'contract' | 'provider'; entityId: string; dueOn: string; note: string }> {
  if (!isObj(body)) return err('Requête invalide.');
  if (body.entity !== 'copro' && body.entity !== 'contract' && body.entity !== 'provider') return err('Élément invalide.');
  if (typeof body.entityId !== 'string' || !ID.test(body.entityId)) return err('Élément invalide.');
  if (typeof body.dueOn !== 'string' || !validDate(body.dueOn, nowMs)) return err('Date de revue invalide (aujourd’hui à un an maximum).');
  const n = text(body.note, 300, false, 'Note');
  if (!n.ok) return n;
  return ok({ entity: body.entity, entityId: body.entityId, dueOn: body.dueOn, note: n.value });
}
