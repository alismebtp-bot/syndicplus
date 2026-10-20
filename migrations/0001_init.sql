CREATE TABLE IF NOT EXISTS dossiers (
  num INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  place TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'À qualifier',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dossier_num INTEGER NOT NULL REFERENCES dossiers(num) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_history_dossier ON history(dossier_num);
INSERT OR IGNORE INTO dossiers (num,type,description,place,status,created_at) VALUES
 (1000,'Éclairage','Ampoule défectueuse au palier','Palier 2e étage','Résolu','2026-10-15T08:00:00Z'),
 (1001,'Chauffage','Chauffage insuffisant au 3e étage','Appartement 3B','En cours','2026-10-18T08:00:00Z');
INSERT INTO history (dossier_num,text,created_at) SELECT 1000,'Signalement enregistré','2026-10-15T08:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM history WHERE dossier_num=1000);
INSERT INTO history (dossier_num,text,created_at) SELECT 1000,'Réparation confirmée (simulation)','2026-10-16T08:00:00Z' WHERE (SELECT COUNT(*) FROM history WHERE dossier_num=1000)=1;
INSERT INTO history (dossier_num,text,created_at) SELECT 1001,'Signalement enregistré','2026-10-18T08:00:00Z' WHERE NOT EXISTS (SELECT 1 FROM history WHERE dossier_num=1001);
INSERT INTO history (dossier_num,text,created_at) SELECT 1001,'Prestataire contacté (simulation)','2026-10-19T08:00:00Z' WHERE (SELECT COUNT(*) FROM history WHERE dossier_num=1001)=1;
