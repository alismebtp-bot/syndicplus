/** Moteur de procédure de démonstration : suggestions, jamais des autorisations légales. */
export type IncidentKind = 'lighting' | 'collective_heating' | 'major_leak' | 'other';
export type Actor = 'guardian' | 'manager' | 'contractor' | 'emergency';
export type Notice = 'council_summary' | 'council_priority' | 'affected_residents';
export interface ProcedureInput {
  kind: IncidentKind;
  danger: boolean;
  guardianAvailable: boolean;
  guardianScopeIncludesCheck: boolean;
  /** Permission explicite : petit entretien non dangereux dans les missions du gardien. */
  guardianCanRepair?: boolean;
  contractedProviderAvailable: boolean;
  guardianTimeoutMinutes?: number;
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
}
export function proposeRoute(input: ProcedureInput): RouteProposal {
  if (input.danger || input.kind === 'major_leak') {
    return {
      firstActor: 'emergency',
      notify: ['council_priority', 'affected_residents'],
      decisionRequiredFrom: 'manager',
      nextAction: 'Appliquer immédiatement la procédure de sécurité configurée et alerter le syndic ; ne pas attendre le gardien.',
      fallbackActor: 'manager',
      reason: ['Danger ou dommages majeurs possibles : escalade prioritaire'],
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
    const guardian = input.guardianAvailable && input.guardianScopeIncludesCheck;
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
