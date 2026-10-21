import { describe, expect, it } from 'vitest';
import { parseDossierAction, parseReplacement, validDate } from '../../src/cockpit/actions';
import type { Snapshot } from '../../src/cockpit/data';
import { csvCell } from '../../src/cockpit/http';
import type { Principal } from '../../src/cockpit/identity';
import { assistant, ASSISTANT_QUESTIONS, attention, contractStatus, finance, overview, providers, quality } from '../../src/cockpit/metrics';
import { canReassign, canSetReplacement, canSupervise } from '../../src/cockpit/policy';

const NOW = Date.parse('2026-10-21T10:00:00Z');
const empty = (): Snapshot => ({
  now: NOW, cabinetName: 'Cabinet test', scopeAll: true, copros: [], users: [], absences: [], providers: [], contracts: [], dossiers: [],
  interventions: [], reserves: [], financial: [], decisions: [], satisfaction: [], reviews: [],
});
const director: Principal = { userId: 'dir', cabinetId: 'cab', cabinetName: 'Cab', name: 'Dir', role: 'cabinet_director', scopeAll: false, coproIds: ['c1'] };

describe('Indicateurs sans données', () => {
  it('ne produit ni chiffre inventé ni point d’attention', () => {
    const o = overview(empty());
    expect(o.kpis.every((k) => k.value === 0)).toBe(true);
    expect(o.attention).toEqual([]);
    expect(quality(empty())).toMatchObject({ closed: 0, answered: 0, responseRate: null, averageScore: null });
    expect(providers(empty())).toEqual([]);
    expect(finance(empty()).chains).toEqual([]);
    for (const q of ASSISTANT_QUESTIONS) expect(assistant(empty(), q.id).summary).toBeTruthy();
  });
});

describe('Contrats', () => {
  it('signale la date limite de préavis dépassée', () => {
    const s = empty();
    s.contracts = [{ id: 'k', coproId: 'c1', providerId: 'p', label: 'Ascenseur', startsOn: '2024-01-01', endsOn: '2026-11-10', noticeDays: 90, responseHours: 4, annualHt: 1000, documentRef: 'X' }];
    expect(contractStatus(s)[0]!.state).toBe('notice_passed');
    expect(attention(s).map((a) => a.id)).toEqual(['contract-k']);
  });
});

describe('Politique d’accès', () => {
  const t = (over: Partial<{ id: string; cabinetId: string; role: string; active: boolean; absentToday: boolean }> = {}) => ({ id: 'm2', cabinetId: 'cab', role: 'manager', active: true, absentToday: false, ...over });
  const d = { cabinetId: 'cab', coproId: 'c1', closed: false, assigneeId: 'm1' };
  it('réserve la supervision au responsable avec un périmètre', () => {
    expect(canSupervise(null).ok).toBe(false);
    expect(canSupervise({ ...director, role: 'manager' }).ok).toBe(false);
    expect(canSupervise({ ...director, coproIds: [] }).ok).toBe(false);
    expect(canSupervise(director).ok).toBe(true);
  });
  it('encadre la réaffectation', () => {
    expect(canReassign(director, d, t()).ok).toBe(true);
    expect(canReassign(director, { ...d, coproId: 'c2' }, t()).ok).toBe(false);
    expect(canReassign(director, { ...d, cabinetId: 'other' }, t()).ok).toBe(false);
    expect(canReassign(director, { ...d, closed: true }, t()).ok).toBe(false);
    expect(canReassign(director, d, t({ cabinetId: 'other' })).ok).toBe(false);
    expect(canReassign(director, d, t({ role: 'guardian' })).ok).toBe(false);
    expect(canReassign(director, d, t({ active: false })).ok).toBe(false);
    expect(canReassign(director, d, t({ absentToday: true })).ok).toBe(false);
    expect(canReassign(director, d, t({ id: 'm1' })).ok).toBe(false);
    expect(canReassign(director, d, null).ok).toBe(false);
  });
  it('encadre le remplacement', () => {
    expect(canSetReplacement(director, t({ id: 'm1' }), t()).ok).toBe(true);
    expect(canSetReplacement(director, t({ id: 'm1' }), t({ id: 'm1' })).ok).toBe(false);
    expect(canSetReplacement(director, t({ id: 'm1' }), t({ absentToday: true })).ok).toBe(false);
    expect(canSetReplacement(director, t({ id: 'm1', cabinetId: 'other' }), t()).ok).toBe(false);
    expect(canSetReplacement(director, t({ id: 'm1' }), null).ok).toBe(true);
  });
});

describe('Validation des actions', () => {
  it('exige une confirmation pour les actions sensibles', () => {
    expect(parseDossierAction({ action: 'reassign', to: 'm2', reason: 'x' }, NOW).ok).toBe(false);
    expect(parseDossierAction({ action: 'reassign', to: 'm2', reason: 'x', confirm: true }, NOW).ok).toBe(true);
    expect(parseDossierAction({ action: 'prepare_decision', kind: 'other', label: 'x', authority: 'AG' }, NOW).ok).toBe(false);
    expect(parseReplacement({ replacement: 'm2' }).ok).toBe(false);
  });
  it('borne les textes, montants et dates', () => {
    expect(parseDossierAction({ action: 'request_update', message: 'x'.repeat(501) }, NOW).ok).toBe(false);
    expect(parseDossierAction({ action: 'prepare_decision', kind: 'other', label: 'x', authority: 'AG', amountHt: -1, confirm: true }, NOW).ok).toBe(false);
    expect(parseDossierAction({ action: 'prepare_decision', kind: 'pay_now', label: 'x', authority: 'AG', confirm: true }, NOW).ok).toBe(false);
    expect(validDate('2026-10-21', NOW)).toBe(true);
    expect(validDate('2026-10-20', NOW)).toBe(false);
    expect(validDate('2026-02-30', NOW)).toBe(false);
    expect(validDate('2028-01-01', NOW)).toBe(false);
  });
});

describe('Export CSV', () => {
  it('neutralise les formules et échappe les séparateurs', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell(null)).toBe('');
  });
});
