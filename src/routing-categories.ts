/** Classification de parcours V2 : suggestions déterministes, jamais autorisation de dépense. */
export type Pathway = 'P1'|'P2'|'P3'|'P4'|'P5'|'P6';
export type Severity = 'normal'|'urgent';
export interface RouteInput { scenario:number; severity:Severity; guardianOnDuty:boolean; guardianMayCheck:boolean; contractAvailable:boolean; validPreauthorization:boolean }
export interface RouteDecision { pathway:Pathway; first:'guardian'|'contractor'|'manager'|'emergency'; notify:readonly string[]; requiresManagerDecision:boolean; reason:string; fallback:'manager'|'backup_or_manager'; }
const NORMAL_PATHS:Record<number,Pathway> = {
  1:'P1',2:'P2',3:'P1',4:'P5',5:'P2',6:'P2',7:'P2',8:'P1',9:'P2',10:'P4',
  11:'P3',12:'P1',13:'P1',14:'P2',15:'P5',16:'P6',17:'P1',18:'P2',19:'P5',
  20:'P5',21:'P1',22:'P2',23:'P5',24:'P5',25:'P2',26:'P5',27:'P5',28:'P4',
  29:'P3',30:'P4',31:'P2',32:'P3',33:'P2',34:'P2',35:'P5',36:'P6'
};
export function categorize(input:RouteInput):RouteDecision {
  const category = NORMAL_PATHS[input.scenario];
  if (!category) throw new RangeError('Scénario inconnu : revue humaine nécessaire');
  const pathway=input.severity==='urgent'?'P5':category;
  if(pathway==='P5')return {pathway,first:'emergency',notify:input.guardianOnDuty?['manager','council_president','guardian']:['manager','council_president'],requiresManagerDecision:true,reason:'Urgence : procédure de sécurité prioritaire, alertes parallèles, aucun délai lié au gardien',fallback:'backup_or_manager'};
  const guardian=input.guardianOnDuty&&input.guardianMayCheck;
  if(pathway==='P1')return {pathway,first:guardian?'guardian':'manager',notify:[],requiresManagerDecision:!guardian&&!input.validPreauthorization,reason:guardian?'Petit entretien : gardien autorisé en premier':'Gardien indisponible ou mission non autorisée',fallback:'backup_or_manager'};
  if(pathway==='P2')return {pathway,first:input.contractAvailable?'contractor':'manager',notify:['affected_residents'],requiresManagerDecision:!input.contractAvailable,reason:'Maintenance : contrat existant prioritaire',fallback:'manager'};
  return {pathway,first:'manager',notify:pathway==='P6'?['council_summary']:[],requiresManagerDecision:true,reason:'Devis, assurance ou projet : validation humaine selon pouvoirs et contrats',fallback:'manager'};
}
/** Après échec du gardien : affectation proposée seulement si un engagement préautorisé est documenté. */
export function afterGuardianCannotResolve(input:RouteInput):'propose_auto_assignment'|'manager_approval' {
  return input.severity==='normal'&&input.validPreauthorization ? 'propose_auto_assignment':'manager_approval';
}
