import { describe, it, expect } from 'vitest';
import { proposeRoute, type ProcedureInput } from '../../src/procedure-engine';
const base: ProcedureInput = { kind:'lighting',danger:false,guardianAvailable:true,guardianScopeIncludesCheck:true,contractedProviderAvailable:true };
describe('circuits suggérés, jamais commandes automatiques', () => {
  it('passe par le gardien seulement dans son périmètre', () => {
    expect(proposeRoute(base).firstActor).toBe('guardian');
    expect(proposeRoute({...base,guardianAvailable:false}).firstActor).toBe('manager');
    expect(proposeRoute({...base,guardianScopeIncludesCheck:false}).firstActor).toBe('manager');
  });
  it('respecte le mainteneur contractuel du chauffage', () => {
    const route=proposeRoute({...base,kind:'collective_heating'});
    expect(route.firstActor).toBe('contractor');
    expect(route.notify).toContain('council_summary');
    expect(proposeRoute({...base,kind:'collective_heating',contractedProviderAvailable:false}).firstActor).toBe('manager');
  });
  it('ne laisse jamais une fuite majeure attendre le gardien', () => {
    const route=proposeRoute({...base,kind:'major_leak'});
    expect(route.firstActor).toBe('emergency');
    expect(route.notify).toContain('council_priority');
    expect(route.requiresHumanReview).toBe(true);
  });
  it('priorise la sécurité même sur un incident normalement banal', () => {
    expect(proposeRoute({...base,danger:true}).firstActor).toBe('emergency');
  });
  it('refuse de choisir un prestataire par défaut pour un cas inconnu', () => {
    expect(proposeRoute({...base,kind:'other'}).firstActor).toBe('manager');
  });
});
