/**
 * Moteur de parcours P1–P6.
 * Règles pures et déterministes : il PROPOSE un circuit et indique ce qui est autorisé par la fiche de l'immeuble.
 * Il n'envoie rien, ne commande rien et n'engage jamais une dépense non préautorisée et vérifiée.
 */
import { getIncidentType, PATHWAYS, type IncidentType, type Pathway } from './catalog';
import type { BuildingConfig, ContractConfig, GuardianConfig } from './config';
import { isOnDuty } from './schedule';

export type ReporterRole = 'resident' | 'guardian' | 'council_president' | 'manager' | 'contractor';
export type FirstActor = 'guardian' | 'backup_guardian' | 'contractor' | 'manager' | 'emergency';
export type NotifyTarget = 'manager' | 'council_president' | 'guardian' | 'backup_guardian' | 'on_call_contractor' | 'affected_residents';
export type Verifier = 'guardian' | 'council_president' | 'manager';

export interface RouteInput {
  typeId: string;
  /** Signaux de danger détectés dans le signalement (analyse guidée ou déclaration « danger immédiat »). */
  dangerSignals: string[];
  reportedBy: ReporterRole;
  now: Date;
}

export interface ContractorRef {
  contractId: string;
  provider: string;
}

export interface RouteDecision {
  typeId: string;
  typeLabel: string;
  pathway: Pathway;
  pathwayLabel: string;
  firstActor: FirstActor;
  /** Nom de la personne ou de l'entreprise à qui le dossier est adressé en premier. */
  firstActorName: string;
  contractor: ContractorRef | null;
  /** true uniquement si une préautorisation VÉRIFIÉE couvre l'intervention. */
  autoAssign: boolean;
  /** Rôle du gestionnaire : décider, être informé, ou rien d'immédiat. */
  managerRole: 'decision' | 'information' | 'none';
  councilRole: 'none' | 'information' | 'consultation';
  /** Personnes prévenues en parallèle (urgences notamment). */
  notify: NotifyTarget[];
  /** Le gardien peut résoudre lui-même (petit entretien autorisé). */
  guardianCanResolve: boolean;
  nextAction: string;
  deadlineHours: number;
  fallback: string;
  verifier: Verifier;
  reasons: string[];
  missing: string[];
}

const DEADLINE_HOURS: Record<Pathway, number> = { P1: 48, P2: 24, P3: 72, P4: 48, P5: 0, P6: 168 };

function findContract(config: BuildingConfig, type: IncidentType): ContractConfig | null {
  return config.contracts.find((c) => c.trades.includes(type.trade)) ?? null;
}

function guardianMayRepair(g: GuardianConfig, type: IncidentType): boolean {
  if (!g.canSmallRepair || !type.smallRepairEligible) return false;
  return g.smallRepairTypes.length === 0 || g.smallRepairTypes.includes(type.id);
}

/** Qui confirme la bonne exécution apparente (jamais une réception juridique). */
export function verifierFor(pathway: Pathway, config: BuildingConfig): Verifier {
  const presidentCan = Boolean(config.councilPresident?.delegations.confirmCompletion);
  const guardianCan = Boolean(config.guardian?.canCheck);
  if (pathway === 'P1' || pathway === 'P2') return guardianCan ? 'guardian' : presidentCan ? 'council_president' : 'manager';
  if (pathway === 'P3' || pathway === 'P6') return presidentCan ? 'council_president' : guardianCan ? 'guardian' : 'manager';
  return 'manager';
}

function councilRoleFor(pathway: Pathway, type: IncidentType, config: BuildingConfig): RouteDecision['councilRole'] {
  if (!config.councilPresident) return 'none';
  if (pathway === 'P5') return 'information';
  if (pathway === 'P3' || pathway === 'P6') {
    const d = config.councilPresident.delegations;
    return d.requestQuotes || d.compareAndAdvise ? 'consultation' : 'information';
  }
  return type.collective ? 'information' : 'none';
}

export function routeIncident(input: RouteInput, config: BuildingConfig): RouteDecision {
  const type = getIncidentType(input.typeId) ?? getIncidentType('autre')!;
  const reasons: string[] = [];
  const missing: string[] = [];
  if (!getIncidentType(input.typeId)) reasons.push('Type d’incident inconnu : qualification manuelle nécessaire.');

  const danger = input.dangerSignals.filter((s) => s.trim()).slice(0, 10);
  const pathway: Pathway = danger.length ? 'P5' : type.pathway;
  if (danger.length && type.pathway !== 'P5') reasons.push(`Danger signalé (${danger.join(' ; ')}) : le parcours ${type.pathway} bascule en urgence P5.`);
  else reasons.push(`${type.label} : parcours ${pathway} — ${PATHWAYS[pathway].label.toLowerCase()} par défaut.`);

  const guardianOnDuty = isOnDuty(config.guardian, input.now);
  const backupOnDuty = isOnDuty(config.backupGuardian, input.now);
  const contract = findContract(config, type);
  const president = config.councilPresident;

  const base = {
    typeId: type.id,
    typeLabel: type.label,
    pathway,
    pathwayLabel: PATHWAYS[pathway].label,
    deadlineHours: DEADLINE_HOURS[pathway],
    verifier: verifierFor(pathway, config),
    councilRole: councilRoleFor(pathway, type, config),
    reasons,
    missing,
  };

  // ---------- P5 : urgence — ne jamais attendre le gardien ----------
  if (pathway === 'P5') {
    const notify: NotifyTarget[] = ['manager'];
    if (president) notify.push('council_president');
    else missing.push('Président du conseil syndical non renseigné : il ne peut pas être prévenu.');
    if (guardianOnDuty) notify.push('guardian');
    else if (backupOnDuty) notify.push('backup_guardian');
    const onCall = contract?.onCall247 ? contract : null;
    if (onCall) notify.push('on_call_contractor');
    else missing.push(`Aucune astreinte sous contrat pour « ${type.label} » : contacter l’astreinte du cabinet ou les secours.`);
    if (type.collective) notify.push('affected_residents');
    reasons.push('Urgence : mise en sécurité immédiate, alertes envoyées en parallèle sans attendre de réponse.');
    return {
      ...base,
      firstActor: 'emergency',
      firstActorName: onCall ? `${onCall.provider} (astreinte)` : config.emergency.onCallContact || 'Secours / astreinte',
      contractor: onCall ? { contractId: onCall.id, provider: onCall.provider } : null,
      autoAssign: false,
      managerRole: 'information',
      notify,
      guardianCanResolve: false,
      nextAction: config.emergency.instructions,
      fallback: 'Si personne ne répond : appeler les secours (112) et l’astreinte du cabinet.',
    };
  }

  // ---------- P1 : petit entretien — gardien en premier ----------
  if (pathway === 'P1') {
    const reporterIsGuardian = input.reportedBy === 'guardian';
    const g = config.guardian;
    const useGuardian = g && g.canCheck && (guardianOnDuty || reporterIsGuardian);
    const useBackup = !useGuardian && config.backupGuardian?.canCheck && backupOnDuty;
    if (useGuardian || useBackup) {
      const who = (useGuardian ? g : config.backupGuardian)!;
      const canResolve = guardianMayRepair(who, type);
      reasons.push(useGuardian ? `${who.name} est en service et autorisé(e) à constater.` : `Gardien absent : remplaçant(e) ${who.name} en service.`);
      reasons.push(canResolve ? 'Petit entretien prévu dans ses missions : résolution directe possible.' : 'Constat seulement : la réparation n’entre pas dans ses missions.');
      return {
        ...base,
        firstActor: useGuardian ? 'guardian' : 'backup_guardian',
        firstActorName: who.name,
        contractor: null,
        autoAssign: false,
        managerRole: 'none',
        notify: [],
        guardianCanResolve: canResolve,
        nextAction: canResolve
          ? 'Vérifier sur place et réparer si c’est sans risque ; sinon indiquer « prestataire nécessaire ».'
          : 'Faire un constat sans risque et indiquer si un prestataire est nécessaire.',
        fallback: 'Si le gardien ne peut pas résoudre : contrat préautorisé, sinon décision du gestionnaire.',
      };
    }
    if (!g) missing.push('Aucun gardien renseigné.');
    else if (!g.canCheck) missing.push('Le constat ne figure pas dans les missions du gardien.');
    else reasons.push(`${g.name} est hors service : le dossier ne l’attend pas.`);
    return { ...base, ...withoutGuardian(type, config, reasons, missing) };
  }

  // ---------- P2 : maintenance sous contrat ----------
  if (pathway === 'P2') {
    if (contract) {
      const auto = Boolean(contract.preauthorization?.verified);
      reasons.push(`Contrat de maintenance : ${contract.provider}.`);
      reasons.push(auto ? `Intervention couverte par une préautorisation vérifiée (${contract.preauthorization!.reference}).` : 'Pas de préautorisation vérifiée : l’affectation est préparée, le gestionnaire valide.');
      return {
        ...base,
        firstActor: auto ? 'contractor' : 'manager',
        firstActorName: auto ? contract.provider : config.managerName,
        contractor: { contractId: contract.id, provider: contract.provider },
        autoAssign: auto,
        managerRole: auto ? 'information' : 'decision',
        notify: type.collective ? ['affected_residents'] : [],
        guardianCanResolve: false,
        nextAction: auto ? `Intervention de ${contract.provider} dans le cadre du contrat.` : `Valider l’affectation préparée pour ${contract.provider}.`,
        fallback: 'Prestataire indisponible ou hors contrat : décision du gestionnaire.',
      };
    }
    missing.push(`Aucun contrat de maintenance pour « ${type.label} ».`);
    return {
      ...base,
      firstActor: 'manager',
      firstActorName: config.managerName,
      contractor: null,
      autoAssign: false,
      managerRole: 'decision',
      notify: [],
      guardianCanResolve: false,
      nextAction: 'Choisir un prestataire ou demander des devis.',
      fallback: 'Sans décision dans le délai : relance du gestionnaire.',
    };
  }

  // ---------- P3 / P4 / P6 : décision humaine, constat et consultation ----------
  const constat = config.guardian?.canCheck && guardianOnDuty;
  const presidentLeads = pathway !== 'P4' && Boolean(president?.delegations.requestQuotes);
  const next: Record<'P3' | 'P4' | 'P6', string> = {
    P3: presidentLeads ? 'Constat puis demande de devis (le président du CS peut solliciter les entreprises) ; décision par une personne habilitée.' : 'Constat puis demande de devis ; décision par une personne habilitée.',
    P4: 'Constat, mesures conservatoires, puis déclaration et suivi assurance par le gestionnaire.',
    P6: 'Préparer la consultation et les devis ; les décisions relèvent de l’assemblée générale ou des délégations en vigueur.',
  };
  if (constat) reasons.push(`Constat préalable possible par ${config.guardian!.name}.`);
  reasons.push(pathway === 'P4' ? 'Sinistre : traitement administratif et assurantiel par le gestionnaire.' : 'Aucun engagement de travaux sans devis et autorisation.');
  return {
    ...base,
    firstActor: 'manager',
    firstActorName: config.managerName,
    contractor: null,
    autoAssign: false,
    managerRole: 'decision',
    notify: base.councilRole !== 'none' ? ['council_president'] : [],
    guardianCanResolve: false,
    nextAction: next[pathway as 'P3' | 'P4' | 'P6'],
    fallback: 'Dossier sans action dans le délai : relance automatique proposée.',
  };
}

function withoutGuardian(type: IncidentType, config: BuildingConfig, reasons: string[], missing: string[]) {
  const r = resolveWithoutGuardian(type, config, undefined);
  reasons.push(...r.reasons);
  missing.push(...r.missing);
  return {
    firstActor: r.next === 'contractor' ? ('contractor' as const) : ('manager' as const),
    firstActorName: r.next === 'contractor' ? r.contractor!.provider : config.managerName,
    contractor: r.contractor,
    autoAssign: r.autoAssign,
    managerRole: r.next === 'contractor' ? ('information' as const) : ('decision' as const),
    notify: [] as NotifyTarget[],
    guardianCanResolve: false,
    nextAction: r.nextAction,
    fallback: 'Sans décision dans le délai : relance du gestionnaire.',
  };
}

export interface AfterGuardianDecision {
  next: 'contractor' | 'manager';
  contractor: ContractorRef | null;
  autoAssign: boolean;
  nextAction: string;
  reasons: string[];
  missing: string[];
}

function resolveWithoutGuardian(type: IncidentType, config: BuildingConfig, estimateHT: number | undefined): AfterGuardianDecision {
  const contract = findContract(config, type);
  const reasons: string[] = [];
  const missing: string[] = [];
  if (!contract) {
    missing.push(`Aucun contrat pour « ${type.label} ».`);
    return { next: 'manager', contractor: null, autoAssign: false, nextAction: 'Décider de l’intervention : choisir un prestataire ou demander un devis.', reasons, missing };
  }
  const ref = { contractId: contract.id, provider: contract.provider };
  const pre = contract.preauthorization;
  if (!pre?.verified) {
    reasons.push(`Contrat ${contract.provider} sans préautorisation vérifiée.`);
    return { next: 'manager', contractor: ref, autoAssign: false, nextAction: `Valider l’affectation préparée pour ${contract.provider}.`, reasons, missing };
  }
  if (estimateHT === undefined || !Number.isFinite(estimateHT) || estimateHT < 0) {
    missing.push('Montant estimé inconnu : impossible de vérifier le plafond préautorisé.');
    return { next: 'manager', contractor: ref, autoAssign: false, nextAction: `Confirmer le montant puis valider l’affectation préparée pour ${contract.provider}.`, reasons, missing };
  }
  if (estimateHT > pre.ceilingHT) {
    reasons.push(`Estimation ${estimateHT} € HT au-delà du plafond préautorisé (${pre.ceilingHT} € HT) : devis et décision requis.`);
    return { next: 'manager', contractor: ref, autoAssign: false, nextAction: 'Demander un devis et décider.', reasons, missing };
  }
  reasons.push(`Estimation ${estimateHT} € HT dans le plafond préautorisé de ${pre.ceilingHT} € HT (${pre.reference}).`);
  return { next: 'contractor', contractor: ref, autoAssign: true, nextAction: `Intervention de ${contract.provider} dans le cadre de la préautorisation ; le gestionnaire est informé.`, reasons, missing };
}

/** Le gardien ne peut pas résoudre : contrat préautorisé et vérifié, sinon décision du gestionnaire. */
export function afterGuardianCannotResolve(typeId: string, config: BuildingConfig, estimateHT?: number, dangerSignals: string[] = []): AfterGuardianDecision {
  const type = getIncidentType(typeId) ?? getIncidentType('autre')!;
  if (dangerSignals.some((s) => s.trim())) {
    return { next: 'manager', contractor: null, autoAssign: false, nextAction: 'Danger signalé : appliquer la procédure d’urgence.', reasons: ['Un danger interdit toute affectation automatique.'], missing: [] };
  }
  return resolveWithoutGuardian(type, config, estimateHT);
}
