import { describe, expect, it } from 'vitest';
import {
  clean,
  formatRef,
  historyText,
  isMeaningfulUpdate,
  parseDossierUpdate,
  parseNewDossier,
  parseRef,
} from '../../src/domain';

describe('clean', () => {
  it('retire les espaces et tronque', () => {
    expect(clean('  bonjour  ', 3)).toBe('bon');
  });
  it('rejette les valeurs non textuelles', () => {
    expect(clean(42, 10)).toBe('');
    expect(clean({ a: 1 }, 10)).toBe('');
    expect(clean(null, 10)).toBe('');
  });
});

describe('parseNewDossier', () => {
  it('accepte un signalement valide', () => {
    const r = parseNewDossier({ type: 'Ascenseur', place: ' Hall A ', description: ' Bloqué ' });
    expect(r).toEqual({ ok: true, value: { type: 'Ascenseur', place: 'Hall A', description: 'Bloqué' } });
  });
  it('refuse un type inconnu', () => {
    expect(parseNewDossier({ type: 'Piscine', place: 'x', description: 'y' }).ok).toBe(false);
  });
  it('refuse les champs vides ou composés d’espaces', () => {
    expect(parseNewDossier({ type: 'Autre', place: '   ', description: 'y' }).ok).toBe(false);
    expect(parseNewDossier({ type: 'Autre', place: 'x' }).ok).toBe(false);
  });
  it('refuse un corps absent', () => {
    expect(parseNewDossier(null)).toEqual({ ok: false, error: 'Requête invalide' });
  });
  it('tronque la description à 1000 caractères', () => {
    const r = parseNewDossier({ type: 'Autre', place: 'x', description: 'a'.repeat(5000) });
    expect(r.ok && r.value.description.length).toBe(1000);
  });
});

describe('mise à jour de dossier', () => {
  it('refuse un statut inconnu', () => {
    expect(parseDossierUpdate({ status: 'Annulé', note: '' }).ok).toBe(false);
  });
  it('exige un changement de statut ou une note', () => {
    expect(isMeaningfulUpdate('En cours', { status: 'En cours', note: '' })).toBe(false);
    expect(isMeaningfulUpdate('En cours', { status: 'Résolu', note: '' })).toBe(true);
    expect(isMeaningfulUpdate('En cours', { status: 'En cours', note: 'Relance' })).toBe(true);
  });
  it('rédige la ligne d’historique', () => {
    expect(historyText({ status: 'Résolu', note: '' })).toBe('Statut modifié — statut : Résolu');
    expect(historyText({ status: 'En cours', note: 'Plombier appelé' })).toBe('Plombier appelé — statut : En cours');
  });
});

describe('références', () => {
  it('formate et relit les références', () => {
    expect(formatRef(1002)).toBe('D-1002');
    expect(parseRef('D-1002')).toBe(1002);
  });
  it('refuse les références mal formées', () => {
    expect(parseRef('1002')).toBeNull();
    expect(parseRef('D-12a')).toBeNull();
    expect(parseRef("D-1;DROP TABLE dossiers")).toBeNull();
  });
});
