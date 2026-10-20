/**
 * Règles métier du dossier (prototype v0.3).
 * Fonctions pures : aucune dépendance à Cloudflare, testables unitairement.
 */

export const TYPES = ['Chauffage', 'Fuite d’eau', 'Éclairage', 'Ascenseur', 'Autre'] as const;
export const STATUSES = ['À qualifier', 'En cours', 'En attente prestataire', 'Résolu'] as const;

export type DossierType = (typeof TYPES)[number];
export type DossierStatus = (typeof STATUSES)[number];

export const LIMITS = { type: 40, status: 40, place: 100, description: 1000, note: 1000 } as const;

export interface NewDossierInput {
  type: DossierType;
  place: string;
  description: string;
}

export interface DossierUpdateInput {
  status: DossierStatus;
  note: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Nettoie une valeur texte : rejette les non-chaînes, retire les espaces, tronque. */
export function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

const isType = (v: string): v is DossierType => (TYPES as readonly string[]).includes(v);
export const isStatus = (v: string): v is DossierStatus => (STATUSES as readonly string[]).includes(v);

export function parseNewDossier(body: unknown): Result<NewDossierInput> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Requête invalide' };
  const b = body as Record<string, unknown>;
  const type = clean(b.type, LIMITS.type);
  const place = clean(b.place, LIMITS.place);
  const description = clean(b.description, LIMITS.description);
  if (!isType(type) || !place || !description) return { ok: false, error: 'Champs manquants ou invalides' };
  return { ok: true, value: { type, place, description } };
}

export function parseDossierUpdate(body: unknown): Result<DossierUpdateInput> {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Requête invalide' };
  const b = body as Record<string, unknown>;
  const status = clean(b.status, LIMITS.status);
  const note = clean(b.note, LIMITS.note);
  if (!isStatus(status)) return { ok: false, error: 'Statut invalide' };
  return { ok: true, value: { status, note } };
}

/** Une mise à jour doit apporter une information : un changement de statut ou une note. */
export function isMeaningfulUpdate(current: string, update: DossierUpdateInput): boolean {
  return Boolean(update.note) || current !== update.status;
}

export function historyText(update: DossierUpdateInput): string {
  return `${update.note || 'Statut modifié'} — statut : ${update.status}`;
}

export const formatRef = (num: number): string => `D-${num}`;

/** Accepte « D-1234 » ; renvoie le numéro ou null. */
export function parseRef(ref: string): number | null {
  const m = /^D-(\d{1,9})$/.exec(ref);
  return m ? Number(m[1]) : null;
}
