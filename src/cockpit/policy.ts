/**
 * Politique d'accès du cockpit (pure, testée). Toute vérification est refaite côté serveur avant chaque action.
 * Le responsable supervise SON périmètre (cabinet + copropriétés) ; il ne reçoit aucun pouvoir de décision
 * juridique ou financière du simple fait de son rôle.
 */
import type { Principal } from './identity';

export interface Verdict {
  ok: boolean;
  reason: string;
}

const ok = (reason = 'Autorisé'): Verdict => ({ ok: true, reason });
const no = (reason: string): Verdict => ({ ok: false, reason });

export function canSupervise(p: Principal | null): Verdict {
  if (!p) return no('Authentification requise.');
  if (p.role !== 'cabinet_director') return no('Espace réservé au responsable de cabinet.');
  if (p.coproIds.length === 0) return no('Aucune copropriété dans votre périmètre.');
  return ok();
}

export function inScope(p: Principal, cabinetId: string | null, coproId: string | null): boolean {
  return Boolean(cabinetId && coproId && cabinetId === p.cabinetId && p.coproIds.includes(coproId));
}

export interface TargetUser {
  id: string;
  cabinetId: string;
  role: string;
  active: boolean;
  absentToday: boolean;
}

export function canReassign(p: Principal, dossier: { cabinetId: string | null; coproId: string | null; closed: boolean; assigneeId: string | null }, target: TargetUser | null): Verdict {
  const sup = canSupervise(p);
  if (!sup.ok) return sup;
  if (!inScope(p, dossier.cabinetId, dossier.coproId)) return no('Dossier hors de votre périmètre.');
  if (dossier.closed) return no('Dossier clôturé : réaffectation inutile.');
  if (!target) return no('Gestionnaire introuvable.');
  if (target.cabinetId !== p.cabinetId) return no('Ce gestionnaire n’appartient pas à votre cabinet.');
  if (target.role !== 'manager') return no('Le suivi ne peut être confié qu’à un gestionnaire.');
  if (!target.active) return no('Ce gestionnaire n’est pas actif.');
  if (target.absentToday) return no('Ce gestionnaire est absent aujourd’hui.');
  if (target.id === dossier.assigneeId) return no('Ce gestionnaire suit déjà le dossier.');
  return ok('Réaffectation du suivi : les règles de procédure et les pouvoirs de décision restent inchangés.');
}

export function canSetReplacement(p: Principal, absent: TargetUser | null, replacement: TargetUser | null): Verdict {
  const sup = canSupervise(p);
  if (!sup.ok) return sup;
  if (!absent || absent.cabinetId !== p.cabinetId || absent.role !== 'manager') return no('Gestionnaire absent introuvable dans votre cabinet.');
  if (replacement) {
    if (replacement.cabinetId !== p.cabinetId || replacement.role !== 'manager' || !replacement.active) return no('Le remplaçant doit être un gestionnaire actif de votre cabinet.');
    if (replacement.id === absent.id) return no('Le remplaçant doit être une autre personne.');
    if (replacement.absentToday) return no('Le remplaçant est lui-même absent.');
  }
  return ok();
}
