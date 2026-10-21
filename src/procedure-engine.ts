/** Moteur de procédure de démonstration : suggestions, jamais des autorisations légales. */
export type IncidentKind = 'lighting' | 'collective_heating' | 'major_leak' | 'other';
export type Actor = 'guardian' | 'manager' | 'contractor' | 'emergency';
export type Notice = 'council_summary' | 'council_priority' | 'affected_residents';
export interface ProcedureInput {
  kind: IncidentKind;
  danger: boolean;
  guardianAvailable: boolean;
  guardianScopeIncludesCheck: boolean;
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
        ? 'Demander un constat visuel au gardien dans ses missions, puis escalader à échéance.'
        : 'Faire qualifier par le syndic ou un prestataire autorisé, sans attendre le gardien.',
      fallbackActor: 'manager',
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
