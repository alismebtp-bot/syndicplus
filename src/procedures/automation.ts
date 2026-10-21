/**
 * Premières automatisations (règles déterministes, sans modèle d'IA) :
 * doublons, dossiers bloqués, relances préparées, résumé, pannes récurrentes.
 * Toutes produisent des PROPOSITIONS : rien n'est fusionné, envoyé ou décidé automatiquement.
 */
import { getIncidentType, type Pathway } from './catalog';

export interface CaseSnapshot {
  id: string;
  typeId: string;
  location: string;
  description: string;
  status: string;
  /** Libellé lisible du statut (sinon le code est utilisé). */
  statusLabel?: string;
  pathway: Pathway | null;
  createdAt: number;
  updatedAt: number;
  /** Délai du parcours en heures (0 = immédiat). */
  deadlineHours: number | null;
  /** Qui doit agir ensuite (libellé lisible). */
  nextActor: string;
  history: string[];
  missing: string[];
}

const HOUR = 3_600_000;
const CLOSED = new Set(['closed']);

// ---------- Doublons ----------

const STOP = new Set(['le', 'la', 'les', 'de', 'du', 'des', 'au', 'aux', 'un', 'une', 'et', 'en', 'dans', 'sur', 'a', 'à', 'd', 'l', 'etage', 'étage', 'e', 'eme', 'ème', 'er']);

/** Mots significatifs, sans accents ni casse ; les numéros d'étage/porte sont conservés. */
export function tokens(text: string): Set<string> {
  const norm = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/(\d+)\s*(?:er|e|eme|ème)\b/g, '$1')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP.has(w));
  return new Set(norm);
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const x of a) if (b.has(x)) common++;
  return common / Math.min(a.size, b.size);
}

export interface DuplicateCandidate {
  id: string;
  score: number;
  reasons: string[];
}

export function findDuplicates(incoming: Pick<CaseSnapshot, 'typeId' | 'location' | 'description'>, open: CaseSnapshot[], nowMs: number, windowHours = 72): DuplicateCandidate[] {
  const inType = getIncidentType(incoming.typeId);
  const inLoc = tokens(incoming.location);
  const inDesc = tokens(incoming.description);
  const out: DuplicateCandidate[] = [];
  for (const c of open) {
    if (CLOSED.has(c.status)) continue;
    if (nowMs - c.createdAt > windowHours * HOUR) continue;
    const sameType = c.typeId === incoming.typeId;
    const sameTrade = !sameType && inType && getIncidentType(c.typeId)?.trade === inType.trade;
    if (!sameType && !sameTrade) continue;
    const loc = overlap(inLoc, tokens(c.location));
    const desc = overlap(inDesc, tokens(c.description));
    const score = Math.round(((sameType ? 0.45 : 0.25) + loc * 0.4 + desc * 0.15) * 100) / 100;
    if (score < 0.6 || loc < 0.5) continue;
    const reasons = [sameType ? 'Même type d’incident' : 'Même corps de métier'];
    reasons.push(loc === 1 ? 'Même emplacement' : 'Emplacement proche');
    if (desc >= 0.5) reasons.push('Description semblable');
    const ago = Math.round((nowMs - c.createdAt) / HOUR);
    reasons.push(ago < 1 ? 'Signalé il y a moins d’une heure' : `Signalé il y a ${ago} h`);
    out.push({ id: c.id, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ---------- Dossiers bloqués et relances ----------

export interface BlockedCase {
  id: string;
  overdueHours: number;
  nextActor: string;
  reminder: { to: string; subject: string; body: string };
}

/** P5 : sans nouvelle action au-delà de 2 h, le dossier est considéré bloqué. */
const P5_GRACE_HOURS = 2;
/** Une vérification ou des réserves non traitées au-delà de 72 h bloquent aussi la clôture. */
const VERIFICATION_HOURS = 72;

function deadlineFor(c: CaseSnapshot): number | null {
  if (['verification', 'reserved'].includes(c.status)) return VERIFICATION_HOURS;
  if (c.deadlineHours === null) return null;
  return c.pathway === 'P5' ? Math.max(c.deadlineHours, P5_GRACE_HOURS) : c.deadlineHours;
}

export function findBlocked(cases: CaseSnapshot[], nowMs: number): BlockedCase[] {
  const out: BlockedCase[] = [];
  for (const c of cases) {
    if (CLOSED.has(c.status)) continue;
    const limit = deadlineFor(c);
    if (limit === null) continue;
    const idle = (nowMs - c.updatedAt) / HOUR;
    if (idle <= limit) continue;
    const overdueHours = Math.round(idle - limit);
    const label = getIncidentType(c.typeId)?.label ?? 'Incident';
    out.push({
      id: c.id,
      overdueHours,
      nextActor: c.nextActor,
      reminder: {
        to: c.nextActor,
        subject: `Relance — ${label} (${c.location})`,
        body:
          `Bonjour,\n\nLe dossier ${c.id} (${label}, ${c.location}) attend une action de votre part depuis ${Math.round(idle)} h ` +
          `(délai prévu : ${limit} h).\nStatut actuel : ${c.statusLabel || c.status}.\n` +
          (c.missing.length ? `Informations manquantes : ${c.missing.join(' ; ')}.\n` : '') +
          `Merci d’indiquer la suite donnée ou la date d’intervention prévue.\n\nCordialement`,
      },
    });
  }
  return out.sort((a, b) => b.overdueHours - a.overdueHours);
}

// ---------- Résumé ----------

export function summarize(c: CaseSnapshot): string[] {
  const t = getIncidentType(c.typeId);
  const lines = [`${t?.label ?? 'Incident'} — ${c.location}${c.pathway ? ` · parcours ${c.pathway}` : ''}`, `Statut : ${c.statusLabel || c.status} ; prochaine action : ${c.nextActor || 'à définir'}.`];
  const key = c.history.filter((h) => /réserves|reprise|devis|avis|danger|urgence|affect|clôtur|constat/i.test(h)).slice(-3);
  if (key.length) lines.push('Derniers faits marquants : ' + key.join(' · '));
  if (c.missing.length) lines.push('Points ouverts : ' + c.missing.join(' ; '));
  return lines;
}

// ---------- Pannes récurrentes ----------

export interface Recurrence {
  typeId: string;
  location: string;
  count: number;
  ids: string[];
  message: string;
}

export function findRecurrences(cases: CaseSnapshot[], nowMs: number, days = 90, threshold = 3): Recurrence[] {
  const recent = cases.filter((c) => nowMs - c.createdAt <= days * 24 * HOUR);
  const groups: CaseSnapshot[][] = [];
  for (const c of recent) {
    const g = groups.find((x) => x[0]!.typeId === c.typeId && overlap(tokens(x[0]!.location), tokens(c.location)) >= 0.5);
    if (g) g.push(c);
    else groups.push([c]);
  }
  return groups
    .filter((g) => g.length >= threshold)
    .map((g) => {
      const label = getIncidentType(g[0]!.typeId)?.label ?? 'Incident';
      return {
        typeId: g[0]!.typeId,
        location: g[0]!.location,
        count: g.length,
        ids: g.map((c) => c.id),
        message: `${label} : ${g.length} signalements en ${days} jours (${g[0]!.location}). Analyse de la cause et de l’équipement recommandée.`,
      };
    });
}
