/** Accès aux données D1. Toutes les requêtes sont paramétrées (aucune concaténation SQL). */
import { formatRef, type DossierUpdateInput, type NewDossierInput } from './domain';

export interface HistoryEntry {
  text: string;
  created_at: string;
}

export interface Dossier {
  id: string;
  num: number;
  type: string;
  description: string;
  place: string;
  status: string;
  created_at: string;
  history: HistoryEntry[];
}

interface DossierRow {
  num: number;
  type: string;
  description: string;
  place: string;
  status: string;
  created_at: string;
}

interface HistoryRow {
  dossier_num: number;
  text: string;
  created_at: string;
}

const LIST_LIMIT = 500;

export async function listDossiers(db: D1Database): Promise<Dossier[]> {
  const [d, h] = await db.batch<DossierRow | HistoryRow>([
    // Prototype public : uniquement les dossiers sans cabinet (les dossiers du cockpit sont cloisonnés par cabinet).
    db.prepare(`SELECT num,type,description,place,status,created_at FROM dossiers WHERE cabinet_id IS NULL ORDER BY num DESC LIMIT ${LIST_LIMIT}`),
    db.prepare('SELECT h.dossier_num,h.text,h.created_at FROM history h JOIN dossiers d ON d.num = h.dossier_num WHERE d.cabinet_id IS NULL AND h.internal = 0 ORDER BY h.id ASC'),
  ]);
  if (!d || !h) throw new Error('Lecture des dossiers impossible');
  const byNum = new Map<number, Dossier>();
  const out = (d.results as DossierRow[]).map((r) => {
    const o: Dossier = { id: formatRef(r.num), ...r, history: [] };
    byNum.set(r.num, o);
    return o;
  });
  for (const x of h.results as HistoryRow[]) {
    byNum.get(x.dossier_num)?.history.push({ text: x.text, created_at: x.created_at });
  }
  return out;
}

export async function createDossier(db: D1Database, input: NewDossierInput): Promise<string> {
  const row = await db
    .prepare('INSERT INTO dossiers (type,description,place) VALUES (?,?,?) RETURNING num')
    .bind(input.type, input.description, input.place)
    .first<{ num: number }>();
  if (!row) throw new Error('Insertion du dossier impossible');
  await db
    .prepare('INSERT INTO history (dossier_num,text) VALUES (?,?)')
    .bind(row.num, 'Signalement reçu depuis l’espace résident')
    .run();
  return formatRef(row.num);
}

export async function getStatus(db: D1Database, num: number): Promise<string | null> {
  const row = await db.prepare('SELECT status FROM dossiers WHERE num=? AND cabinet_id IS NULL').bind(num).first<{ status: string }>();
  return row?.status ?? null;
}

export async function applyUpdate(db: D1Database, num: number, update: DossierUpdateInput, text: string): Promise<void> {
  await db.batch([
    db.prepare('UPDATE dossiers SET status=? WHERE num=?').bind(update.status, num),
    db.prepare('INSERT INTO history (dossier_num,text) VALUES (?,?)').bind(num, text),
  ]);
}
