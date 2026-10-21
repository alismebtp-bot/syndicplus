/**
 * Chargement des données du cockpit — TOUJOURS filtré par le cabinet et le périmètre de la personne connectée.
 * Le cabinet et la liste des copropriétés viennent de la session (Principal), jamais du client.
 */
import type { Principal } from './identity';

export interface CUser { id: string; name: string; role: string; active: boolean }
export interface CAbsence { id: number; userId: string; startsOn: string; endsOn: string; replacementId: string | null }
export interface CCopro { id: string; name: string; address: string; lots: number | null; managerId: string | null; guardianId: string | null; presidentId: string | null; budgetHt: number | null }
export interface CProvider { id: string; name: string; trades: string }
export interface CContract { id: string; coproId: string; providerId: string; label: string; startsOn: string; endsOn: string; noticeDays: number; responseHours: number | null; annualHt: number | null; documentRef: string }
export interface CDossier {
  num: number; coproId: string; typeId: string | null; type: string; place: string; description: string; pathway: string | null; status: string;
  assigneeId: string | null; providerId: string | null; nextAction: string | null; nextActionDue: number | null; flagged: boolean;
  reopenedCount: number; contested: boolean; createdAt: number; updatedAt: number; closedAt: number | null;
}
export interface CIntervention { id: number; dossierNum: number; providerId: string; requestedAt: number; respondedAt: number | null; scheduledAt: number | null; arrivedOnTime: boolean | null; status: string; rework: boolean }
export interface CReserve { id: number; dossierNum: number; providerId: string | null; description: string; raisedAt: number; liftedAt: number | null }
export interface CFinancial { id: number; coproId: string; dossierNum: number | null; contractId: string | null; providerId: string | null; chainId: string; stage: 'quote' | 'authorized' | 'ordered' | 'invoiced' | 'paid'; amountHt: number; documentRef: string; recordedBy: string | null; recordedAt: number }
export interface CDecision { id: number; dossierNum: number; kind: string; label: string; amountHt: number | null; status: string; authority: string; preparedBy: string | null; preparedAt: number; decidedBy: string | null; decidedAt: number | null }
export interface CSatisfaction { dossierNum: number; score: number; comment: string; consent: boolean; collectedAt: number }
export interface CReview { id: number; entity: string; entityId: string; dueOn: string; note: string; createdBy: string; createdAt: number }

export interface Snapshot {
  now: number;
  cabinetName: string;
  scopeAll: boolean;
  copros: CCopro[];
  users: CUser[];
  absences: CAbsence[];
  providers: CProvider[];
  contracts: CContract[];
  dossiers: CDossier[];
  interventions: CIntervention[];
  reserves: CReserve[];
  financial: CFinancial[];
  decisions: CDecision[];
  satisfaction: CSatisfaction[];
  reviews: CReview[];
}

const ms = (v: unknown): number | null => (typeof v === 'string' && v ? Date.parse(v) : null);
const req = (v: unknown): number => ms(v) ?? 0;
type Row = Record<string, unknown>;
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const strN = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const numN = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** « ?, ?, ? » pour une liste IN (valeurs liées, jamais concaténées). */
const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');

export async function loadSnapshot(db: D1Database, p: Principal, now: number): Promise<Snapshot> {
  const ids = p.coproIds;
  const inCopro = `copro_id IN (${marks(ids.length)})`;
  const scopedDossiers = `SELECT num FROM dossiers WHERE cabinet_id = ? AND ${inCopro}`;
  const all = (sql: string, ...args: unknown[]) => db.prepare(sql).bind(...args);

  const [copros, users, absences, providers, contracts, dossiers, interventions, reserves, financial, decisions, satisfaction, reviews] = await db.batch<Row>([
    all(`SELECT * FROM coproprietes WHERE cabinet_id = ? AND id IN (${marks(ids.length)}) ORDER BY name`, p.cabinetId, ...ids),
    all('SELECT id, name, role, active FROM users WHERE cabinet_id = ? ORDER BY name', p.cabinetId),
    all('SELECT a.* FROM absences a JOIN users u ON u.id = a.user_id WHERE u.cabinet_id = ? ORDER BY a.starts_on', p.cabinetId),
    all('SELECT id, name, trades FROM providers WHERE cabinet_id = ? ORDER BY name', p.cabinetId),
    all(`SELECT * FROM contracts WHERE cabinet_id = ? AND ${inCopro} ORDER BY ends_on`, p.cabinetId, ...ids),
    all(`SELECT * FROM dossiers WHERE cabinet_id = ? AND ${inCopro} ORDER BY num`, p.cabinetId, ...ids),
    all(`SELECT * FROM interventions WHERE dossier_num IN (${scopedDossiers}) ORDER BY requested_at`, p.cabinetId, ...ids),
    all(`SELECT * FROM reserves WHERE dossier_num IN (${scopedDossiers}) ORDER BY raised_at`, p.cabinetId, ...ids),
    all(`SELECT * FROM financial_items WHERE cabinet_id = ? AND ${inCopro} ORDER BY chain_id, recorded_at`, p.cabinetId, ...ids),
    all(`SELECT * FROM decisions WHERE dossier_num IN (${scopedDossiers}) ORDER BY prepared_at`, p.cabinetId, ...ids),
    all(`SELECT * FROM satisfaction WHERE dossier_num IN (${scopedDossiers}) ORDER BY collected_at`, p.cabinetId, ...ids),
    all('SELECT * FROM reviews WHERE cabinet_id = ? ORDER BY due_on', p.cabinetId),
  ]);
  const r = (x: D1Result<Row> | undefined) => x?.results ?? [];

  const snap: Snapshot = {
    now,
    cabinetName: p.cabinetName,
    scopeAll: p.scopeAll,
    copros: r(copros).map((c) => ({
      id: str(c.id), name: str(c.name), address: str(c.address), lots: numN(c.lots), managerId: strN(c.manager_user_id),
      guardianId: strN(c.guardian_user_id), presidentId: strN(c.council_president_user_id), budgetHt: numN(c.maintenance_budget_ht),
    })),
    users: r(users).map((u) => ({ id: str(u.id), name: str(u.name), role: str(u.role), active: Boolean(u.active) })),
    absences: r(absences).map((a) => ({ id: Number(a.id), userId: str(a.user_id), startsOn: str(a.starts_on), endsOn: str(a.ends_on), replacementId: strN(a.replacement_user_id) })),
    providers: r(providers).map((x) => ({ id: str(x.id), name: str(x.name), trades: str(x.trades) })),
    contracts: r(contracts).map((c) => ({
      id: str(c.id), coproId: str(c.copro_id), providerId: str(c.provider_id), label: str(c.label), startsOn: str(c.starts_on), endsOn: str(c.ends_on),
      noticeDays: Number(c.notice_days), responseHours: numN(c.response_hours), annualHt: numN(c.annual_amount_ht), documentRef: str(c.document_ref),
    })),
    dossiers: r(dossiers).map((d) => ({
      num: Number(d.num), coproId: str(d.copro_id), typeId: strN(d.type_id), type: str(d.type), place: str(d.place), description: str(d.description),
      pathway: strN(d.pathway), status: str(d.status), assigneeId: strN(d.assignee_user_id), providerId: strN(d.provider_id), nextAction: strN(d.next_action),
      nextActionDue: ms(d.next_action_due), flagged: Boolean(d.flagged), reopenedCount: Number(d.reopened_count ?? 0), contested: Boolean(d.contested),
      createdAt: req(d.created_at), updatedAt: ms(d.updated_at) ?? req(d.created_at), closedAt: ms(d.closed_at),
    })),
    interventions: r(interventions).map((i) => ({
      id: Number(i.id), dossierNum: Number(i.dossier_num), providerId: str(i.provider_id), requestedAt: req(i.requested_at), respondedAt: ms(i.responded_at),
      scheduledAt: ms(i.scheduled_at), arrivedOnTime: i.arrived_on_time === null || i.arrived_on_time === undefined ? null : Boolean(i.arrived_on_time), status: str(i.status), rework: Boolean(i.rework),
    })),
    reserves: r(reserves).map((x) => ({ id: Number(x.id), dossierNum: Number(x.dossier_num), providerId: strN(x.provider_id), description: str(x.description), raisedAt: req(x.raised_at), liftedAt: ms(x.lifted_at) })),
    financial: r(financial).map((f) => ({
      id: Number(f.id), coproId: str(f.copro_id), dossierNum: numN(f.dossier_num), contractId: strN(f.contract_id), providerId: strN(f.provider_id), chainId: str(f.chain_id),
      stage: str(f.stage) as CFinancial['stage'], amountHt: Number(f.amount_ht), documentRef: str(f.document_ref), recordedBy: strN(f.recorded_by), recordedAt: req(f.recorded_at),
    })),
    decisions: r(decisions).map((d) => ({
      id: Number(d.id), dossierNum: Number(d.dossier_num), kind: str(d.kind), label: str(d.label), amountHt: numN(d.amount_ht), status: str(d.status), authority: str(d.authority),
      preparedBy: strN(d.prepared_by), preparedAt: req(d.prepared_at), decidedBy: strN(d.decided_by), decidedAt: ms(d.decided_at),
    })),
    satisfaction: r(satisfaction).map((s) => ({ dossierNum: Number(s.dossier_num), score: Number(s.score), comment: str(s.comment), consent: Boolean(s.consent), collectedAt: req(s.collected_at) })),
    reviews: r(reviews).map((v) => ({ id: Number(v.id), entity: str(v.entity), entityId: str(v.entity_id), dueOn: str(v.due_on), note: str(v.note), createdBy: str(v.created_by), createdAt: req(v.created_at) })),
  };
  // Revues : uniquement celles qui portent sur un élément du périmètre
  const inScope = new Set<string>([
    ...snap.dossiers.map((d) => `dossier:${d.num}`),
    ...snap.copros.map((c) => `copro:${c.id}`),
    ...snap.contracts.map((c) => `contract:${c.id}`),
    ...snap.providers.map((x) => `provider:${x.id}`),
  ]);
  snap.reviews = snap.reviews.filter((v) => inScope.has(`${v.entity}:${v.entityId}`));
  return snap;
}
