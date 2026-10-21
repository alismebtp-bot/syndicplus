/**
 * Fiche de configuration d'une copropriété : qui fait quoi, quand, et avec quelles autorisations.
 * Règle : une autorisation absente, non vérifiée ou mal renseignée vaut « pas d'autorisation ».
 */
import { INCIDENT_TYPES, type Trade } from './catalog';

export interface WeeklySlot {
  /** 1 = lundi … 7 = dimanche */
  days: number[];
  /** « HH:MM », heure de Paris */
  start: string;
  end: string;
}

export interface GuardianConfig {
  name: string;
  schedule: WeeklySlot[];
  /** Démonstration uniquement : force l'état « en service » sans tenir compte des horaires. */
  onDutyOverride?: boolean;
  /** Peut effectuer un constat visuel sans risque. */
  canCheck: boolean;
  /** Peut réaliser le petit entretien prévu dans ses missions. */
  canSmallRepair: boolean;
  /** Types d'incidents autorisés en petit entretien ; vide = tous les types éligibles. */
  smallRepairTypes: string[];
  /** Un petit entretien réalisé par le gardien peut être clôturé sans le gestionnaire. */
  selfCloseSmallRepair: boolean;
}

export interface Preauthorization {
  ceilingHT: number;
  /** Vérifiée = adossée à une décision ou un contrat contrôlé par le gestionnaire. */
  verified: boolean;
  reference: string;
}

export interface ContractConfig {
  id: string;
  provider: string;
  trades: Trade[];
  onCall247: boolean;
  preauthorization: Preauthorization | null;
}

export interface CouncilPresidentConfig {
  name: string;
  delegations: {
    requestQuotes: boolean;
    compareAndAdvise: boolean;
    confirmCompletion: boolean;
    /** Autoriser une dépense : uniquement avec une délégation vérifiée et un plafond. */
    authorizeExpenditure: { ceilingHT: number; verifiedReference: string } | null;
  };
}

export interface BuildingConfig {
  id: string;
  name: string;
  managerName: string;
  guardian: GuardianConfig | null;
  backupGuardian: GuardianConfig | null;
  contracts: ContractConfig[];
  councilPresident: CouncilPresidentConfig | null;
  emergency: { instructions: string; onCallContact: string };
}

export const TRADES: readonly Trade[] = [
  'electricite',
  'plomberie',
  'chauffage',
  'ascenseur',
  'ventilation',
  'fermetures',
  'interphonie',
  'nettoyage',
  'espaces_verts',
  'toiture_facade',
  'nuisibles',
  'irve',
  'photovoltaique',
  'securite_incendie',
  'general',
];

/** Fiche de démonstration (données fictives). */
export const DEMO_BUILDING: BuildingConfig = {
  id: 'copro_vh',
  name: 'Résidence Victor-Hugo (démo)',
  managerName: 'Claire Moreau',
  guardian: {
    name: 'Mme Martin',
    schedule: [
      { days: [1, 2, 3, 4, 5], start: '08:00', end: '12:00' },
      { days: [1, 2, 3, 4, 5], start: '14:00', end: '18:00' },
    ],
    canCheck: true,
    canSmallRepair: true,
    smallRepairTypes: [],
    selfCloseSmallRepair: true,
  },
  backupGuardian: null,
  contracts: [
    { id: 'ctr_elec', provider: 'Élec Services (démo)', trades: ['electricite', 'securite_incendie'], onCall247: false, preauthorization: { ceilingHT: 250, verified: true, reference: 'Contrat 2026-ELEC, art. 4 (démo)' } },
    { id: 'ctr_chauffage', provider: 'Chauffage Plus (démo)', trades: ['chauffage'], onCall247: true, preauthorization: { ceilingHT: 400, verified: true, reference: 'Contrat P2 chaufferie 2025 (démo)' } },
    { id: 'ctr_ascenseur', provider: 'Ascenseurs Durand (démo)', trades: ['ascenseur'], onCall247: true, preauthorization: { ceilingHT: 0, verified: true, reference: 'Contrat maintenance ascenseur (démo)' } },
    { id: 'ctr_plomberie', provider: 'Plomberie Rapide (démo)', trades: ['plomberie'], onCall247: true, preauthorization: null },
  ],
  councilPresident: {
    name: 'M. Bernard',
    delegations: { requestQuotes: true, compareAndAdvise: true, confirmCompletion: true, authorizeExpenditure: null },
  },
  emergency: {
    instructions: 'Mettre les personnes en sécurité, couper si possible l’alimentation concernée sans prendre de risque, appeler les secours (112) si nécessaire.',
    onCallContact: 'Astreinte du cabinet (démo)',
  },
};

// ---------- Validation ----------

type Errors = string[];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null);
const bool = (v: unknown): boolean => v === true;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ELIGIBLE = new Set(INCIDENT_TYPES.filter((x) => x.smallRepairEligible).map((x) => x.id));

function parseGuardian(v: unknown, path: string, errors: Errors): GuardianConfig | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v)) {
    errors.push(`${path} : format invalide`);
    return null;
  }
  const name = str(v.name, 80);
  if (!name) errors.push(`${path}.name : nom requis`);
  const schedule: WeeklySlot[] = [];
  if (Array.isArray(v.schedule)) {
    for (const [i, s] of v.schedule.slice(0, 14).entries()) {
      if (!isObj(s) || !Array.isArray(s.days) || typeof s.start !== 'string' || typeof s.end !== 'string' || !TIME.test(s.start) || !TIME.test(s.end) || s.start >= s.end) {
        errors.push(`${path}.schedule[${i}] : créneau invalide`);
        continue;
      }
      const days = s.days.filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7);
      if (days.length) schedule.push({ days, start: s.start, end: s.end });
    }
  }
  const smallRepairTypes = Array.isArray(v.smallRepairTypes) ? v.smallRepairTypes.filter((x): x is string => typeof x === 'string' && ELIGIBLE.has(x)) : [];
  return {
    name: name ?? 'Gardien',
    schedule,
    ...(typeof v.onDutyOverride === 'boolean' ? { onDutyOverride: v.onDutyOverride } : {}),
    canCheck: bool(v.canCheck),
    canSmallRepair: bool(v.canSmallRepair),
    smallRepairTypes,
    selfCloseSmallRepair: bool(v.selfCloseSmallRepair),
  };
}

function parsePreauth(v: unknown, path: string, errors: Errors): Preauthorization | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v) || typeof v.ceilingHT !== 'number' || !Number.isFinite(v.ceilingHT) || v.ceilingHT < 0 || v.ceilingHT > 1_000_000) {
    errors.push(`${path} : plafond invalide`);
    return null;
  }
  const reference = str(v.reference, 160);
  // Une préautorisation sans référence n'est jamais considérée comme vérifiée.
  return { ceilingHT: Math.round(v.ceilingHT), verified: bool(v.verified) && Boolean(reference), reference: reference ?? '' };
}

export type ConfigResult = { ok: true; value: BuildingConfig; warnings: string[] } | { ok: false; errors: string[] };

export function parseBuildingConfig(raw: unknown): ConfigResult {
  const errors: Errors = [];
  if (!isObj(raw)) return { ok: false, errors: ['Configuration absente ou invalide'] };
  const id = str(raw.id, 60) ?? 'copro';
  const name = str(raw.name, 120);
  if (!name) errors.push('name : nom de la copropriété requis');
  const contracts: ContractConfig[] = [];
  if (Array.isArray(raw.contracts)) {
    for (const [i, c] of raw.contracts.slice(0, 30).entries()) {
      if (!isObj(c)) {
        errors.push(`contracts[${i}] : format invalide`);
        continue;
      }
      const provider = str(c.provider, 120);
      const trades = Array.isArray(c.trades) ? c.trades.filter((x): x is Trade => typeof x === 'string' && (TRADES as readonly string[]).includes(x)) : [];
      if (!provider || trades.length === 0) {
        errors.push(`contracts[${i}] : prestataire et corps de métier requis`);
        continue;
      }
      contracts.push({ id: str(c.id, 60) ?? `ctr_${i}`, provider, trades, onCall247: bool(c.onCall247), preauthorization: parsePreauth(c.preauthorization, `contracts[${i}].preauthorization`, errors) });
    }
  }
  let councilPresident: CouncilPresidentConfig | null = null;
  if (isObj(raw.councilPresident)) {
    const p = raw.councilPresident;
    const d = isObj(p.delegations) ? p.delegations : {};
    let authorizeExpenditure: CouncilPresidentConfig['delegations']['authorizeExpenditure'] = null;
    if (isObj(d.authorizeExpenditure)) {
      const ref = str(d.authorizeExpenditure.verifiedReference, 160);
      const ceiling = d.authorizeExpenditure.ceilingHT;
      if (ref && typeof ceiling === 'number' && Number.isFinite(ceiling) && ceiling > 0 && ceiling <= 1_000_000) {
        authorizeExpenditure = { ceilingHT: Math.round(ceiling), verifiedReference: ref };
      } else {
        errors.push('councilPresident.delegations.authorizeExpenditure : plafond et référence de délégation vérifiée requis');
      }
    }
    councilPresident = {
      name: str(p.name, 80) ?? 'Président du conseil syndical',
      delegations: { requestQuotes: bool(d.requestQuotes), compareAndAdvise: bool(d.compareAndAdvise), confirmCompletion: bool(d.confirmCompletion), authorizeExpenditure },
    };
  }
  const em = isObj(raw.emergency) ? raw.emergency : {};
  const value: BuildingConfig = {
    id,
    name: name ?? 'Copropriété',
    managerName: str(raw.managerName, 80) ?? 'Gestionnaire',
    guardian: parseGuardian(raw.guardian, 'guardian', errors),
    backupGuardian: parseGuardian(raw.backupGuardian, 'backupGuardian', errors),
    contracts,
    councilPresident,
    emergency: {
      instructions: str(em.instructions, 600) ?? DEMO_BUILDING.emergency.instructions,
      onCallContact: str(em.onCallContact, 120) ?? '',
    },
  };
  if (errors.length) return { ok: false, errors };
  return { ok: true, value, warnings: configWarnings(value) };
}

/** Informations manquantes qui empêchent une automatisation sûre (aucune n'est bloquante). */
export function configWarnings(c: BuildingConfig): string[] {
  const w: string[] = [];
  if (!c.guardian) w.push('Aucun gardien renseigné : le petit entretien passe par les contrats ou le gestionnaire.');
  else if (c.guardian.schedule.length === 0 && c.guardian.onDutyOverride === undefined) w.push('Horaires du gardien non renseignés : il est considéré comme hors service.');
  if (c.guardian && !c.backupGuardian) w.push('Aucun remplaçant du gardien : en son absence, le dossier passe aux contrats ou au gestionnaire.');
  if (c.contracts.length === 0) w.push('Aucun contrat de maintenance : toute intervention extérieure nécessite une décision du gestionnaire.');
  for (const k of c.contracts) {
    if (k.preauthorization && !k.preauthorization.verified) w.push(`Préautorisation non vérifiée pour ${k.provider} : aucune affectation automatique.`);
  }
  if (!c.councilPresident) w.push('Président du conseil syndical non renseigné : il ne pourra pas être informé ni consulté.');
  if (!c.emergency.onCallContact) w.push('Contact d’astreinte non renseigné.');
  return w;
}
