-- Cockpit du responsable de cabinet : modèle de données.
-- Les dossiers existants (prototype public, cabinet_id NULL) ne sont pas concernés.
-- Données de démonstration : insérées par /api/demo/reset (préproduction et local uniquement), jamais par cette migration.

CREATE TABLE IF NOT EXISTS cabinets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  cabinet_id TEXT NOT NULL REFERENCES cabinets(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('cabinet_director','manager','guardian','council_president')),
  -- Responsable : 1 = toutes les copropriétés du cabinet, 0 = périmètre listé dans director_scopes
  scope_all INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_users_cabinet ON users(cabinet_id, role);

CREATE TABLE IF NOT EXISTS coproprietes (
  id TEXT PRIMARY KEY,
  cabinet_id TEXT NOT NULL REFERENCES cabinets(id),
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  lots INTEGER,
  manager_user_id TEXT REFERENCES users(id),
  guardian_user_id TEXT REFERENCES users(id),
  council_president_user_id TEXT REFERENCES users(id),
  maintenance_budget_ht INTEGER
);
CREATE INDEX IF NOT EXISTS idx_copro_cabinet ON coproprietes(cabinet_id);

CREATE TABLE IF NOT EXISTS director_scopes (
  user_id TEXT NOT NULL REFERENCES users(id),
  copro_id TEXT NOT NULL REFERENCES coproprietes(id),
  PRIMARY KEY (user_id, copro_id)
);

CREATE TABLE IF NOT EXISTS absences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  replacement_user_id TEXT REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_absences_user ON absences(user_id, starts_on);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  cabinet_id TEXT NOT NULL REFERENCES cabinets(id),
  name TEXT NOT NULL,
  trades TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  cabinet_id TEXT NOT NULL REFERENCES cabinets(id),
  copro_id TEXT NOT NULL REFERENCES coproprietes(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  label TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  notice_days INTEGER NOT NULL DEFAULT 90,
  -- Délai de réponse contractuel (heures), NULL si non précisé
  response_hours INTEGER,
  annual_amount_ht INTEGER,
  document_ref TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_contracts_copro ON contracts(cabinet_id, copro_id);

-- Dossiers : la table existante est enrichie (une seule source de vérité).
ALTER TABLE dossiers ADD COLUMN cabinet_id TEXT REFERENCES cabinets(id);
ALTER TABLE dossiers ADD COLUMN copro_id TEXT REFERENCES coproprietes(id);
ALTER TABLE dossiers ADD COLUMN type_id TEXT;
ALTER TABLE dossiers ADD COLUMN pathway TEXT CHECK (pathway IS NULL OR pathway IN ('P1','P2','P3','P4','P5','P6'));
ALTER TABLE dossiers ADD COLUMN assignee_user_id TEXT REFERENCES users(id);
ALTER TABLE dossiers ADD COLUMN provider_id TEXT REFERENCES providers(id);
ALTER TABLE dossiers ADD COLUMN next_action TEXT;
ALTER TABLE dossiers ADD COLUMN next_action_due TEXT;
ALTER TABLE dossiers ADD COLUMN flagged INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dossiers ADD COLUMN reopened_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dossiers ADD COLUMN contested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dossiers ADD COLUMN updated_at TEXT;
ALTER TABLE dossiers ADD COLUMN closed_at TEXT;
CREATE INDEX IF NOT EXISTS idx_dossiers_cabinet ON dossiers(cabinet_id, copro_id, status);
-- Historique : la table existante est réutilisée (auteur, visibilité interne pour la supervision).
ALTER TABLE history ADD COLUMN actor_user_id TEXT REFERENCES users(id);
ALTER TABLE history ADD COLUMN internal INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS interventions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_num INTEGER NOT NULL REFERENCES dossiers(num),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  requested_at TEXT NOT NULL,
  responded_at TEXT,
  scheduled_at TEXT,
  arrived_on_time INTEGER,
  status TEXT NOT NULL CHECK (status IN ('requested','scheduled','in_progress','done','failed')),
  rework INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_interventions_dossier ON interventions(dossier_num);

CREATE TABLE IF NOT EXISTS reserves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_num INTEGER NOT NULL REFERENCES dossiers(num),
  provider_id TEXT REFERENCES providers(id),
  description TEXT NOT NULL,
  raised_at TEXT NOT NULL,
  lifted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reserves_dossier ON reserves(dossier_num);

-- Montants : une ligne par étape, jamais déduite d'une autre étape.
CREATE TABLE IF NOT EXISTS financial_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabinet_id TEXT NOT NULL REFERENCES cabinets(id),
  copro_id TEXT NOT NULL REFERENCES coproprietes(id),
  dossier_num INTEGER REFERENCES dossiers(num),
  contract_id TEXT REFERENCES contracts(id),
  provider_id TEXT REFERENCES providers(id),
  -- Regroupe les étapes d'une même dépense (devis → autorisation → commande → facture → paiement)
  chain_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('quote','authorized','ordered','invoiced','paid')),
  amount_ht INTEGER NOT NULL,
  document_ref TEXT NOT NULL DEFAULT '',
  recorded_by TEXT REFERENCES users(id),
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fin_cabinet ON financial_items(cabinet_id, copro_id, chain_id);

CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_num INTEGER NOT NULL REFERENCES dossiers(num),
  kind TEXT NOT NULL CHECK (kind IN ('quote_approval','expenditure','closure','procedure_exception','other')),
  label TEXT NOT NULL,
  amount_ht INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  -- Qui a l'autorité de décider (texte), jamais déduit par l'application
  authority TEXT NOT NULL DEFAULT 'Gestionnaire ou instance habilitée',
  prepared_by TEXT REFERENCES users(id),
  prepared_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_decisions_dossier ON decisions(dossier_num, status);

CREATE TABLE IF NOT EXISTS satisfaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_num INTEGER NOT NULL REFERENCES dossiers(num),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 0,
  collected_at TEXT NOT NULL
);

-- Notifications internes (in-app) : « informer les personnes concernées » sans envoi externe.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabinet_id TEXT NOT NULL REFERENCES cabinets(id),
  to_user_id TEXT NOT NULL REFERENCES users(id),
  dossier_num INTEGER REFERENCES dossiers(num),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(to_user_id, read_at);

-- Revues programmées par le responsable (rappel interne, aucune convocation envoyée).
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabinet_id TEXT NOT NULL REFERENCES cabinets(id),
  entity TEXT NOT NULL CHECK (entity IN ('dossier','copro','contract','provider')),
  entity_id TEXT NOT NULL,
  due_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_cabinet ON reviews(cabinet_id, due_on);

-- Journal d'audit des actions de supervision (ajout seul).
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cabinet_id TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_cabinet ON audit_log(cabinet_id, created_at);
CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit_log est en ajout seul'); END;
CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
WHEN OLD.cabinet_id NOT IN (SELECT id FROM cabinets WHERE is_demo = 1)
BEGIN SELECT RAISE(ABORT, 'audit_log est en ajout seul'); END;
