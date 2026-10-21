/** Sprint 1: politique de droits indépendante du transport et de la base de données.
 * Cette couche n'authentifie PERSONNE : une identité vérifiée côté serveur reste obligatoire.
 */
export type Role = 'resident' | 'manager' | 'cabinet_admin' | 'provider';
export type Action = 'read' | 'create' | 'update' | 'assign';
export interface Principal {
  userId: string;
  cabinetId: string;
  role: Role;
  buildingIds: readonly string[];
}
export interface Resource {
  cabinetId: string;
  buildingId: string;
  reporterId?: string;
  assignedProviderIds?: readonly string[];
}
export function canAccess(principal: Principal | null, resource: Resource, action: Action): boolean {
  if (!principal?.userId || !principal.cabinetId || !resource.cabinetId || !resource.buildingId) return false;
  if (principal.cabinetId !== resource.cabinetId) return false;
  if (principal.role === 'cabinet_admin') return true;
  if (!principal.buildingIds.includes(resource.buildingId)) return false;
  if (principal.role === 'manager') return true;
  if (principal.role === 'resident') {
    if (action === 'create') return true;
    return action === 'read' && resource.reporterId === principal.userId;
  }
  if (principal.role === 'provider') {
    return action === 'read' && Boolean(resource.assignedProviderIds?.includes(principal.userId));
  }
  return false;
}
