/**
 * Catalogue des types d'incidents et parcours par défaut (P1–P6).
 * Reprend la classification des 36 scénarios (PR #21, docs/ROUTING_CATEGORIES_V2.md).
 * Un parcours par défaut n'est qu'un point de départ : la gravité (P5) et la fiche de l'immeuble priment.
 */

export type Pathway = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';

export type Trade =
  | 'electricite'
  | 'plomberie'
  | 'chauffage'
  | 'ascenseur'
  | 'ventilation'
  | 'fermetures'
  | 'interphonie'
  | 'nettoyage'
  | 'espaces_verts'
  | 'toiture_facade'
  | 'nuisibles'
  | 'irve'
  | 'photovoltaique'
  | 'securite_incendie'
  | 'general';

export interface IncidentType {
  id: string;
  /** Numéro du scénario de référence (1–36), 0 pour « autre ». */
  scenario: number;
  label: string;
  pathway: Pathway;
  trade: Trade;
  /** Peut relever du petit entretien du gardien si sa fiche l'y autorise. */
  smallRepairEligible: boolean;
  /** Impact collectif : le président du CS est informé même hors consultation. */
  collective: boolean;
}

export const PATHWAYS: Record<Pathway, { label: string; summary: string }> = {
  P1: { label: 'Petit entretien', summary: 'Gardien en priorité lorsqu’il est en service et autorisé.' },
  P2: { label: 'Maintenance sous contrat', summary: 'Prestataire contractuel selon les procédures de l’immeuble.' },
  P3: { label: 'Diagnostic et devis', summary: 'Constat, consultation des entreprises, comparaison des devis, autorisation.' },
  P4: { label: 'Sinistre', summary: 'Constat, suivi technique et traitement administratif ou assurantiel.' },
  P5: { label: 'Urgence', summary: 'Mise en sécurité immédiate et notifications parallèles.' },
  P6: { label: 'Travaux importants', summary: 'Consultation, décisions applicables, réalisation, vérifications et réserves.' },
};

const t = (
  scenario: number,
  id: string,
  label: string,
  pathway: Pathway,
  trade: Trade,
  smallRepairEligible = false,
  collective = false,
): IncidentType => ({ id, scenario, label, pathway, trade, smallRepairEligible, collective });

export const INCIDENT_TYPES: readonly IncidentType[] = [
  t(1, 'eclairage_commun', 'Éclairage des parties communes', 'P1', 'electricite', true),
  t(2, 'panne_electrique_collective', 'Panne électrique collective', 'P2', 'electricite', false, true),
  t(3, 'fuite_legere', 'Fuite d’eau légère', 'P1', 'plomberie', true),
  t(4, 'fuite_majeure', 'Fuite d’eau importante', 'P5', 'plomberie', false, true),
  t(5, 'chauffage_localise', 'Chauffage : un logement ou un radiateur', 'P2', 'chauffage'),
  t(6, 'chauffage_collectif', 'Chauffage collectif à l’arrêt', 'P2', 'chauffage', false, true),
  t(7, 'ascenseur', 'Ascenseur en panne', 'P2', 'ascenseur', false, true),
  t(8, 'porte_entree', 'Porte d’entrée', 'P1', 'fermetures', true),
  t(9, 'interphone', 'Interphone / digicode', 'P2', 'interphonie'),
  t(10, 'degat_des_eaux', 'Dégât des eaux', 'P4', 'plomberie'),
  t(11, 'infiltration_toiture', 'Infiltration par la toiture', 'P3', 'toiture_facade', false, true),
  t(12, 'nettoyage', 'Propreté des parties communes', 'P1', 'nettoyage', true),
  t(13, 'encombrants', 'Encombrants', 'P1', 'nettoyage', true),
  t(14, 'vmc', 'Ventilation (VMC) collective', 'P2', 'ventilation', false, true),
  t(15, 'incendie', 'Incendie ou fumée', 'P5', 'securite_incendie', false, true),
  t(16, 'renovation', 'Rénovation importante', 'P6', 'general', false, true),
  t(17, 'canalisation_bouchee', 'Canalisation bouchée', 'P1', 'plomberie', true),
  t(18, 'eau_chaude_collective', 'Eau chaude collective', 'P2', 'chauffage', false, true),
  t(19, 'eau_suspicion_sanitaire', 'Suspicion de problème sanitaire de l’eau', 'P5', 'plomberie', false, true),
  t(20, 'intrusion', 'Porte forcée / intrusion', 'P5', 'fermetures', false, true),
  t(21, 'badge_perdu', 'Badge ou clé perdu', 'P1', 'fermetures', true),
  t(22, 'portail_parking', 'Portail du parking', 'P2', 'fermetures', false, true),
  t(23, 'inondation_sous_sol', 'Inondation du sous-sol', 'P5', 'plomberie', false, true),
  t(24, 'alarme_incendie', 'Alarme incendie', 'P5', 'securite_incendie', false, true),
  t(25, 'eclairage_securite', 'Éclairage de sécurité (BAES)', 'P2', 'securite_incendie', false, true),
  t(26, 'garde_corps', 'Garde-corps instable', 'P5', 'toiture_facade', false, true),
  t(27, 'chute_facade', 'Chute d’éléments de façade', 'P5', 'toiture_facade', false, true),
  t(28, 'infiltration_privative', 'Infiltration d’origine incertaine', 'P4', 'plomberie'),
  t(29, 'nuisances_sonores', 'Nuisances sonores', 'P3', 'general'),
  t(30, 'vandalisme', 'Vandalisme', 'P4', 'general', false, true),
  t(31, 'nuisibles', 'Nuisibles', 'P2', 'nuisibles', false, true),
  t(32, 'arbre_dangereux', 'Arbre dangereux', 'P3', 'espaces_verts', false, true),
  t(33, 'irve', 'Bornes de recharge (IRVE)', 'P2', 'irve', false, true),
  t(34, 'photovoltaique', 'Installation photovoltaïque', 'P2', 'photovoltaique', false, true),
  t(35, 'amiante_plomb', 'Suspicion d’amiante ou de plomb', 'P5', 'general', false, true),
  t(36, 'travaux_votes_retard', 'Travaux votés en retard', 'P6', 'general', false, true),
  t(0, 'autre', 'Autre problème', 'P3', 'general'),
];

const BY_ID = new Map(INCIDENT_TYPES.map((x) => [x.id, x]));

export function getIncidentType(id: string): IncidentType | undefined {
  return BY_ID.get(id);
}
