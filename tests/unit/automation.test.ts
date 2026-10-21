import { describe, expect, it } from 'vitest';
import { findBlocked, findDuplicates, findRecurrences, summarize, tokens, type CaseSnapshot } from '../../src/procedures/automation';

const NOW = Date.parse('2026-10-21T10:00:00Z');
const H = 3_600_000;
const snap = (o: Partial<CaseSnapshot> & { id: string }): CaseSnapshot => ({
  typeId: 'eclairage_commun',
  location: 'Couloir du 3e étage',
  description: 'Le luminaire ne fonctionne plus',
  status: 'guardian',
  pathway: 'P1',
  createdAt: NOW - 2 * H,
  updatedAt: NOW - 2 * H,
  deadlineHours: 48,
  nextActor: 'Mme Martin (gardien)',
  history: [],
  missing: [],
  ...o,
});

describe('normalisation', () => {
  it('ignore accents, casse, mots vides et suffixes d’étage', () => {
    expect([...tokens('Couloir du 3ème ÉTAGE')]).toEqual(['couloir', '3']);
    expect([...tokens('couloir 3e etage')]).toEqual(['couloir', '3']);
  });
});

describe('doublons : proposition de regroupement, jamais de fusion automatique', () => {
  const open = [snap({ id: 'A' }), snap({ id: 'B', location: 'Hall bâtiment B' }), snap({ id: 'C', typeId: 'ascenseur' })];
  it('même type et même emplacement : proposé en premier', () => {
    const r = findDuplicates({ typeId: 'eclairage_commun', location: 'couloir 3ème étage', description: 'ampoule grillée' }, open, NOW);
    expect(r.map((x) => x.id)).toEqual(['A']);
    expect(r[0]!.reasons).toContain('Même emplacement');
    expect(r[0]!.reasons).toContain('Signalé il y a 2 h');
  });
  it('autre emplacement ou autre métier : pas de doublon', () => {
    expect(findDuplicates({ typeId: 'eclairage_commun', location: 'Parking sous-sol', description: 'x' }, open, NOW)).toEqual([]);
    expect(findDuplicates({ typeId: 'nettoyage', location: 'Couloir du 3e étage', description: 'x' }, open, NOW)).toEqual([]);
  });
  it('même corps de métier (électricité) au même endroit : candidat', () => {
    const r = findDuplicates({ typeId: 'panne_electrique_collective', location: 'Couloir du 3e étage', description: 'Plus de courant' }, open, NOW);
    expect(r[0]?.reasons).toContain('Même corps de métier');
  });
  it('ignore les dossiers clôturés ou trop anciens', () => {
    const old = [snap({ id: 'X', createdAt: NOW - 100 * H }), snap({ id: 'Y', status: 'closed' })];
    expect(findDuplicates({ typeId: 'eclairage_commun', location: 'Couloir du 3e étage', description: 'x' }, old, NOW)).toEqual([]);
  });
});

describe('dossiers bloqués et relances préparées', () => {
  it('délai du parcours dépassé : bloqué, relance rédigée pour le prochain acteur', () => {
    const r = findBlocked([snap({ id: 'A', updatedAt: NOW - 60 * H })], NOW);
    expect(r).toHaveLength(1);
    expect(r[0]!.overdueHours).toBe(12);
    expect(r[0]!.reminder.to).toBe('Mme Martin (gardien)');
    expect(r[0]!.reminder.subject).toMatch(/Relance — Éclairage des parties communes/);
    expect(r[0]!.reminder.body).toMatch(/depuis 60 h/);
    expect(findBlocked([snap({ id: 'L', statusLabel: 'À traiter par le gardien', updatedAt: NOW - 60 * H })], NOW)[0]!.reminder.body).toMatch(/Statut actuel : À traiter par le gardien/);
  });
  it('dans le délai : rien', () => {
    expect(findBlocked([snap({ id: 'A', updatedAt: NOW - 10 * H })], NOW)).toEqual([]);
  });
  it('urgence P5 sans action depuis plus de 2 h : bloquée', () => {
    expect(findBlocked([snap({ id: 'U', pathway: 'P5', deadlineHours: 0, status: 'emergency', updatedAt: NOW - 3 * H })], NOW)).toHaveLength(1);
    expect(findBlocked([snap({ id: 'U', pathway: 'P5', deadlineHours: 0, status: 'emergency', updatedAt: NOW - 1 * H })], NOW)).toHaveLength(0);
  });
  it('vérification ou réserves sans suite au-delà de 72 h : bloquées', () => {
    expect(findBlocked([snap({ id: 'V', status: 'reserved', deadlineHours: 0, updatedAt: NOW - 80 * H })], NOW)).toHaveLength(1);
  });
  it('dossier clôturé : jamais bloqué ; informations manquantes reprises dans la relance', () => {
    expect(findBlocked([snap({ id: 'C', status: 'closed', updatedAt: NOW - 500 * H })], NOW)).toEqual([]);
    const r = findBlocked([snap({ id: 'M', updatedAt: NOW - 60 * H, missing: ['Montant estimé inconnu'] })], NOW);
    expect(r[0]!.reminder.body).toMatch(/Montant estimé inconnu/);
  });
});

describe('résumé et pannes récurrentes', () => {
  it('résume le dossier avec les faits marquants', () => {
    const lines = summarize(snap({ id: 'A', history: ['Signalement', 'Président : réserves signalées', 'Gestionnaire : reprise n°1 demandée'], missing: ['Astreinte non renseignée'] }));
    expect(lines[0]).toMatch(/parcours P1/);
    expect(lines.join(' ')).toMatch(/réserves signalées · Gestionnaire : reprise/);
    expect(lines.join(' ')).toMatch(/Points ouverts : Astreinte/);
  });
  it('3 signalements du même type au même endroit en 90 jours : récurrence', () => {
    const cs = [snap({ id: '1', createdAt: NOW - 80 * 24 * H }), snap({ id: '2', createdAt: NOW - 30 * 24 * H, status: 'closed' }), snap({ id: '3' }), snap({ id: '4', typeId: 'ascenseur' })];
    const r = findRecurrences(cs, NOW);
    expect(r).toHaveLength(1);
    expect(r[0]!.ids).toEqual(['1', '2', '3']);
    expect(r[0]!.message).toMatch(/3 signalements en 90 jours/);
  });
  it('hors fenêtre de 90 jours : pas de récurrence', () => {
    const cs = [snap({ id: '1', createdAt: NOW - 120 * 24 * H }), snap({ id: '2' }), snap({ id: '3' })];
    expect(findRecurrences(cs, NOW)).toEqual([]);
  });
});
