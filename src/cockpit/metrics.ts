/**
 * Indicateurs et analyses du cockpit — fonctions PURES calculées sur les données réellement enregistrées.
 * Règles : aucun chiffre inventé ; une donnée absente est affichée « non renseignée » ; aucun classement
 * de personnes ; aucun prestataire déclaré « défaillant » ; clôture administrative ≠ satisfaction.
 */
import { getIncidentType, PATHWAYS, type Pathway } from '../procedures/catalog';
import { findRecurrences, type CaseSnapshot } from '../procedures/automation';
import type { CAbsence, CDossier, CFinancial, Snapshot } from './data';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const CLOSED_STATUS = 'Résolu';
export const STALE_DAYS = 7;
export const RESERVE_ALERT_DAYS = 15;
export const DECISION_ALERT_DAYS = 7;

export const isOpen = (d: CDossier) => d.status !== CLOSED_STATUS;
export const ref = (num: number) => `D-${num}`;
const today = (now: number) => new Date(now).toISOString().slice(0, 10);
const euros = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ')} € HT`;

// ---------- Personnes et absences ----------

export function currentAbsence(s: Snapshot, userId: string): CAbsence | undefined {
  const d = today(s.now);
  return s.absences.find((a) => a.userId === userId && a.startsOn <= d && d <= a.endsOn);
}
export function nextAbsence(s: Snapshot, userId: string): CAbsence | undefined {
  const d = today(s.now);
  return s.absences.find((a) => a.userId === userId && a.startsOn > d);
}
export const userName = (s: Snapshot, id: string | null) => (id ? s.users.find((u) => u.id === id)?.name ?? 'Inconnu' : null);

/** Qui suit réellement le dossier aujourd'hui (remplaçant si le titulaire est absent). */
export function effectiveOwner(s: Snapshot, d: CDossier): { id: string | null; name: string; note: string | null } {
  if (!d.assigneeId) return { id: null, name: 'Non affecté', note: null };
  const abs = currentAbsence(s, d.assigneeId);
  const name = userName(s, d.assigneeId) ?? 'Inconnu';
  if (!abs) return { id: d.assigneeId, name, note: null };
  if (abs.replacementId) return { id: abs.replacementId, name: userName(s, abs.replacementId) ?? 'Inconnu', note: `Remplace ${name} (absent jusqu’au ${abs.endsOn})` };
  return { id: d.assigneeId, name, note: `Absent jusqu’au ${abs.endsOn}, sans remplaçant désigné` };
}

// ---------- Récurrences (moteur d'automatisation existant, par copropriété) ----------

export function recurrences(s: Snapshot) {
  const out: { coproId: string; message: string; nums: number[]; count: number }[] = [];
  for (const c of s.copros) {
    const cases: CaseSnapshot[] = s.dossiers
      .filter((d) => d.coproId === c.id && d.typeId)
      .map((d) => ({
        id: String(d.num), typeId: d.typeId!, location: d.place, description: d.description, status: d.status, pathway: (d.pathway as Pathway) ?? null,
        createdAt: d.createdAt, updatedAt: d.updatedAt, deadlineHours: null, nextActor: '', history: [], missing: [],
      }));
    for (const r of findRecurrences(cases, s.now)) out.push({ coproId: c.id, message: `${c.name} — ${r.message}`, nums: r.ids.map(Number), count: r.count });
  }
  return out;
}

// ---------- Signaux par dossier (Centre incidents) ----------

export type FlagCode = 'urgent' | 'late' | 'no_next_action' | 'unassigned' | 'owner_absent' | 'failed_intervention' | 'open_reserves' | 'recurring' | 'stale' | 'contested' | 'priority';
export const FLAG_LABELS: Record<FlagCode, string> = {
  urgent: 'Urgent',
  late: 'En retard',
  no_next_action: 'Sans prochaine action',
  unassigned: 'Non affecté',
  owner_absent: 'Responsable absent',
  failed_intervention: 'Intervention échouée',
  open_reserves: 'Réserves non levées',
  recurring: 'Panne récurrente',
  stale: `Sans mise à jour depuis ${STALE_DAYS} j`,
  contested: 'Contesté / rouvert',
  priority: 'Prioritaire (signalé)',
};

export interface Flag { code: FlagCode; label: string; detail: string }

export function dossierFlags(s: Snapshot, d: CDossier, recurringNums: Set<number>): Flag[] {
  const f: Flag[] = [];
  const add = (code: FlagCode, detail: string) => f.push({ code, label: FLAG_LABELS[code], detail });
  const open = isOpen(d);
  if (open && d.pathway === 'P5') add('urgent', 'Parcours P5 (urgence) en cours');
  if (open && d.nextActionDue !== null && d.nextActionDue < s.now) add('late', `Échéance dépassée de ${fmtDuration(s.now - d.nextActionDue)}`);
  if (open && !d.nextAction) add('no_next_action', 'Aucune prochaine action enregistrée');
  if (open && !d.assigneeId) add('unassigned', 'Aucun gestionnaire affecté');
  if (open && d.assigneeId) {
    const abs = currentAbsence(s, d.assigneeId);
    if (abs && !abs.replacementId) add('owner_absent', `${userName(s, d.assigneeId)} absent jusqu’au ${abs.endsOn}, sans remplaçant`);
  }
  const failed = s.interventions.filter((i) => i.dossierNum === d.num && i.status === 'failed').length;
  if (open && failed) add('failed_intervention', `${failed} intervention${failed > 1 ? 's' : ''} sans résolution`);
  const reserves = s.reserves.filter((r) => r.dossierNum === d.num && r.liftedAt === null);
  if (reserves.length) add('open_reserves', `${reserves.length} réserve${reserves.length > 1 ? 's' : ''} non levée${reserves.length > 1 ? 's' : ''} (la plus ancienne : ${fmtDuration(s.now - Math.min(...reserves.map((r) => r.raisedAt)))})`);
  if (recurringNums.has(d.num)) add('recurring', 'Même type de panne au même endroit, 3 fois ou plus en 90 jours');
  if (open && s.now - d.updatedAt > STALE_DAYS * DAY) add('stale', `Dernière mise à jour il y a ${fmtDuration(s.now - d.updatedAt)}`);
  if (d.contested || d.reopenedCount > 0) add('contested', d.reopenedCount ? `Rouvert ${d.reopenedCount} fois` : 'Résultat contesté');
  if (open && d.flagged) add('priority', 'Signalé prioritaire par la direction');
  return f;
}

export function fmtDuration(msDelta: number): string {
  const h = Math.max(0, Math.round(msDelta / HOUR));
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} j`;
}

export function dossierView(s: Snapshot, d: CDossier, recurringNums: Set<number>) {
  const copro = s.copros.find((c) => c.id === d.coproId);
  const owner = effectiveOwner(s, d);
  const type = d.typeId ? getIncidentType(d.typeId) : undefined;
  return {
    ref: ref(d.num),
    num: d.num,
    coproId: d.coproId,
    coproName: copro?.name ?? '—',
    typeLabel: type?.label ?? d.type,
    place: d.place,
    description: d.description,
    pathway: d.pathway,
    pathwayLabel: d.pathway ? PATHWAYS[d.pathway as Pathway]?.label ?? d.pathway : null,
    status: d.status,
    open: isOpen(d),
    assigneeId: d.assigneeId,
    assigneeName: userName(s, d.assigneeId),
    owner,
    providerName: d.providerId ? s.providers.find((p) => p.id === d.providerId)?.name ?? null : null,
    nextAction: d.nextAction,
    nextActionDue: d.nextActionDue,
    flagged: d.flagged,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    closedAt: d.closedAt,
    flags: dossierFlags(s, d, recurringNums),
  };
}
export type DossierView = ReturnType<typeof dossierView>;

export function allDossierViews(s: Snapshot): DossierView[] {
  const rec = new Set(recurrences(s).flatMap((r) => r.nums));
  return s.dossiers.map((d) => dossierView(s, d, rec));
}

// ---------- Vue globale ----------

export interface Kpi { id: string; label: string; value: number; page: string; filter: string; hint: string }

export function overview(s: Snapshot) {
  const views = allDossierViews(s);
  const open = views.filter((v) => v.open);
  const has = (code: FlagCode) => open.filter((v) => v.flags.some((f) => f.code === code)).length;
  const managers = s.users.filter((u) => u.role === 'manager' && u.active);
  const uncovered = managers.filter((m) => {
    const a = currentAbsence(s, m.id);
    return a && !a.replacementId;
  }).length;
  const pendingDecisions = s.decisions.filter((d) => d.status === 'pending').length;
  const kpis: Kpi[] = [
    { id: 'open', label: 'Dossiers ouverts', value: open.length, page: 'incidents', filter: 'open', hint: 'Tous les dossiers non résolus de votre périmètre' },
    { id: 'urgent', label: 'Urgences en cours', value: has('urgent'), page: 'incidents', filter: 'urgent', hint: 'Parcours P5 non clôturés' },
    { id: 'late', label: 'En retard', value: has('late'), page: 'incidents', filter: 'late', hint: 'Échéance de la prochaine action dépassée' },
    { id: 'no_next_action', label: 'Sans prochaine action', value: has('no_next_action'), page: 'incidents', filter: 'no_next_action', hint: 'Aucune suite enregistrée' },
    { id: 'unassigned', label: 'Non affectés', value: has('unassigned'), page: 'incidents', filter: 'unassigned', hint: 'Aucun gestionnaire désigné' },
    { id: 'open_reserves', label: 'Réserves non levées', value: views.filter((v) => v.flags.some((f) => f.code === 'open_reserves')).length, page: 'incidents', filter: 'open_reserves', hint: 'Dossiers avec au moins une réserve ouverte' },
    { id: 'pending_decisions', label: 'Décisions en attente', value: pendingDecisions, page: 'finances', filter: 'decisions', hint: 'Préparées, pas encore prises par l’instance habilitée' },
    { id: 'uncovered', label: 'Absences non couvertes', value: uncovered, page: 'equipe', filter: 'absent', hint: 'Gestionnaires absents aujourd’hui sans remplaçant' },
  ];
  return { cabinetName: s.cabinetName, coproCount: s.copros.length, kpis, attention: attention(s, views), generatedAt: s.now };
}

// ---------- « Nécessite votre attention » / briefing ----------

export type ActionKind = 'request_update' | 'reassign' | 'set_replacement' | 'flag_priority' | 'request_verification' | 'schedule_review' | 'prepare_decision' | 'consult';
export interface AttentionItem {
  id: string;
  severity: 'high' | 'medium';
  title: string;
  justification: string;
  dossiers: string[];
  action: { kind: ActionKind; label: string; target: string };
  responsible: string;
  lastUpdate: number | null;
  sources: string[];
}

export function attention(s: Snapshot, views = allDossierViews(s)): AttentionItem[] {
  const items: AttentionItem[] = [];
  const open = views.filter((v) => v.open);
  const flag = (v: DossierView, c: FlagCode) => v.flags.find((f) => f.code === c);

  for (const v of open) {
    const late = flag(v, 'late');
    if (flag(v, 'urgent') && late) {
      items.push({
        id: `urgent-late-${v.num}`, severity: 'high', title: `Urgence ${v.ref} — échéance dépassée`,
        justification: `${v.typeLabel} (${v.coproName}). ${late.detail}. Prochaine action prévue : ${v.nextAction ?? 'aucune'}.`,
        dossiers: [v.ref], action: { kind: 'request_update', label: 'Demander un point immédiat', target: v.ref },
        responsible: v.owner.name, lastUpdate: v.updatedAt, sources: [`Dossier ${v.ref} : échéance et parcours P5`],
      });
    }
  }
  // Absences non couvertes avec dossiers ouverts
  for (const m of s.users.filter((u) => u.role === 'manager' && u.active)) {
    const a = currentAbsence(s, m.id);
    if (!a || a.replacementId) continue;
    const mine = open.filter((v) => v.assigneeId === m.id);
    if (!mine.length) continue;
    items.push({
      id: `absence-${m.id}`, severity: mine.some((v) => flag(v, 'urgent') || flag(v, 'late')) ? 'high' : 'medium',
      title: `${m.name} absent(e) sans remplaçant`,
      justification: `Absence du ${a.startsOn} au ${a.endsOn}. ${mine.length} dossier${mine.length > 1 ? 's' : ''} ouvert${mine.length > 1 ? 's' : ''} sans suivi assuré.`,
      dossiers: mine.map((v) => v.ref), action: { kind: 'set_replacement', label: 'Désigner un remplaçant', target: m.id },
      responsible: 'Vous (responsable de cabinet)', lastUpdate: Math.max(...mine.map((v) => v.updatedAt)), sources: [`Absence enregistrée (${a.startsOn} → ${a.endsOn})`, ...mine.map((v) => `Dossier ${v.ref}`)],
    });
  }
  for (const v of open) {
    if (flag(v, 'unassigned')) {
      items.push({
        id: `unassigned-${v.num}`, severity: 'medium', title: `${v.ref} non affecté`,
        justification: `${v.typeLabel} (${v.coproName}), signalé il y a ${fmtDuration(s.now - v.createdAt)}, aucun gestionnaire désigné.`,
        dossiers: [v.ref], action: { kind: 'reassign', label: 'Affecter un gestionnaire', target: v.ref },
        responsible: 'Non affecté', lastUpdate: v.updatedAt, sources: [`Dossier ${v.ref}`],
      });
    }
    const late = flag(v, 'late');
    if (late && !flag(v, 'urgent')) {
      items.push({
        id: `late-${v.num}`, severity: 'medium', title: `${v.ref} en retard`,
        justification: `${v.typeLabel} (${v.coproName}). ${late.detail}. Prochaine action : ${v.nextAction ?? 'aucune'}.`,
        dossiers: [v.ref], action: { kind: 'request_update', label: 'Demander un point', target: v.ref },
        responsible: v.owner.name, lastUpdate: v.updatedAt, sources: [`Dossier ${v.ref} : échéance de la prochaine action`],
      });
    }
    if (flag(v, 'no_next_action') && !flag(v, 'unassigned')) {
      items.push({
        id: `nonext-${v.num}`, severity: 'medium', title: `${v.ref} sans prochaine action`,
        justification: `${v.typeLabel} (${v.coproName}), dernière mise à jour il y a ${fmtDuration(s.now - v.updatedAt)}.`,
        dossiers: [v.ref], action: { kind: 'request_update', label: 'Demander la prochaine action', target: v.ref },
        responsible: v.owner.name, lastUpdate: v.updatedAt, sources: [`Dossier ${v.ref}`],
      });
    }
    const failed = flag(v, 'failed_intervention');
    if (failed && s.interventions.filter((i) => i.dossierNum === v.num && i.status === 'failed').length >= 2) {
      items.push({
        id: `failed-${v.num}`, severity: 'medium', title: `${v.ref} : plusieurs interventions sans résolution`,
        justification: `${failed.detail} (${v.providerName ?? 'prestataire non renseigné'}). Les causes peuvent être multiples (pièce, accès, diagnostic).`,
        dossiers: [v.ref], action: { kind: 'request_verification', label: 'Demander une vérification', target: v.ref },
        responsible: v.owner.name, lastUpdate: v.updatedAt, sources: [`Interventions du dossier ${v.ref}`],
      });
    }
  }
  for (const v of views) {
    const old = s.reserves.filter((r) => r.dossierNum === v.num && r.liftedAt === null && s.now - r.raisedAt > RESERVE_ALERT_DAYS * DAY);
    if (old.length) {
      items.push({
        id: `reserves-${v.num}`, severity: 'medium', title: `${v.ref} : réserves non levées depuis plus de ${RESERVE_ALERT_DAYS} jours`,
        justification: old.map((r) => r.description).join(' ; '),
        dossiers: [v.ref], action: { kind: 'request_update', label: 'Demander un point sur la levée', target: v.ref },
        responsible: v.owner.name, lastUpdate: v.updatedAt, sources: [`Réserves du dossier ${v.ref}`],
      });
    }
  }
  for (const d of s.decisions.filter((x) => x.status === 'pending' && s.now - x.preparedAt > DECISION_ALERT_DAYS * DAY)) {
    const v = views.find((x) => x.num === d.dossierNum);
    items.push({
      id: `decision-${d.id}`, severity: 'medium', title: `Décision en attente depuis ${fmtDuration(s.now - d.preparedAt)}`,
      justification: `${d.label}${d.amountHt !== null ? ` (${euros(d.amountHt)})` : ''}. Autorité : ${d.authority}.`,
      dossiers: [ref(d.dossierNum)], action: { kind: 'request_update', label: 'Demander où en est la décision', target: ref(d.dossierNum) },
      responsible: v?.owner.name ?? '—', lastUpdate: d.preparedAt, sources: [`Décision préparée le ${new Date(d.preparedAt).toISOString().slice(0, 10)}`],
    });
  }
  for (const r of recurrences(s)) {
    const openOnes = views.filter((v) => r.nums.includes(v.num) && v.open);
    const target = openOnes[0] ?? views.find((v) => v.num === r.nums[r.nums.length - 1]);
    if (!target) continue;
    items.push({
      id: `recurring-${r.nums.join('-')}`, severity: 'medium', title: 'Panne récurrente',
      justification: r.message, dossiers: r.nums.map(ref), action: { kind: 'request_verification', label: 'Demander une analyse de la cause', target: target.ref },
      responsible: target.owner.name, lastUpdate: Math.max(...views.filter((v) => r.nums.includes(v.num)).map((v) => v.updatedAt)), sources: r.nums.map((n) => `Dossier ${ref(n)}`),
    });
  }
  for (const c of contractStatus(s).filter((c) => c.state !== 'running')) {
    items.push({
      id: `contract-${c.id}`, severity: c.state === 'notice_passed' ? 'medium' : 'medium', title: `Contrat à revoir : ${c.label}`,
      justification: `${c.coproName} — ${c.providerName}. Fin le ${c.endsOn} ; ${c.stateLabel}.`,
      dossiers: [], action: { kind: 'schedule_review', label: 'Programmer une revue', target: `contract:${c.id}` },
      responsible: c.managerName ?? 'Gestionnaire non renseigné', lastUpdate: null, sources: [c.documentRef || 'Contrat (référence non renseignée)'],
    });
  }
  for (const ch of financeChains(s).filter((c) => c.alerts.length)) {
    items.push({
      id: `finance-${ch.chainId}`, severity: 'medium', title: `Écart financier : ${ch.label}`,
      justification: ch.alerts.join(' ; '), dossiers: ch.dossier ? [ch.dossier] : [],
      action: { kind: 'consult', label: 'Consulter les pièces', target: `chain:${ch.chainId}` },
      responsible: ch.managerName ?? '—', lastUpdate: ch.lastAt, sources: ch.stages.map((x) => x.documentRef || x.stageLabel),
    });
  }
  for (const q of s.satisfaction.filter((x) => x.score <= 2)) {
    const v = views.find((x) => x.num === q.dossierNum);
    if (!v) continue;
    items.push({
      id: `satisfaction-${q.dossierNum}`, severity: 'medium', title: `${v.ref} : retour résident défavorable`,
      justification: `Note ${q.score}/5${q.consent && q.comment ? ` — « ${q.comment} »` : ''}. Dossier ${v.open ? 'ouvert' : 'clôturé administrativement'}${v.flags.some((f) => f.code === 'contested') ? ', rouvert ou contesté' : ''}.`,
      dossiers: [v.ref], action: { kind: 'request_verification', label: 'Demander une vérification sur place', target: v.ref },
      responsible: v.owner.name, lastUpdate: q.collectedAt, sources: [`Questionnaire de satisfaction du ${new Date(q.collectedAt).toISOString().slice(0, 10)}`],
    });
  }
  // Urgences d'abord, puis autres points prioritaires, puis le reste (le plus ancien d'abord)
  const rank = (i: AttentionItem) => (i.id.startsWith('urgent-') ? 0 : i.severity === 'high' ? 1 : 2);
  return items.sort((a, b) => rank(a) - rank(b) || (a.lastUpdate ?? 0) - (b.lastUpdate ?? 0));
}

// ---------- Portefeuille ----------

export function portfolio(s: Snapshot) {
  const views = allDossierViews(s);
  const yearAgo = s.now - 365 * DAY;
  return s.copros.map((c) => {
    const mine = views.filter((v) => v.coproId === c.id);
    const open = mine.filter((v) => v.open);
    const count = (code: FlagCode) => open.filter((v) => v.flags.some((f) => f.code === code)).length;
    const paid12 = s.financial.filter((f) => f.coproId === c.id && f.stage === 'paid' && f.recordedAt >= yearAgo).reduce((t, f) => t + f.amountHt, 0);
    const contracts = contractStatus(s).filter((x) => x.coproId === c.id);
    return {
      id: c.id, name: c.name, address: c.address, lots: c.lots,
      managerId: c.managerId, managerName: userName(s, c.managerId), managerAbsent: c.managerId ? Boolean(currentAbsence(s, c.managerId)) : false,
      guardianName: userName(s, c.guardianId), presidentName: userName(s, c.presidentId),
      open: open.length, urgent: count('urgent'), late: count('late'), noNextAction: count('no_next_action'), unassigned: count('unassigned'),
      openReserves: mine.filter((v) => v.flags.some((f) => f.code === 'open_reserves')).length,
      recurring: mine.filter((v) => v.flags.some((f) => f.code === 'recurring')).length,
      lastIncidentAt: mine.length ? Math.max(...mine.map((v) => v.createdAt)) : null,
      budgetHt: c.budgetHt, paidLast12Ht: paid12,
      contracts: contracts.length, contractsToReview: contracts.filter((x) => x.state !== 'running').length,
      attentionSignals: count('urgent') + count('late') + count('unassigned') + count('no_next_action'),
    };
  });
}

export function coproDetail(s: Snapshot, id: string) {
  const row = portfolio(s).find((p) => p.id === id);
  if (!row) return null;
  const views = allDossierViews(s).filter((v) => v.coproId === id);
  return {
    ...row,
    dossiers: views,
    contracts: contractStatus(s).filter((c) => c.coproId === id),
    finance: financeChains(s).filter((c) => c.coproId === id),
    reviews: s.reviews.filter((r) => (r.entity === 'copro' && r.entityId === id) || (r.entity === 'dossier' && views.some((v) => String(v.num) === r.entityId))),
  };
}

// ---------- Équipe (aucun classement) ----------

export function team(s: Snapshot) {
  const views = allDossierViews(s).filter((v) => v.open);
  const managers = s.users.filter((u) => u.role === 'manager');
  return {
    note: 'Charge indicative : un nombre de dossiers ne mesure ni leur complexité ni la qualité du travail. Aucun classement n’est établi.',
    managers: managers.map((m) => {
      const mine = views.filter((v) => v.assigneeId === m.id);
      const covering = views.filter((v) => v.owner.id === m.id && v.assigneeId !== m.id);
      const abs = currentAbsence(s, m.id);
      const next = nextAbsence(s, m.id);
      const has = (c: FlagCode) => mine.filter((v) => v.flags.some((f) => f.code === c)).length;
      return {
        id: m.id, name: m.name, active: m.active,
        copros: s.copros.filter((c) => c.managerId === m.id).map((c) => c.name),
        open: mine.length, urgent: has('urgent'), late: has('late'), noNextAction: has('no_next_action'),
        covering: covering.map((v) => v.ref),
        oldestOpenDays: mine.length ? Math.round((s.now - Math.min(...mine.map((v) => v.createdAt))) / DAY) : null,
        absence: abs ? { id: abs.id, startsOn: abs.startsOn, endsOn: abs.endsOn, replacementId: abs.replacementId, replacementName: userName(s, abs.replacementId), current: true } : null,
        upcomingAbsence: next ? { id: next.id, startsOn: next.startsOn, endsOn: next.endsOn, replacementId: next.replacementId, replacementName: userName(s, next.replacementId), current: false } : null,
        dossiers: mine.map((v) => ({ ref: v.ref, typeLabel: v.typeLabel, coproName: v.coproName, flags: v.flags.map((f) => f.label) })),
      };
    }),
    // Seuls les dossiers du périmètre sont comptés ; les gestionnaires peuvent avoir d'autres dossiers hors périmètre.
    scopeNote: s.scopeAll ? null : 'Périmètre limité : seuls les dossiers de vos copropriétés sont comptés.',
  };
}

// ---------- Finances & contrats ----------

const STAGES: CFinancial['stage'][] = ['quote', 'authorized', 'ordered', 'invoiced', 'paid'];
export const STAGE_LABELS: Record<CFinancial['stage'], string> = {
  quote: 'Devis reçu', authorized: 'Dépense autorisée', ordered: 'Commande passée', invoiced: 'Facture reçue', paid: 'Payé',
};

export function financeChains(s: Snapshot) {
  const byChain = new Map<string, CFinancial[]>();
  for (const f of s.financial) byChain.set(f.chainId, [...(byChain.get(f.chainId) ?? []), f]);
  return [...byChain.entries()].map(([chainId, rows]) => {
    const last = (st: CFinancial['stage']) => [...rows].reverse().find((r) => r.stage === st);
    const at = Object.fromEntries(STAGES.map((st) => [st, last(st)])) as Record<CFinancial['stage'], CFinancial | undefined>;
    const alerts: string[] = [];
    if (at.ordered && !at.authorized) alerts.push('Commande sans autorisation de dépense enregistrée dans SyndicPlus : vérifier la pièce');
    if (at.invoiced && !at.ordered) alerts.push('Facture sans commande enregistrée');
    if (at.invoiced && at.ordered && at.invoiced.amountHt > at.ordered.amountHt) alerts.push(`Facture supérieure à la commande : +${euros(at.invoiced.amountHt - at.ordered.amountHt)}`);
    if (at.paid && !at.invoiced) alerts.push('Paiement sans facture enregistrée');
    if (at.paid && at.invoiced && at.paid.amountHt > at.invoiced.amountHt) alerts.push('Paiement supérieur à la facture enregistrée');
    const current = [...STAGES].reverse().find((st) => at[st]) ?? 'quote';
    const first = rows[0]!;
    const copro = s.copros.find((c) => c.id === first.coproId);
    const contract = first.contractId ? s.contracts.find((c) => c.id === first.contractId) : undefined;
    const d = first.dossierNum ? s.dossiers.find((x) => x.num === first.dossierNum) : undefined;
    return {
      chainId, coproId: first.coproId, coproName: copro?.name ?? '—', managerName: userName(s, copro?.managerId ?? null),
      dossier: first.dossierNum ? ref(first.dossierNum) : null,
      label: d ? `${d.description} (${copro?.name ?? ''})` : chainId,
      providerName: first.providerId ? s.providers.find((p) => p.id === first.providerId)?.name ?? null : null,
      contractLabel: contract?.label ?? null,
      currentStage: current, currentStageLabel: STAGE_LABELS[current],
      stages: STAGES.filter((st) => at[st]).map((st) => ({ stage: st, stageLabel: STAGE_LABELS[st], amountHt: at[st]!.amountHt, documentRef: at[st]!.documentRef, recordedAt: at[st]!.recordedAt, recordedBy: userName(s, at[st]!.recordedBy) })),
      alerts, lastAt: Math.max(...rows.map((r) => r.recordedAt)),
    };
  });
}

export function contractStatus(s: Snapshot) {
  return s.contracts.map((c) => {
    const end = Date.parse(`${c.endsOn}T00:00:00Z`);
    const noticeDeadline = end - c.noticeDays * DAY;
    const copro = s.copros.find((x) => x.id === c.coproId);
    let state: 'expired' | 'notice_passed' | 'notice_soon' | 'running' = 'running';
    let stateLabel = `en cours ; préavis à donner avant le ${new Date(noticeDeadline).toISOString().slice(0, 10)}`;
    if (end < s.now) { state = 'expired'; stateLabel = 'contrat échu'; }
    else if (noticeDeadline < s.now) { state = 'notice_passed'; stateLabel = `date limite de préavis dépassée (${new Date(noticeDeadline).toISOString().slice(0, 10)}) : vérifier la reconduction`; }
    else if (noticeDeadline - s.now < 60 * DAY) { state = 'notice_soon'; stateLabel = `préavis à donner avant le ${new Date(noticeDeadline).toISOString().slice(0, 10)}`; }
    return {
      id: c.id, coproId: c.coproId, coproName: copro?.name ?? '—', managerName: userName(s, copro?.managerId ?? null),
      providerName: s.providers.find((p) => p.id === c.providerId)?.name ?? '—', label: c.label, startsOn: c.startsOn, endsOn: c.endsOn,
      noticeDays: c.noticeDays, responseHours: c.responseHours, annualHt: c.annualHt, documentRef: c.documentRef, state, stateLabel,
    };
  });
}

export function finance(s: Snapshot) {
  const chains = financeChains(s);
  const sumCurrent = (st: CFinancial['stage']) => chains.reduce((t, c) => t + (c.stages.find((x) => x.stage === st)?.amountHt ?? 0), 0);
  return {
    note: 'Chaque montant correspond à une pièce enregistrée. Un devis n’est pas une autorisation, une autorisation n’est pas une commande, une facture n’est pas un paiement. SyndicPlus n’autorise aucune dépense.',
    totals: [
      { stage: 'quote', label: 'Devis reçus', count: chains.filter((c) => c.stages.some((x) => x.stage === 'quote')).length, amountHt: null, note: 'Montants non additionnés : plusieurs devis peuvent être des alternatives.' },
      ...(['authorized', 'ordered', 'invoiced', 'paid'] as const).map((st) => ({ stage: st, label: STAGE_LABELS[st], count: chains.filter((c) => c.stages.some((x) => x.stage === st)).length, amountHt: sumCurrent(st), note: null })),
    ],
    chains,
    decisions: s.decisions.map((d) => ({ ...d, ref: ref(d.dossierNum), preparedByName: userName(s, d.preparedBy) ?? d.preparedBy })),
    contracts: contractStatus(s),
  };
}

// ---------- Prestataires (contextualisé, jamais « défaillant ») ----------

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
};

export function providers(s: Snapshot) {
  return s.providers.map((p) => {
    const iv = s.interventions.filter((i) => i.providerId === p.id);
    const responses = iv.filter((i) => i.respondedAt !== null).map((i) => (i.respondedAt! - i.requestedAt) / HOUR);
    const punctual = iv.filter((i) => i.arrivedOnTime !== null);
    const reserves = s.reserves.filter((r) => r.providerId === p.id);
    const contracts = s.contracts.filter((c) => c.providerId === p.id);
    const contractual = contracts.map((c) => c.responseHours).filter((h): h is number => h !== null);
    const observations: string[] = [];
    const failedByDossier = new Map<number, number>();
    for (const i of iv.filter((x) => x.status === 'failed')) failedByDossier.set(i.dossierNum, (failedByDossier.get(i.dossierNum) ?? 0) + 1);
    for (const [num, n] of failedByDossier) observations.push(`${n} intervention${n > 1 ? 's' : ''} sans résolution sur ${ref(num)} — causes possibles : pièce, accès, diagnostic ; à vérifier avec le gestionnaire.`);
    const waiting = iv.filter((i) => i.status === 'requested' && i.respondedAt === null);
    for (const w of waiting) observations.push(`Demande du ${new Date(w.requestedAt).toISOString().slice(0, 10)} (${ref(w.dossierNum)}) sans réponse enregistrée depuis ${fmtDuration(s.now - w.requestedAt)}.`);
    const openRes = reserves.filter((r) => r.liftedAt === null);
    if (openRes.length >= 2) observations.push(`${openRes.length} réserves non levées (${[...new Set(openRes.map((r) => ref(r.dossierNum)))].join(', ')}).`);
    return {
      id: p.id, name: p.name, trades: p.trades,
      interventions: iv.length,
      sampleWarning: iv.length < 5 ? `Échantillon faible (${iv.length} intervention${iv.length > 1 ? 's' : ''}) : à interpréter avec prudence.` : null,
      medianResponseHours: responses.length ? Math.round(median(responses)! * 10) / 10 : null,
      contractualResponseHours: contractual.length ? Math.min(...contractual) : null,
      onTime: punctual.length ? { known: punctual.length, onTime: punctual.filter((i) => i.arrivedOnTime).length } : null,
      failed: iv.filter((i) => i.status === 'failed').length,
      rework: iv.filter((i) => i.rework).length,
      reservesOpen: openRes.length,
      reservesLifted: reserves.filter((r) => r.liftedAt !== null).length,
      contracts: contracts.map((c) => c.label),
      observations,
    };
  });
}

// ---------- Qualité & satisfaction ----------

export function quality(s: Snapshot) {
  const since = s.now - 90 * DAY;
  const closed = s.dossiers.filter((d) => !isOpen(d) && (d.closedAt ?? d.updatedAt) >= since);
  const answers = s.satisfaction.filter((q) => closed.some((d) => d.num === q.dossierNum));
  const avg = answers.length ? Math.round((answers.reduce((t, q) => t + q.score, 0) / answers.length) * 10) / 10 : null;
  return {
    note: 'Une clôture administrative ne signifie pas que le résident est satisfait. La satisfaction n’est mesurée que sur les réponses reçues.',
    periodDays: 90,
    closed: closed.length,
    answered: answers.length,
    responseRate: closed.length ? Math.round((answers.length / closed.length) * 100) : null,
    averageScore: avg,
    sampleWarning: answers.length < 5 ? `Peu de réponses (${answers.length}) : moyenne indicative seulement.` : null,
    reopened: s.dossiers.filter((d) => d.reopenedCount > 0).map((d) => ref(d.num)),
    contested: s.dossiers.filter((d) => d.contested).map((d) => ref(d.num)),
    lowScores: answers.filter((q) => q.score <= 2).map((q) => ({ ref: ref(q.dossierNum), score: q.score, comment: q.consent ? q.comment : '(commentaire non publié : pas de consentement)' })),
    closedWithoutFeedback: closed.filter((d) => !answers.some((q) => q.dossierNum === d.num)).map((d) => ref(d.num)),
    comments: answers.filter((q) => q.consent && q.comment).map((q) => ({ ref: ref(q.dossierNum), score: q.score, comment: q.comment })),
  };
}

// ---------- Assistant (règles déterministes, pas d'IA générative) ----------

export const ASSISTANT_QUESTIONS = [
  { id: 'priorities', label: 'Que dois-je traiter en priorité aujourd’hui ?' },
  { id: 'late', label: 'Quels dossiers sont en retard ou sans prochaine action ?' },
  { id: 'team', label: 'Mon équipe est-elle en capacité ? Des absences non couvertes ?' },
  { id: 'copros', label: 'Quelles copropriétés demandent de l’attention ?' },
  { id: 'providers', label: 'Quels prestataires nécessitent un point ?' },
  { id: 'finance', label: 'Quelles dépenses ou décisions sont en attente ?' },
  { id: 'contracts', label: 'Quels contrats arrivent à échéance ?' },
  { id: 'recurring', label: 'Y a-t-il des pannes récurrentes ?' },
  { id: 'quality', label: 'Les interventions clôturées ont-elles satisfait les résidents ?' },
] as const;
export type QuestionId = (typeof ASSISTANT_QUESTIONS)[number]['id'];

export interface AssistantAnswer {
  question: string;
  engine: string;
  summary: string;
  facts: { text: string; source: string }[];
  confidence: { level: 'élevée' | 'moyenne' | 'faible'; reason: string };
  recommendations: string[];
  nextAction: { kind: ActionKind | 'open_page'; label: string; target: string } | null;
}

export function assistant(s: Snapshot, q: QuestionId): AssistantAnswer {
  const question = ASSISTANT_QUESTIONS.find((x) => x.id === q)!.label;
  const engine = 'Règles déterministes appliquées aux données enregistrées — pas d’IA générative.';
  const base = { question, engine };
  const views = allDossierViews(s);
  const open = views.filter((v) => v.open);
  const fact = (text: string, source: string) => ({ text, source });
  const high = (reason = 'Calcul direct sur les données enregistrées.') => ({ level: 'élevée' as const, reason });

  switch (q) {
    case 'priorities': {
      const items = attention(s, views);
      const top = items.slice(0, 5);
      return {
        ...base,
        summary: items.length ? `${items.length} point${items.length > 1 ? 's' : ''} demande${items.length > 1 ? 'nt' : ''} votre attention, dont ${items.filter((i) => i.severity === 'high').length} prioritaire${items.filter((i) => i.severity === 'high').length > 1 ? 's' : ''}.` : 'Aucun point d’attention détecté dans votre périmètre.',
        facts: top.map((i) => fact(`${i.title} — ${i.justification}`, i.sources.join(' · '))),
        confidence: high('Règles explicites (échéances, absences, affectations, réserves, décisions) ; la gravité réelle reste à apprécier.'),
        recommendations: top.map((i) => `${i.action.label} (${i.responsible})`),
        nextAction: top[0] ? { kind: top[0].action.kind, label: top[0].action.label, target: top[0].action.target } : null,
      };
    }
    case 'late': {
      const late = open.filter((v) => v.flags.some((f) => f.code === 'late' || f.code === 'no_next_action'));
      return {
        ...base,
        summary: late.length ? `${late.length} dossier${late.length > 1 ? 's' : ''} en retard ou sans prochaine action.` : 'Aucun dossier en retard ni sans prochaine action.',
        facts: late.map((v) => fact(`${v.ref} — ${v.typeLabel}, ${v.coproName} : ${v.flags.filter((f) => f.code === 'late' || f.code === 'no_next_action').map((f) => f.detail).join(' ; ')} (suivi : ${v.owner.name})`, `Dossier ${v.ref}`)),
        confidence: high(),
        recommendations: late.length ? ['Demander un point aux gestionnaires concernés', 'Réaffecter les dossiers dont le responsable est absent sans remplaçant'] : [],
        nextAction: late[0] ? { kind: 'request_update', label: `Demander un point sur ${late[0].ref}`, target: late[0].ref } : null,
      };
    }
    case 'team': {
      const t = team(s);
      const uncovered = t.managers.filter((m) => m.absence && !m.absence.replacementId);
      return {
        ...base,
        summary: uncovered.length ? `${uncovered.length} absence${uncovered.length > 1 ? 's' : ''} sans remplaçant : ${uncovered.map((m) => m.name).join(', ')}.` : 'Aucune absence non couverte aujourd’hui.',
        facts: t.managers.map((m) => fact(`${m.name} : ${m.open} dossier${m.open > 1 ? 's' : ''} ouvert${m.open > 1 ? 's' : ''} (${m.urgent} urgence${m.urgent > 1 ? 's' : ''}, ${m.late} en retard)${m.absence ? ` — absent(e) du ${m.absence.startsOn} au ${m.absence.endsOn}${m.absence.replacementName ? `, remplacé(e) par ${m.absence.replacementName}` : ', sans remplaçant'}` : ''}`, 'Affectations des dossiers et absences enregistrées')),
        confidence: { level: 'moyenne', reason: 'Le nombre de dossiers ne mesure pas leur complexité ; à compléter par un échange avec l’équipe.' },
        recommendations: uncovered.length ? ['Désigner un remplaçant ou réaffecter les dossiers urgents'] : [],
        nextAction: uncovered[0] ? { kind: 'set_replacement', label: `Désigner un remplaçant pour ${uncovered[0].name}`, target: uncovered[0].id } : null,
      };
    }
    case 'copros': {
      const rows = portfolio(s).filter((p) => p.attentionSignals > 0 || p.openReserves > 0 || p.recurring > 0 || p.contractsToReview > 0);
      return {
        ...base,
        summary: rows.length ? `${rows.length} copropriété${rows.length > 1 ? 's' : ''} sur ${s.copros.length} présente${rows.length > 1 ? 'nt' : ''} au moins un signal.` : 'Aucune copropriété ne présente de signal.',
        facts: rows.map((p) => fact(`${p.name} : ${p.urgent} urgence(s), ${p.late} en retard, ${p.unassigned} non affecté(s), ${p.noNextAction} sans prochaine action, ${p.openReserves} avec réserves, ${p.recurring} récurrent(s), ${p.contractsToReview} contrat(s) à revoir${p.lots === null ? ' — nombre de lots non renseigné' : ''}`, `Fiche ${p.name}`)),
        confidence: high('Comptage des signaux ; ces signaux ne sont pas pondérés et ne constituent pas un classement.'),
        recommendations: rows.length ? ['Ouvrir la fiche de chaque copropriété signalée'] : [],
        nextAction: rows[0] ? { kind: 'open_page', label: `Ouvrir la fiche ${rows[0].name}`, target: `portefeuille/${rows[0].id}` } : null,
      };
    }
    case 'providers': {
      const rows = providers(s).filter((p) => p.observations.length);
      return {
        ...base,
        summary: rows.length ? `${rows.length} prestataire${rows.length > 1 ? 's' : ''} avec des observations à examiner (aucune conclusion sur leur fiabilité).` : 'Aucune observation particulière.',
        facts: rows.flatMap((p) => p.observations.map((o) => fact(`${p.name} : ${o}`, 'Interventions et réserves enregistrées'))),
        confidence: { level: rows.some((p) => p.sampleWarning) ? 'faible' : 'moyenne', reason: 'Peu d’interventions par prestataire ; les causes (pièces, accès, diagnostic) ne sont pas connues de l’application.' },
        recommendations: rows.length ? ['Faire un point avec le gestionnaire avant toute conclusion', 'Programmer une revue de contrat si les observations se répètent'] : [],
        nextAction: rows[0] ? { kind: 'open_page', label: `Voir ${rows[0].name}`, target: 'prestataires' } : null,
      };
    }
    case 'finance': {
      const f = finance(s);
      const pending = f.decisions.filter((d) => d.status === 'pending');
      const alerts = f.chains.filter((c) => c.alerts.length);
      return {
        ...base,
        summary: `${pending.length} décision${pending.length > 1 ? 's' : ''} en attente, ${alerts.length} écart${alerts.length > 1 ? 's' : ''} entre pièces.`,
        facts: [
          ...pending.map((d) => fact(`${d.label}${d.amountHt !== null ? ` — ${euros(d.amountHt)}` : ''} (${d.ref}) ; autorité : ${d.authority}`, `Décision préparée par ${d.preparedByName ?? '—'}`)),
          ...alerts.map((c) => fact(`${c.label} : ${c.alerts.join(' ; ')}`, c.stages.map((x) => x.documentRef).join(' · '))),
        ],
        confidence: high('Comparaison des pièces enregistrées ; l’application ne connaît pas les pièces non saisies.'),
        recommendations: ['Aucune dépense n’est autorisée par l’application : chaque décision revient à l’instance habilitée'],
        nextAction: pending[0] ? { kind: 'request_update', label: `Demander où en est la décision (${pending[0].ref})`, target: pending[0].ref } : null,
      };
    }
    case 'contracts': {
      const rows = contractStatus(s).filter((c) => c.state !== 'running');
      return {
        ...base,
        summary: rows.length ? `${rows.length} contrat${rows.length > 1 ? 's' : ''} à revoir.` : 'Aucun contrat à échéance proche.',
        facts: rows.map((c) => fact(`${c.label} — ${c.coproName}, ${c.providerName} : ${c.stateLabel}`, c.documentRef || 'Contrat')),
        confidence: high('Dates de fin et préavis enregistrés ; les clauses de reconduction sont à vérifier dans le contrat.'),
        recommendations: rows.length ? ['Programmer une revue avec le gestionnaire de la copropriété'] : [],
        nextAction: rows[0] ? { kind: 'schedule_review', label: `Programmer une revue : ${rows[0].label}`, target: `contract:${rows[0].id}` } : null,
      };
    }
    case 'recurring': {
      const r = recurrences(s);
      return {
        ...base,
        summary: r.length ? `${r.length} panne${r.length > 1 ? 's' : ''} récurrente${r.length > 1 ? 's' : ''} détectée${r.length > 1 ? 's' : ''}.` : 'Aucune panne récurrente (3 signalements ou plus en 90 jours au même endroit).',
        facts: r.map((x) => fact(x.message, x.nums.map(ref).join(', '))),
        confidence: high('Règle : même type, même endroit, au moins 3 signalements en 90 jours.'),
        recommendations: r.length ? ['Demander une analyse de la cause plutôt qu’une nouvelle réparation ponctuelle'] : [],
        nextAction: (() => {
          const last = r[0]?.nums[r[0].nums.length - 1];
          return last ? { kind: 'request_verification' as const, label: 'Demander une analyse de la cause', target: ref(last) } : null;
        })(),
      };
    }
    case 'quality': {
      const ql = quality(s);
      return {
        ...base,
        summary: ql.answered ? `${ql.answered} réponse${ql.answered > 1 ? 's' : ''} sur ${ql.closed} dossier${ql.closed > 1 ? 's' : ''} clôturé${ql.closed > 1 ? 's' : ''} en 90 jours ; note moyenne ${ql.averageScore}/5.` : 'Aucune réponse de satisfaction : impossible de conclure sur la satisfaction.',
        facts: [
          ...ql.lowScores.map((x) => fact(`${x.ref} : note ${x.score}/5 — ${x.comment}`, 'Questionnaire de satisfaction')),
          ...(ql.reopened.length ? [fact(`Dossiers rouverts : ${ql.reopened.join(', ')}`, 'Historique des dossiers')] : []),
          ...(ql.closedWithoutFeedback.length ? [fact(`Clôturés sans retour : ${ql.closedWithoutFeedback.join(', ')}`, 'Dossiers clôturés')] : []),
        ],
        confidence: { level: ql.answered < 5 ? 'faible' : 'moyenne', reason: ql.sampleWarning ?? 'Réponses volontaires : biais possible.' },
        recommendations: ql.lowScores.length ? ['Faire vérifier sur place les interventions mal notées'] : [],
        nextAction: ql.lowScores[0] ? { kind: 'request_verification', label: `Demander une vérification (${ql.lowScores[0].ref})`, target: ql.lowScores[0].ref } : null,
      };
    }
  }
}
