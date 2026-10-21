/**
 * Jeu de données FICTIF du cockpit (préproduction et local uniquement).
 * Dates calculées par rapport à « maintenant » pour que les retards et échéances restent parlants.
 * Deux cabinets : le second sert à vérifier l'isolation.
 */

const H = 3_600_000;
const D = 24 * H;

export const DEMO_CABINETS = ['cab_horizon', 'cab_exemple'] as const;

export const DEMO_PERSONAS = [
  { id: 'dir_lea', label: 'Léa Fontaine', detail: 'Responsable de cabinet — toutes les copropriétés du Cabinet Horizon' },
  { id: 'dir_marc', label: 'Marc Roux', detail: 'Responsable de cabinet — périmètre limité (Les Tilleuls, Le Parc)' },
  { id: 'mgr_claire', label: 'Claire Moreau', detail: 'Gestionnaire — accès au cockpit refusé (démonstration des droits)' },
  { id: 'dir_paul', label: 'Paul Martin', detail: 'Responsable d’un autre cabinet — ne voit rien du Cabinet Horizon' },
] as const;

export function demoSeedStatements(db: D1Database, nowMs: number): D1PreparedStatement[] {
  const at = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ago = (h: number) => at(nowMs - h * H);
  const inH = (h: number) => at(nowMs + h * H);
  const day = (d: number) => at(nowMs + d * D).slice(0, 10);
  const s: D1PreparedStatement[] = [];
  const q = (sql: string, ...args: unknown[]) => s.push(db.prepare(sql).bind(...args));

  // ---------- Nettoyage des cabinets de démonstration uniquement ----------
  const demo = `(SELECT id FROM cabinets WHERE is_demo = 1)`;
  const demoDossiers = `(SELECT num FROM dossiers WHERE cabinet_id IN ${demo})`;
  s.push(db.prepare(`DELETE FROM notifications WHERE cabinet_id IN ${demo}`));
  s.push(db.prepare(`DELETE FROM audit_log WHERE cabinet_id IN ${demo}`));
  s.push(db.prepare(`DELETE FROM reviews WHERE cabinet_id IN ${demo}`));
  s.push(db.prepare(`DELETE FROM satisfaction WHERE dossier_num IN ${demoDossiers}`));
  s.push(db.prepare(`DELETE FROM decisions WHERE dossier_num IN ${demoDossiers}`));
  s.push(db.prepare(`DELETE FROM financial_items WHERE cabinet_id IN ${demo}`));
  s.push(db.prepare(`DELETE FROM reserves WHERE dossier_num IN ${demoDossiers}`));
  s.push(db.prepare(`DELETE FROM interventions WHERE dossier_num IN ${demoDossiers}`));
  s.push(db.prepare(`DELETE FROM history WHERE dossier_num IN ${demoDossiers}`));
  s.push(db.prepare(`DELETE FROM dossiers WHERE cabinet_id IN ${demo}`));
  s.push(db.prepare(`DELETE FROM contracts WHERE cabinet_id IN ${demo}`));
  s.push(db.prepare(`DELETE FROM absences WHERE user_id IN (SELECT id FROM users WHERE cabinet_id IN ${demo})`));
  s.push(db.prepare(`DELETE FROM director_scopes WHERE user_id IN (SELECT id FROM users WHERE cabinet_id IN ${demo})`));
  s.push(db.prepare(`DELETE FROM coproprietes WHERE cabinet_id IN ${demo}`));
  s.push(db.prepare(`DELETE FROM providers WHERE cabinet_id IN ${demo}`));
  s.push(db.prepare(`DELETE FROM users WHERE cabinet_id IN ${demo}`));
  s.push(db.prepare(`DELETE FROM cabinets WHERE is_demo = 1`));

  // ---------- Cabinets, personnes (fictives) ----------
  q('INSERT INTO cabinets (id,name,is_demo) VALUES (?,?,1),(?,?,1)', 'cab_horizon', 'Cabinet Horizon (démo)', 'cab_exemple', 'Cabinet Exemple (démo)');
  const users: [string, string, string, string, number][] = [
    ['dir_lea', 'cab_horizon', 'Léa Fontaine', 'cabinet_director', 1],
    ['dir_marc', 'cab_horizon', 'Marc Roux', 'cabinet_director', 0],
    ['mgr_claire', 'cab_horizon', 'Claire Moreau', 'manager', 0],
    ['mgr_hugo', 'cab_horizon', 'Hugo Bernard', 'manager', 0],
    ['mgr_nadia', 'cab_horizon', 'Nadia Kader', 'manager', 0],
    ['grd_martin', 'cab_horizon', 'Mme Martin (gardienne)', 'guardian', 0],
    ['cs_bernard', 'cab_horizon', 'M. Bernard (président CS)', 'council_president', 0],
    ['dir_paul', 'cab_exemple', 'Paul Martin', 'cabinet_director', 1],
    ['mgr_ines', 'cab_exemple', 'Inès Garnier', 'manager', 0],
  ];
  for (const u of users) q('INSERT INTO users (id,cabinet_id,name,role,scope_all,active,is_demo) VALUES (?,?,?,?,?,1,1)', ...u);

  const copros: [string, string, string, string, number | null, string, string | null, string | null, number | null][] = [
    ['copro_vh', 'cab_horizon', 'Résidence Victor-Hugo', '12 avenue Victor-Hugo, 75016 Paris', 48, 'mgr_claire', 'grd_martin', 'cs_bernard', 60000],
    ['copro_tilleuls', 'cab_horizon', 'Les Tilleuls', '8 rue des Tilleuls, 92100 Boulogne-Billancourt', 32, 'mgr_claire', null, 'cs_bernard', 25000],
    ['copro_parc', 'cab_horizon', 'Le Parc', '3 allée du Parc, 91000 Évry-Courcouronnes', 120, 'mgr_hugo', 'grd_martin', null, 140000],
    ['copro_jardins', 'cab_horizon', 'Les Jardins', '21 rue des Jardins, 94000 Créteil', 64, 'mgr_nadia', null, null, null],
    ['copro_quais', 'cab_horizon', 'Les Quais', '5 quai de Seine, 93200 Saint-Denis', null, 'mgr_hugo', null, null, null],
    ['copro_autre', 'cab_exemple', 'Résidence du Lac', '1 rue du Lac, 78000 Versailles', 40, 'mgr_ines', null, null, 50000],
  ];
  for (const c of copros) q('INSERT INTO coproprietes (id,cabinet_id,name,address,lots,manager_user_id,guardian_user_id,council_president_user_id,maintenance_budget_ht) VALUES (?,?,?,?,?,?,?,?,?)', ...c);
  q('INSERT INTO director_scopes (user_id,copro_id) VALUES (?,?),(?,?)', 'dir_marc', 'copro_tilleuls', 'dir_marc', 'copro_parc');
  // Nadia absente cette semaine, sans remplaçant désigné
  q('INSERT INTO absences (user_id,starts_on,ends_on,replacement_user_id,created_by) VALUES (?,?,?,NULL,?)', 'mgr_nadia', day(-2), day(5), 'dir_lea');

  const providers: [string, string, string, string][] = [
    ['prov_elec', 'cab_horizon', 'Élec Services (démo)', 'électricité'],
    ['prov_chauf', 'cab_horizon', 'Chauffage Plus (démo)', 'chauffage'],
    ['prov_asc', 'cab_horizon', 'Ascenseurs Durand (démo)', 'ascenseur'],
    ['prov_plomb', 'cab_horizon', 'Plomberie Rapide (démo)', 'plomberie'],
    ['prov_toit', 'cab_horizon', 'Toitures Martin (démo)', 'toiture et façade'],
    ['prov_lac', 'cab_exemple', 'Multiservices Lac (démo)', 'tous travaux'],
  ];
  for (const p of providers) q('INSERT INTO providers (id,cabinet_id,name,trades) VALUES (?,?,?,?)', ...p);

  const contracts: [string, string, string, string, string, string, string, number, number | null, number | null, string][] = [
    ['ctr_vh_elec', 'cab_horizon', 'copro_vh', 'prov_elec', 'Maintenance électrique', day(-400), day(300), 90, 48, 3200, 'Contrat 2025-ELEC-VH (démo)'],
    ['ctr_parc_chauf', 'cab_horizon', 'copro_parc', 'prov_chauf', 'Chaufferie P2', day(-700), day(40), 90, 24, 18500, 'Contrat P2 chaufferie Le Parc (démo)'],
    ['ctr_jardins_asc', 'cab_horizon', 'copro_jardins', 'prov_asc', 'Maintenance ascenseur', day(-1000), day(20), 90, 4, 6400, 'Contrat ascenseur Les Jardins (démo)'],
    ['ctr_parc_asc', 'cab_horizon', 'copro_parc', 'prov_asc', 'Maintenance ascenseurs (2 appareils)', day(-300), day(430), 90, 4, 11800, 'Contrat ascenseurs Le Parc (démo)'],
    ['ctr_lac', 'cab_exemple', 'copro_autre', 'prov_lac', 'Multiservices', day(-100), day(30), 60, 48, 9000, 'Contrat Lac (démo)'],
  ];
  for (const c of contracts) q('INSERT INTO contracts (id,cabinet_id,copro_id,provider_id,label,starts_on,ends_on,notice_days,response_hours,annual_amount_ht,document_ref) VALUES (?,?,?,?,?,?,?,?,?,?,?)', ...c);

  // ---------- Dossiers ----------
  type Dossier = {
    num: number; cab: string; copro: string; typeId: string; type: string; place: string; desc: string; pathway: string;
    status: string; assignee: string | null; provider: string | null; next: string | null; dueH: number | null;
    createdH: number; updatedH: number; closedH?: number; flagged?: number; reopened?: number; contested?: number;
  };
  const dossiers: Dossier[] = [
    { num: 9001, cab: 'cab_horizon', copro: 'copro_parc', typeId: 'fuite_majeure', type: 'Fuite d’eau', place: 'Sous-sol, local technique', desc: 'Fuite importante sur colonne d’eau froide', pathway: 'P5', status: 'En cours', assignee: 'mgr_hugo', provider: 'prov_plomb', next: 'Confirmer la mise en sécurité et le passage du plombier d’astreinte', dueH: -1, createdH: 5, updatedH: 3 },
    { num: 9002, cab: 'cab_horizon', copro: 'copro_vh', typeId: 'eclairage_commun', type: 'Éclairage', place: 'Couloir du 3e étage', desc: 'Luminaire hors service', pathway: 'P1', status: 'En cours', assignee: 'mgr_claire', provider: null, next: 'Constat de la gardienne', dueH: 30, createdH: 6, updatedH: 6 },
    { num: 9003, cab: 'cab_horizon', copro: 'copro_parc', typeId: 'chauffage_collectif', type: 'Chauffage', place: 'Bâtiment B', desc: 'Chauffage collectif à l’arrêt, deuxième passage nécessaire', pathway: 'P2', status: 'En attente prestataire', assignee: 'mgr_hugo', provider: 'prov_chauf', next: 'Second passage du chauffagiste', dueH: 12, createdH: 50, updatedH: 20 },
    { num: 9004, cab: 'cab_horizon', copro: 'copro_jardins', typeId: 'ascenseur', type: 'Ascenseur', place: 'Hall A', desc: 'Ascenseur à l’arrêt, panne répétée', pathway: 'P2', status: 'En attente prestataire', assignee: 'mgr_nadia', provider: 'prov_asc', next: 'Relancer l’ascensoriste pour la pièce de rechange', dueH: -120, createdH: 240, updatedH: 150 },
    { num: 9005, cab: 'cab_horizon', copro: 'copro_tilleuls', typeId: 'infiltration_toiture', type: 'Autre', place: 'Dernier étage, cage B', desc: 'Infiltration en plafond, devis reçus', pathway: 'P3', status: 'En cours', assignee: 'mgr_claire', provider: null, next: 'Examiner les devis et préparer la décision', dueH: 48, createdH: 300, updatedH: 40 },
    { num: 9006, cab: 'cab_horizon', copro: 'copro_vh', typeId: 'renovation', type: 'Autre', place: 'Hall d’entrée', desc: 'Rénovation du hall votée en AG, réserves à la réception', pathway: 'P6', status: 'En cours', assignee: 'mgr_claire', provider: 'prov_toit', next: 'Obtenir la levée des réserves', dueH: -24 * 10, createdH: 24 * 60, updatedH: 24 * 12 },
    { num: 9007, cab: 'cab_horizon', copro: 'copro_quais', typeId: 'nuisibles', type: 'Autre', place: 'Caves', desc: 'Présence de nuisibles signalée par plusieurs résidents', pathway: 'P2', status: 'À qualifier', assignee: null, provider: null, next: null, dueH: null, createdH: 70, updatedH: 70 },
    { num: 9008, cab: 'cab_horizon', copro: 'copro_jardins', typeId: 'vmc', type: 'Autre', place: 'Bâtiment C', desc: 'VMC bruyante', pathway: 'P2', status: 'En cours', assignee: 'mgr_nadia', provider: null, next: null, dueH: null, createdH: 24 * 20, updatedH: 24 * 17 },
    { num: 9009, cab: 'cab_horizon', copro: 'copro_jardins', typeId: 'eclairage_commun', type: 'Éclairage', place: 'Parking niveau -1', desc: 'Éclairage du parking éteint', pathway: 'P1', status: 'Résolu', assignee: 'mgr_nadia', provider: 'prov_elec', next: null, dueH: null, createdH: 24 * 70, updatedH: 24 * 68, closedH: 24 * 68 },
    { num: 9010, cab: 'cab_horizon', copro: 'copro_jardins', typeId: 'eclairage_commun', type: 'Éclairage', place: 'Parking niveau -1', desc: 'Nouvelle coupure de l’éclairage du parking', pathway: 'P1', status: 'Résolu', assignee: 'mgr_nadia', provider: 'prov_elec', next: null, dueH: null, createdH: 24 * 30, updatedH: 24 * 29, closedH: 24 * 29 },
    { num: 9011, cab: 'cab_horizon', copro: 'copro_jardins', typeId: 'eclairage_commun', type: 'Éclairage', place: 'Parking -1', desc: 'Éclairage du parking de nouveau en panne', pathway: 'P1', status: 'En cours', assignee: 'mgr_nadia', provider: null, next: 'Diagnostic électrique complet', dueH: 20, createdH: 30, updatedH: 30 },
    { num: 9012, cab: 'cab_horizon', copro: 'copro_vh', typeId: 'porte_entree', type: 'Autre', place: 'Hall', desc: 'Porte d’entrée qui ne ferme plus', pathway: 'P1', status: 'Résolu', assignee: 'mgr_claire', provider: null, next: null, dueH: null, createdH: 24 * 15, updatedH: 24 * 3, closedH: 24 * 3, reopened: 1, contested: 1 },
    { num: 9013, cab: 'cab_horizon', copro: 'copro_parc', typeId: 'ascenseur', type: 'Ascenseur', place: 'Bâtiment A', desc: 'Personne bloquée dans l’ascenseur', pathway: 'P5', status: 'Résolu', assignee: 'mgr_hugo', provider: 'prov_asc', next: null, dueH: null, createdH: 24 * 9, updatedH: 24 * 9 - 2, closedH: 24 * 9 - 2 },
    { num: 9014, cab: 'cab_horizon', copro: 'copro_tilleuls', typeId: 'degat_des_eaux', type: 'Fuite d’eau', place: 'Appartement 2B', desc: 'Dégât des eaux depuis l’appartement du dessus', pathway: 'P4', status: 'En cours', assignee: 'mgr_claire', provider: null, next: 'Recevoir le constat amiable', dueH: 72, createdH: 24 * 12, updatedH: 24 * 9 },
    { num: 9015, cab: 'cab_horizon', copro: 'copro_vh', typeId: 'nettoyage', type: 'Autre', place: 'Local poubelles', desc: 'Local poubelles sale', pathway: 'P1', status: 'Résolu', assignee: 'mgr_claire', provider: null, next: null, dueH: null, createdH: 24 * 8, updatedH: 24 * 7, closedH: 24 * 7 },
    { num: 9016, cab: 'cab_horizon', copro: 'copro_parc', typeId: 'interphone', type: 'Autre', place: 'Entrée B', desc: 'Interphone muet', pathway: 'P2', status: 'Résolu', assignee: 'mgr_hugo', provider: 'prov_elec', next: null, dueH: null, createdH: 24 * 25, updatedH: 24 * 21, closedH: 24 * 21 },
    { num: 9017, cab: 'cab_horizon', copro: 'copro_parc', typeId: 'chauffage_localise', type: 'Chauffage', place: 'Appartement 14', desc: 'Radiateur froid', pathway: 'P2', status: 'Résolu', assignee: 'mgr_hugo', provider: 'prov_chauf', next: null, dueH: null, createdH: 24 * 40, updatedH: 24 * 38, closedH: 24 * 38 },
    // Autre cabinet (isolation)
    { num: 9101, cab: 'cab_exemple', copro: 'copro_autre', typeId: 'incendie', type: 'Autre', place: 'Local vélos', desc: 'Départ de feu maîtrisé', pathway: 'P5', status: 'En cours', assignee: 'mgr_ines', provider: 'prov_lac', next: 'Rapport des pompiers', dueH: -2, createdH: 6, updatedH: 5 },
    { num: 9102, cab: 'cab_exemple', copro: 'copro_autre', typeId: 'eclairage_commun', type: 'Éclairage', place: 'Escalier', desc: 'Minuterie en panne', pathway: 'P1', status: 'En cours', assignee: null, provider: null, next: null, dueH: null, createdH: 20, updatedH: 20 },
  ];
  for (const d of dossiers) {
    q(
      `INSERT INTO dossiers (num,type,description,place,status,created_at,cabinet_id,copro_id,type_id,pathway,assignee_user_id,provider_id,next_action,next_action_due,flagged,reopened_count,contested,updated_at,closed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      d.num, d.type, d.desc, d.place, d.status, ago(d.createdH), d.cab, d.copro, d.typeId, d.pathway, d.assignee, d.provider, d.next,
      d.dueH === null ? null : inH(d.dueH), d.flagged ?? 0, d.reopened ?? 0, d.contested ?? 0, ago(d.updatedH), d.closedH === undefined ? null : ago(d.closedH),
    );
    q('INSERT INTO history (dossier_num,text,created_at,internal) VALUES (?,?,?,0)', d.num, 'Signalement enregistré', ago(d.createdH));
    if (d.updatedH !== d.createdH) q('INSERT INTO history (dossier_num,text,created_at,internal) VALUES (?,?,?,0)', d.num, d.status === 'Résolu' ? 'Intervention terminée' : 'Suivi mis à jour', ago(d.updatedH));
  }

  // ---------- Interventions (réponses, rendez-vous, reprises) ----------
  const iv: [number, string, number, number | null, number | null, number | null, string, number][] = [
    // dossier, prestataire, demandée (h), répondue (h), planifiée (h), à l'heure, statut, reprise
    [9001, 'prov_plomb', 4.5, 4, -1, null, 'scheduled', 0],
    [9003, 'prov_chauf', 48, 40, 30, 1, 'failed', 1],
    [9003, 'prov_chauf', 20, 18, -6, null, 'scheduled', 0],
    [9004, 'prov_asc', 230, 200, 190, 0, 'failed', 1],
    [9004, 'prov_asc', 180, 170, 160, 1, 'failed', 1],
    [9004, 'prov_asc', 150, null, null, null, 'requested', 0],
    [9009, 'prov_elec', 24 * 69.5, 24 * 69, 24 * 68.5, 1, 'done', 0],
    [9010, 'prov_elec', 24 * 29.8, 24 * 29.5, 24 * 29.2, 1, 'done', 0],
    [9013, 'prov_asc', 24 * 9, 24 * 9 - 0.5, 24 * 9 - 1, 1, 'done', 0],
    [9016, 'prov_elec', 24 * 24, 24 * 23, 24 * 22, 1, 'done', 0],
    [9017, 'prov_chauf', 24 * 39.8, 24 * 39.5, 24 * 39, 1, 'done', 0],
    [9006, 'prov_toit', 24 * 50, 24 * 48, 24 * 30, 1, 'done', 0],
    [9101, 'prov_lac', 5, 4.8, 4, 1, 'in_progress', 0],
  ];
  for (const [n, p, req, resp, sched, onTime, st, rw] of iv) {
    q('INSERT INTO interventions (dossier_num,provider_id,requested_at,responded_at,scheduled_at,arrived_on_time,status,rework) VALUES (?,?,?,?,?,?,?,?)', n, p, ago(req), resp === null ? null : ago(resp), sched === null ? null : ago(sched), onTime, st, rw);
  }
  // ---------- Réserves ----------
  q('INSERT INTO reserves (dossier_num,provider_id,description,raised_at,lifted_at) VALUES (?,?,?,?,NULL)', 9006, 'prov_toit', 'Joints de carrelage non conformes', ago(24 * 30));
  q('INSERT INTO reserves (dossier_num,provider_id,description,raised_at,lifted_at) VALUES (?,?,?,?,NULL)', 9006, 'prov_toit', 'Éclairage du hall non raccordé', ago(24 * 30));
  q('INSERT INTO reserves (dossier_num,provider_id,description,raised_at,lifted_at) VALUES (?,?,?,?,?)', 9016, 'prov_elec', 'Bouton d’appel mal fixé', ago(24 * 21), ago(24 * 20));

  // ---------- Montants : une ligne par étape, documents référencés ----------
  const fin: [string, string, number | null, string | null, string, string, string, number, string, string | null, number][] = [
    // copro, chaîne, dossier, contrat, prestataire, chaîne-id, étape, montant HT, document, auteur, il y a (h)
    ['copro_parc', 'chauffage-b', 9003, 'ctr_parc_chauf', 'prov_chauf', 'CH-9003', 'quote', 1800, 'Devis CP-2026-118 (démo)', 'mgr_hugo', 45],
    ['copro_parc', 'chauffage-b', 9003, 'ctr_parc_chauf', 'prov_chauf', 'CH-9003', 'authorized', 1800, 'Accord gestionnaire — préautorisation contrat (démo)', 'mgr_hugo', 44],
    ['copro_parc', 'chauffage-b', 9003, 'ctr_parc_chauf', 'prov_chauf', 'CH-9003', 'ordered', 1800, 'Bon de commande BC-552 (démo)', 'mgr_hugo', 44],
    ['copro_parc', 'chauffage-b', 9003, 'ctr_parc_chauf', 'prov_chauf', 'CH-9003', 'invoiced', 1950, 'Facture F-7781 (démo)', 'mgr_hugo', 10],
    ['copro_tilleuls', 'toiture', 9005, null, 'prov_toit', 'TO-9005-A', 'quote', 4200, 'Devis Toitures Martin TM-44 (démo)', 'mgr_claire', 100],
    ['copro_tilleuls', 'toiture', 9005, null, 'prov_plomb', 'TO-9005-B', 'quote', 3800, 'Devis Étanchéité (démo)', 'mgr_claire', 90],
    ['copro_vh', 'hall', 9006, null, 'prov_toit', 'HA-9006', 'quote', 25000, 'Devis rénovation hall (démo)', 'mgr_claire', 24 * 120],
    ['copro_vh', 'hall', 9006, null, 'prov_toit', 'HA-9006', 'authorized', 24000, 'Résolution AG n°12 (démo)', 'mgr_claire', 24 * 90],
    ['copro_vh', 'hall', 9006, null, 'prov_toit', 'HA-9006', 'ordered', 24000, 'Ordre de service OS-12 (démo)', 'mgr_claire', 24 * 85],
    ['copro_vh', 'hall', 9006, null, 'prov_toit', 'HA-9006', 'invoiced', 12000, 'Facture d’acompte FA-301 (démo)', 'mgr_claire', 24 * 40],
    ['copro_vh', 'hall', 9006, null, 'prov_toit', 'HA-9006', 'paid', 12000, 'Virement du 12 (démo)', 'mgr_claire', 24 * 35],
    ['copro_parc', 'interphone', 9016, null, 'prov_elec', 'IN-9016', 'invoiced', 380, 'Facture F-1180 (démo)', 'mgr_hugo', 24 * 20],
    ['copro_parc', 'interphone', 9016, null, 'prov_elec', 'IN-9016', 'paid', 380, 'Virement (démo)', 'mgr_hugo', 24 * 15],
    ['copro_autre', 'lac', 9101, null, 'prov_lac', 'LA-9101', 'quote', 2500, 'Devis Lac (démo)', 'mgr_ines', 3],
  ];
  for (const [copro, , num, ctr, prov, chain, stage, amount, doc, by, h] of fin) {
    const cab = copro === 'copro_autre' ? 'cab_exemple' : 'cab_horizon';
    q('INSERT INTO financial_items (cabinet_id,copro_id,dossier_num,contract_id,provider_id,chain_id,stage,amount_ht,document_ref,recorded_by,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', cab, copro, num, ctr, prov, chain, stage, amount, doc, by, ago(h));
  }

  // ---------- Décisions en attente (préparées, jamais décidées par l'application) ----------
  q('INSERT INTO decisions (dossier_num,kind,label,amount_ht,status,authority,prepared_by,prepared_at) VALUES (?,?,?,?,?,?,?,?)', 9005, 'quote_approval', 'Choix de l’entreprise pour la réfection de toiture', 4200, 'pending', 'Gestionnaire dans la limite du mandat ; au-delà, conseil syndical / AG', 'mgr_claire', ago(24 * 9));
  q('INSERT INTO decisions (dossier_num,kind,label,amount_ht,status,authority,prepared_by,prepared_at) VALUES (?,?,?,?,?,?,?,?)', 9003, 'expenditure', 'Valider le dépassement de facture (+150 € HT)', 150, 'pending', 'Gestionnaire', 'mgr_hugo', ago(8));
  q('INSERT INTO decisions (dossier_num,kind,label,amount_ht,status,authority,prepared_by,prepared_at,decided_by,decided_at) VALUES (?,?,?,?,?,?,?,?,?,?)', 9006, 'quote_approval', 'Rénovation du hall', 24000, 'approved', 'Assemblée générale', 'mgr_claire', ago(24 * 100), 'Assemblée générale (résolution n°12)', ago(24 * 90));

  // ---------- Satisfaction (avec consentement) ----------
  const sat: [number, number, string, number, number][] = [
    [9009, 4, 'Rapide', 1, 24 * 67],
    [9010, 3, 'Deuxième panne en un mois', 1, 24 * 28],
    [9013, 5, 'Intervention très rapide', 1, 24 * 8],
    [9012, 2, 'La porte ferme mal à nouveau', 1, 24 * 2],
    [9016, 4, '', 0, 24 * 20],
  ];
  for (const [n, score, c, consent, h] of sat) q('INSERT INTO satisfaction (dossier_num,score,comment,consent,collected_at) VALUES (?,?,?,?,?)', n, score, c, consent, ago(h));

  return s;
}
