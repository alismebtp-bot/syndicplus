import { describe, expect, it } from 'vitest';
import { getIncidentType, INCIDENT_TYPES, type Pathway } from '../../src/procedures/catalog';
import { configWarnings, DEMO_BUILDING, parseBuildingConfig, type BuildingConfig } from '../../src/procedures/config';
import { compareQuotes, presidentCan } from '../../src/procedures/council';
import { afterGuardianCannotResolve, routeIncident, verifierFor, type RouteInput } from '../../src/procedures/engine';
import { isOnDuty } from '../../src/procedures/schedule';

// Heure de Paris (CEST, UTC+2 jusqu'au 25/10/2026)
const MERCREDI_10H = new Date('2026-10-21T08:00:00Z');
const MERCREDI_22H = new Date('2026-10-21T20:00:00Z');
const SAMEDI_10H = new Date('2026-10-24T08:00:00Z');

const clone = (c: BuildingConfig): BuildingConfig => structuredClone(c);
const route = (typeId: string, over: Partial<RouteInput> = {}, config = DEMO_BUILDING) =>
  routeIncident({ typeId, dangerSignals: [], reportedBy: 'resident', now: MERCREDI_10H, ...over }, config);

describe('catalogue des 36 scénarios', () => {
  // Table de référence de la PR #21 (docs/ROUTING_CATEGORIES_V2.md)
  const REFERENCE: Record<number, Pathway> = {
    1: 'P1', 2: 'P2', 3: 'P1', 4: 'P5', 5: 'P2', 6: 'P2', 7: 'P2', 8: 'P1', 9: 'P2', 10: 'P4',
    11: 'P3', 12: 'P1', 13: 'P1', 14: 'P2', 15: 'P5', 16: 'P6', 17: 'P1', 18: 'P2', 19: 'P5',
    20: 'P5', 21: 'P1', 22: 'P2', 23: 'P5', 24: 'P5', 25: 'P2', 26: 'P5', 27: 'P5', 28: 'P4',
    29: 'P3', 30: 'P4', 31: 'P2', 32: 'P3', 33: 'P2', 34: 'P2', 35: 'P5', 36: 'P6',
  };
  it('contient les 36 scénarios une seule fois, plus « autre »', () => {
    const nums = INCIDENT_TYPES.map((t) => t.scenario).filter((n) => n > 0).sort((a, b) => a - b);
    expect(nums).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(new Set(INCIDENT_TYPES.map((t) => t.id)).size).toBe(INCIDENT_TYPES.length);
    expect(getIncidentType('autre')?.pathway).toBe('P3');
  });
  it.each(Object.entries(REFERENCE))('scénario %s → parcours %s', (n, p) => {
    expect(INCIDENT_TYPES.find((t) => t.scenario === Number(n))?.pathway).toBe(p);
  });
});

describe('horaires du gardien', () => {
  const g = DEMO_BUILDING.guardian!;
  it.each([
    ['mercredi 10 h', MERCREDI_10H, true],
    ['mercredi 22 h', MERCREDI_22H, false],
    ['samedi 10 h', SAMEDI_10H, false],
    ['mercredi 12 h pile (fin de créneau exclue)', new Date('2026-10-21T10:00:00Z'), false],
    ['mercredi 14 h (reprise)', new Date('2026-10-21T12:00:00Z'), true],
    ['heure d’hiver : mercredi 2 décembre 9 h', new Date('2026-12-02T08:00:00Z'), true],
  ])('%s → en service : %s', (_l, d, expected) => {
    expect(isOnDuty(g, d)).toBe(expected);
  });
  it('sans horaires ni forçage : hors service', () => {
    expect(isOnDuty({ ...g, schedule: [] }, MERCREDI_10H)).toBe(false);
  });
  it('le forçage de démonstration prime', () => {
    expect(isOnDuty({ ...g, onDutyOverride: true }, MERCREDI_22H)).toBe(true);
  });
});

describe('P5 — urgence : jamais d’attente du gardien', () => {
  it.each(INCIDENT_TYPES.map((t) => t.id))('%s + danger → P5 et alertes parallèles', (id) => {
    const d = route(id, { dangerSignals: ['Fumée signalée'] });
    expect(d.pathway).toBe('P5');
    expect(d.firstActor).toBe('emergency');
    expect(d.notify).toEqual(expect.arrayContaining(['manager', 'council_president', 'guardian']));
    expect(d.autoAssign).toBe(false);
    expect(d.deadlineHours).toBe(0);
  });
  it('gardien hors service : il n’est pas prévenu, le remplaçant en service l’est', () => {
    expect(route('fuite_majeure', { now: MERCREDI_22H }).notify).not.toContain('guardian');
    const c = clone(DEMO_BUILDING);
    c.backupGuardian = { ...c.guardian!, name: 'M. Petit', onDutyOverride: true };
    const d = route('fuite_majeure', { now: MERCREDI_22H }, c);
    expect(d.notify).toContain('backup_guardian');
    expect(d.notify).not.toContain('guardian');
  });
  it('astreinte sous contrat prévenue quand elle existe', () => {
    const d = route('fuite_majeure');
    expect(d.notify).toContain('on_call_contractor');
    expect(d.contractor?.provider).toBe('Plomberie Rapide (démo)');
  });
  it('sans astreinte ni président : informations manquantes signalées', () => {
    const c = clone(DEMO_BUILDING);
    c.contracts = [];
    c.councilPresident = null;
    const d = route('incendie', {}, c);
    expect(d.missing.join(' ')).toMatch(/astreinte/);
    expect(d.missing.join(' ')).toMatch(/Président/);
  });
});

describe('P1 — petit entretien : gardien d’abord, gestionnaire pas en premier', () => {
  it('éclairage en semaine : gardien, résolution directe possible', () => {
    const d = route('eclairage_commun');
    expect(d.pathway).toBe('P1');
    expect(d.firstActor).toBe('guardian');
    expect(d.firstActorName).toBe('Mme Martin');
    expect(d.guardianCanResolve).toBe(true);
    expect(d.managerRole).toBe('none');
  });
  it('gardien hors service : pas d’attente, contrat préparé, montant à confirmer', () => {
    const d = route('eclairage_commun', { now: MERCREDI_22H });
    expect(d.firstActor).toBe('manager');
    expect(d.contractor?.provider).toBe('Élec Services (démo)');
    expect(d.autoAssign).toBe(false);
    expect(d.missing.join(' ')).toMatch(/Montant estimé inconnu/);
  });
  it('le gardien qui signale lui-même traite directement, même hors horaires', () => {
    expect(route('eclairage_commun', { now: MERCREDI_22H, reportedBy: 'guardian' }).firstActor).toBe('guardian');
  });
  it('remplaçant en service si le gardien est absent', () => {
    const c = clone(DEMO_BUILDING);
    c.backupGuardian = { ...c.guardian!, name: 'M. Petit', onDutyOverride: true };
    const d = route('eclairage_commun', { now: SAMEDI_10H }, c);
    expect(d.firstActor).toBe('backup_guardian');
    expect(d.firstActorName).toBe('M. Petit');
  });
  it('constat seulement si le type n’est pas dans ses missions de petit entretien', () => {
    const c = clone(DEMO_BUILDING);
    c.guardian!.smallRepairTypes = ['nettoyage'];
    const d = route('eclairage_commun', {}, c);
    expect(d.firstActor).toBe('guardian');
    expect(d.guardianCanResolve).toBe(false);
  });
  it('constat hors missions : le gardien n’est pas sollicité', () => {
    const c = clone(DEMO_BUILDING);
    c.guardian!.canCheck = false;
    expect(route('eclairage_commun', {}, c).firstActor).not.toBe('guardian');
  });
});

describe('après le gardien : contrat préautorisé et vérifié, sinon gestionnaire', () => {
  it.each([
    ['dans le plafond vérifié', 'eclairage_commun', 200, 'contractor', true],
    ['au plafond exact', 'eclairage_commun', 250, 'contractor', true],
    ['au-delà du plafond', 'eclairage_commun', 300, 'manager', false],
    ['montant inconnu', 'eclairage_commun', undefined, 'manager', false],
    ['contrat sans préautorisation', 'fuite_legere', 50, 'manager', false],
    ['aucun contrat', 'nettoyage', 20, 'manager', false],
  ] as const)('%s', (_l, type, estimate, next, auto) => {
    const d = afterGuardianCannotResolve(type, DEMO_BUILDING, estimate);
    expect(d.next).toBe(next);
    expect(d.autoAssign).toBe(auto);
  });
  it('préautorisation non vérifiée : jamais d’affectation automatique', () => {
    const c = clone(DEMO_BUILDING);
    c.contracts[0]!.preauthorization!.verified = false;
    expect(afterGuardianCannotResolve('eclairage_commun', c, 10).autoAssign).toBe(false);
  });
  it('danger : aucune affectation automatique', () => {
    expect(afterGuardianCannotResolve('eclairage_commun', DEMO_BUILDING, 10, ['Étincelles']).autoAssign).toBe(false);
  });
});

describe('P2 — maintenance sous contrat', () => {
  it('chauffage collectif : prestataire contractuel préautorisé, gestionnaire informé', () => {
    const d = route('chauffage_collectif');
    expect(d.firstActor).toBe('contractor');
    expect(d.autoAssign).toBe(true);
    expect(d.managerRole).toBe('information');
    expect(d.notify).toContain('affected_residents');
    expect(d.councilRole).toBe('information');
  });
  it('contrat sans préautorisation vérifiée : affectation préparée, décision du gestionnaire', () => {
    const c = clone(DEMO_BUILDING);
    c.contracts[1]!.preauthorization = null;
    const d = route('chauffage_collectif', {}, c);
    expect(d.firstActor).toBe('manager');
    expect(d.contractor?.provider).toBe('Chauffage Plus (démo)');
    expect(d.managerRole).toBe('decision');
  });
  it('aucun contrat : décision du gestionnaire, information manquante', () => {
    const d = route('interphone');
    expect(d.firstActor).toBe('manager');
    expect(d.missing.join(' ')).toMatch(/Aucun contrat/);
  });
});

describe('P3, P4, P6 — décision humaine et rôle du président', () => {
  it('P3 infiltration : consultation du président, constat du gardien possible', () => {
    const d = route('infiltration_toiture');
    expect(d.pathway).toBe('P3');
    expect(d.managerRole).toBe('decision');
    expect(d.councilRole).toBe('consultation');
    expect(d.notify).toContain('council_president');
    expect(d.nextAction).toMatch(/président du CS peut solliciter/);
    expect(d.verifier).toBe('council_president');
  });
  it('P4 sinistre privatif : gestionnaire, pas de consultation', () => {
    const d = route('degat_des_eaux');
    expect(d.pathway).toBe('P4');
    expect(d.councilRole).toBe('none');
    expect(d.verifier).toBe('manager');
  });
  it('P6 travaux importants : consultation', () => {
    expect(route('renovation').councilRole).toBe('consultation');
  });
  it('type inconnu : qualification manuelle', () => {
    const d = route('inexistant');
    expect(d.typeId).toBe('autre');
    expect(d.firstActor).toBe('manager');
  });
});

describe('vérificateur désigné (bonne exécution apparente)', () => {
  it('P1/P2 : gardien ; P3/P6 : président ; P4/P5 : gestionnaire', () => {
    expect(verifierFor('P1', DEMO_BUILDING)).toBe('guardian');
    expect(verifierFor('P2', DEMO_BUILDING)).toBe('guardian');
    expect(verifierFor('P3', DEMO_BUILDING)).toBe('council_president');
    expect(verifierFor('P6', DEMO_BUILDING)).toBe('council_president');
    expect(verifierFor('P4', DEMO_BUILDING)).toBe('manager');
  });
  it('sans gardien ni président désignés : gestionnaire', () => {
    const c = clone(DEMO_BUILDING);
    c.guardian = null;
    c.councilPresident = null;
    expect(verifierFor('P1', c)).toBe('manager');
    expect(verifierFor('P3', c)).toBe('manager');
  });
});

describe('fiche de l’immeuble', () => {
  it('la fiche de démonstration est valide', () => {
    const r = parseBuildingConfig(DEMO_BUILDING);
    expect(r.ok).toBe(true);
  });
  it('une préautorisation sans référence n’est jamais vérifiée', () => {
    const c = clone(DEMO_BUILDING);
    c.contracts[0]!.preauthorization = { ceilingHT: 250, verified: true, reference: '' };
    const r = parseBuildingConfig(c);
    expect(r.ok && r.value.contracts[0]!.preauthorization?.verified).toBe(false);
  });
  it('refuse un créneau horaire invalide', () => {
    const c = clone(DEMO_BUILDING);
    c.guardian!.schedule = [{ days: [1], start: '18:00', end: '08:00' }];
    expect(parseBuildingConfig(c).ok).toBe(false);
  });
  it('refuse une délégation de dépense sans référence vérifiée', () => {
    // any : fiche volontairement invalide pour tester la validation
    const c = clone(DEMO_BUILDING) as unknown as Record<string, any>;
    c.councilPresident.delegations.authorizeExpenditure = { ceilingHT: 1000, verifiedReference: '' };
    expect(parseBuildingConfig(c).ok).toBe(false);
  });
  it('ignore les corps de métier inconnus et refuse un contrat sans métier valide', () => {
    // any : fiche volontairement invalide pour tester la validation
    const c = clone(DEMO_BUILDING) as unknown as Record<string, any>;
    c.contracts = [{ provider: 'X', trades: ['piscine'] }];
    expect(parseBuildingConfig(c).ok).toBe(false);
  });
  it('signale les informations manquantes', () => {
    const w = configWarnings({ ...clone(DEMO_BUILDING), guardian: null, contracts: [], councilPresident: null });
    expect(w.join(' ')).toMatch(/Aucun gardien/);
    expect(w.join(' ')).toMatch(/Aucun contrat/);
    expect(w.join(' ')).toMatch(/Président/);
  });
});

describe('président du conseil syndical : avis ≠ consultation ≠ décision', () => {
  it('peut demander des devis, comparer, constater selon la fiche', () => {
    expect(presidentCan('request_quote', DEMO_BUILDING).allowed).toBe(true);
    expect(presidentCan('compare_and_advise', DEMO_BUILDING).allowed).toBe(true);
    expect(presidentCan('confirm_apparent_completion', DEMO_BUILDING).allowed).toBe(true);
  });
  it('n’autorise aucune dépense sans délégation vérifiée', () => {
    expect(presidentCan('authorize_expenditure', DEMO_BUILDING, 100).allowed).toBe(false);
  });
  it('avec délégation vérifiée : dans le plafond seulement, montant connu', () => {
    const c = clone(DEMO_BUILDING);
    c.councilPresident!.delegations.authorizeExpenditure = { ceilingHT: 1000, verifiedReference: 'Délibération AG 2026 n°7 (démo)' };
    expect(presidentCan('authorize_expenditure', c, 800).allowed).toBe(true);
    expect(presidentCan('authorize_expenditure', c, 1200).allowed).toBe(false);
    expect(presidentCan('authorize_expenditure', c).allowed).toBe(false);
  });
  it('ne passe jamais de commande', () => {
    expect(presidentCan('issue_purchase_order', DEMO_BUILDING).allowed).toBe(false);
  });
  it('délégation retirée : demande de devis refusée', () => {
    const c = clone(DEMO_BUILDING);
    c.councilPresident!.delegations.requestQuotes = false;
    expect(presidentCan('request_quote', c).allowed).toBe(false);
  });
});

describe('comparaison des devis', () => {
  const q = (company: string, amountHT: number, delayDays: number | null, scope = 'Reprise étanchéité', warranty = 'Décennale') => ({ company, amountHT, vatRate: 10, delayDays, scope, warranty });
  it('signale le moins cher et le plus rapide sans désigner d’attributaire', () => {
    const c = compareQuotes([q('A', 4200, 30), q('B', 3800, 45), q('C', 5100, 15)]);
    expect(c.rows.map((r) => r.company)).toEqual(['B', 'A', 'C']);
    expect(c.rows.find((r) => r.lowestPrice)?.company).toBe('B');
    expect(c.rows.find((r) => r.shortestDelay)?.company).toBe('C');
    expect(c.rows[0]!.amountTTC).toBe(4180);
    expect(c.spreadHT).toBe(1300);
    expect(JSON.stringify(c)).not.toMatch(/winner|attributaire/i);
    expect(c.notes.join(' ')).toMatch(/ni décision d’attribution/);
  });
  it('signale les devis incomplets et le devis unique', () => {
    const c = compareQuotes([q('A', 1000, null, '', '')]);
    expect(c.rows[0]!.missing).toEqual(['périmètre des travaux', 'délai', 'garanties']);
    expect(c.notes.join(' ')).toMatch(/Au moins deux devis/);
    expect(c.rows[0]!.lowestPrice).toBe(false);
  });
});
