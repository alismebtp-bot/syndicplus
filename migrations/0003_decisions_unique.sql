-- Une même décision ne peut être « en attente » qu'une fois par dossier (protection contre les envois simultanés).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_decisions_pending ON decisions(dossier_num, label) WHERE status = 'pending';
