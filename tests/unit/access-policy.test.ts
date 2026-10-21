import { describe, it, expect } from 'vitest';
import { canAccess, type Principal, type Resource } from '../../src/access-policy';

const dossier: Resource = { cabinetId: 'cab-A', buildingId: 'bat-1', reporterId: 'res-A', assignedProviderIds: ['prest-A'] };
const user = (role: Principal['role'], userId: string, cabinetId = 'cab-A', buildingIds: string[] = ['bat-1']): Principal =>
  ({ role, userId, cabinetId, buildingIds });

describe('politique de droits (pas encore branchée aux endpoints)', () => {
  it('refuse toute requête sans identité vérifiée', () => {
    expect(canAccess(null, dossier, 'read')).toBe(false);
  });
  it('refuse systématiquement les accès inter-cabinets', () => {
    for (const action of ['read','create','update','assign'] as const) {
      expect(canAccess(user('cabinet_admin','boss','cab-B'), dossier, action)).toBe(false);
    }
  });
  it('limite les gestionnaires aux immeubles affectés', () => {
    expect(canAccess(user('manager','manager-A'), dossier, 'update')).toBe(true);
    expect(canAccess(user('manager','manager-A','cab-A',['bat-2']), dossier, 'read')).toBe(false);
  });
  it('autorise la lecture de ses signalements uniquement pour le résident', () => {
    expect(canAccess(user('resident','res-A'), dossier, 'read')).toBe(true);
    expect(canAccess(user('resident','res-B'), dossier, 'read')).toBe(false);
    expect(canAccess(user('resident','res-A'), dossier, 'update')).toBe(false);
    expect(canAccess(user('resident','res-A'), dossier, 'assign')).toBe(false);
  });
  it('limite les prestataires à la lecture des dossiers qui leur sont affectés', () => {
    expect(canAccess(user('provider','prest-A'), dossier, 'read')).toBe(true);
    expect(canAccess(user('provider','prest-B'), dossier, 'read')).toBe(false);
    expect(canAccess(user('provider','prest-A'), dossier, 'update')).toBe(false);
  });
});
