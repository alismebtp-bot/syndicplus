/** Moteur de procédure de démonstration : suggestions, jamais des autorisations légales. */
export type IncidentKind = 'lighting' | 'minor_leak' | 'collective_heating' | 'major_leak' | 'other';
export type Actor = 'guardian' | 'manager' | 'contractor' | 'emergency';
export type Notice = 'council_summary' | 'council_priority' | 'affected_residents';
export interface ProcedureInput {
  kind: IncidentKind;
  danger: boolean;
  guardianAvailable: boolean;
  /** Distinguishes actual working hours from mere presence in the building. */
  guardianOnDuty?: boolean;
  guardianScopeIncludesCheck: boolean;
  /** Permission explicite : petit entretien non dangereux dans les missions du gardien. */
  guardianCanRepair?: boolean;
  contractedProviderAvailable: boolean;
  guardianTimeoutMinutes?: number;
  guardianBackupConfigured?: boolean;
  emergencyContractConfigured?: boolean;
}
export interface RouteProposal {
  firstActor: Actor;
  notify: Notice[];
  decisionRequiredFrom: 'manager' | 'none_for_preapproved_action';
  nextAction: string;
  fallbackActor: Actor;
  reason: string[];
  requiresHumanReview: boolean;
  guardianCanCompleteLocally?: boolean;
  onGuardianCannotResolve?: 'contractor_after_manager_approval' | 'manager_review';
  urgentNotifications?: readonly ('manager' | 'council_president' | 'guardian')[];
  mode?: 'normal' | 'emergency';
  fallbackProcedure?: string;
}
export function proposeRoute(input: ProcedureInput): RouteProposal {
  if (input.danger || input.kind === 'major_leak') {
    return {
      firstActor: 'emergency',
      mode: 'emergency',
      fallbackProcedure: input.emergencyContractConfigured ? 'Astreinte contractuelle configurée (à déclencher selon autorisation)' : 'Escalade immédiate vers le gestionnaire / contacts de secours configurés',
      notify: ['council_priority', 'affected_residents'],
      urgentNotifications: input.guardianAvailable && input.guardianOnDuty !== false
        ? ['manager', 'council_president', 'guardian']
        : ['manager', 'council_president'],
      decisionRequiredFrom: 'manager',
      nextAction: input.guardianAvailable && input.guardianOnDuty !== false
        ? 'Déclencher la procédure d’urgence sans délai, alerter simultanément gardien en service, gestionnaire et président du conseil syndical ; intervention qualifiée si nécessaire.'
        : 'Déclencher la procédure d’urgence sans délai, prévenir gestionnaire et président du conseil syndical ; appliquer le relais/astreinte défini en l’absence du gardien.',
      fallbackActor: 'manager',
      reason: ['Danger ou dommages majeurs possibles : escalade prioritaire'],
      requiresHumanReview: true,
    };
  }
  if (input.kind === 'minor_leak') {
    const available = input.guardianAvailable && input.guardianOnDuty !== false && input.guardianScopeIncludesCheck;
    return {
      firstActor: available ? 'guardian' : 'manager',
      mode: 'normal',
      notify: [],
      decisionRequiredFrom: 'manager',
      nextAction: available ? 'Constat sans risque par le gardien ; réparer uniquement si ses missions le permettent, sinon demander une décision de prestation.' : 'Gardien absent ou hors service : utiliser le remplaçant configuré ou remonter au gestionnaire.',
      fallbackActor: 'manager',
      fallbackProcedure: input.guardianBackupConfigured ? 'Contacter le remplaçant désigné pour constat autorisé' : 'Remonter au gestionnaire',
      guardianCanCompleteLocally: available && input.guardianCanRepair === true,
      onGuardianCannotResolve: 'contractor_after_manager_approval',
      reason: ['Fuite ordinaire : circuit de constat avant commande de travaux'],
      requiresHumanReview: true,
    };
  }
  if (input.kind === 'collective_heating') {
    return {
      firstActor: input.contractedProviderAvailable ? 'contractor' : 'manager',
      notify: ['affected_residents', 'council_summary'],
      decisionRequiredFrom: 'manager',
      nextAction: input.contractedProviderAvailable
        ? 'Préparer un contact avec le chauffagiste contractuel suivant les consignes validées.'
        : 'Signaler au gestionnaire que le prestataire contractuel est indisponible ; vérifier le circuit de secours.',
      fallbackActor: 'manager',
      reason: ['Équipement collectif : priorité au contrat de maintenance et à la procédure d’astreinte'],
      requiresHumanReview: true,
    };
  }
  if (input.kind === 'lighting') {
    const guardian = input.guardianAvailable && input.guardianOnDuty !== false && input.guardianScopeIncludesCheck;
    return {
      firstActor: guardian ? 'guardian' : 'manager',
      notify: [],
      decisionRequiredFrom: 'manager',
      nextAction: guardian
        ? (input.guardianCanRepair ? 'Demander au gardien de vérifier puis, uniquement si autorisé et sans danger, de réaliser le petit entretien ; sinon demander un prestataire au gestionnaire.' : 'Demander un constat visuel au gardien dans ses missions, puis escalader à échéance.')
        : 'Faire qualifier par le syndic ou un prestataire autorisé, sans attendre le gardien.',
      fallbackActor: 'manager',
      guardianCanCompleteLocally: guardian && input.guardianCanRepair === true,
      onGuardianCannotResolve: 'contractor_after_manager_approval',
      reason: guardian ? ['Gardien disponible et vérification prévue dans ses missions'] : ['Gardien absent ou vérification non autorisée'],
      requiresHumanReview: true,
    };
  }
  return {
    firstActor: 'manager',
    notify: [],
    decisionRequiredFrom: 'manager',
    nextAction: 'Qualifier manuellement le dossier avant affectation.',
    fallbackActor: 'manager',
    reason: ['Aucune procédure spécialisée vérifiée'],
    requiresHumanReview: true,
  };
}
