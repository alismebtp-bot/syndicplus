import { describe,it,expect } from 'vitest';
import { categorize,afterGuardianCannotResolve,type RouteInput } from '../../src/routing-categories';
const base:RouteInput={scenario:1,severity:'normal',guardianOnDuty:true,guardianMayCheck:true,contractAvailable:true,validPreauthorization:false};
describe('classification métier multi-scénarios',()=>{
 it('couvre les 36 scénarios',()=>{for(let scenario=1;scenario<=36;scenario++)expect(categorize({...base,scenario}).pathway).toMatch(/^P[1-6]$/)});
 it('route un petit entretien au gardien sans gestionnaire en premier',()=>{expect(categorize(base).first).toBe('guardian')});
 it('court-circuite le gardien absent',()=>{expect(categorize({...base,guardianOnDuty:false}).first).toBe('manager')});
 it('donne priorité absolue aux dangers',()=>{for(let scenario=1;scenario<=36;scenario++){const r=categorize({...base,scenario,severity:'urgent'});expect(r.pathway).toBe('P5');expect(r.first).toBe('emergency');expect(r.notify).toContain('council_president')}});
 it('notifie le gardien en service sur urgence',()=>{expect(categorize({...base,severity:'urgent'}).notify).toContain('guardian');expect(categorize({...base,severity:'urgent',guardianOnDuty:false}).notify).not.toContain('guardian')});
 it('priorise les contrats existants pour la maintenance',()=>{expect(categorize({...base,scenario:7}).first).toBe('contractor');expect(categorize({...base,scenario:7,contractAvailable:false}).first).toBe('manager')});
 it('n affecte pas sans préautorisation explicite',()=>{expect(afterGuardianCannotResolve(base)).toBe('manager_approval');expect(afterGuardianCannotResolve({...base,validPreauthorization:true})).toBe('propose_auto_assignment')});
 it('refuse les scénarios inconnus',()=>expect(()=>categorize({...base,scenario:99})).toThrow());
});