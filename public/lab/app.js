/* SyndicPlus — laboratoire de démonstration.
   Les circuits sont choisis par le moteur de parcours P1–P6 (API /api/procedures/*) selon la fiche de l'immeuble.
   Données fictives dans ce navigateur ; aucun envoi réel. Tout texte est inséré via textContent. */
(() => {
  'use strict';

  const CASES_KEY = 'syndicplus-demo-lab-v2';
  const CONFIG_KEY = 'syndicplus-demo-building-v1';
  const CLOCK_KEY = 'syndicplus-demo-clock-offset';
  const ROLES = ['resident', 'guardian', 'manager', 'provider', 'council', 'building'];
  const REPORTER_OF = { resident: 'resident', guardian: 'guardian', manager: 'manager', provider: 'contractor', council: 'council_president', building: 'manager' };
  const REPORTER_LABEL = { resident: 'un résident', guardian: 'le gardien', manager: 'le gestionnaire', contractor: 'un prestataire', council_president: 'le président du conseil syndical' };
  const NOTIFY_LABEL = { manager: 'gestionnaire', council_president: 'président du conseil syndical', guardian: 'gardien en service', backup_guardian: 'gardien remplaçant en service', on_call_contractor: 'astreinte du prestataire', affected_residents: 'résidents concernés' };
  const TRADE_LABEL = { electricite: 'électricité', plomberie: 'plomberie', chauffage: 'chauffage', ascenseur: 'ascenseur', ventilation: 'ventilation', fermetures: 'portes et fermetures', interphonie: 'interphonie', nettoyage: 'nettoyage', espaces_verts: 'espaces verts', toiture_facade: 'toiture et façade', nuisibles: 'nuisibles', irve: 'bornes de recharge', photovoltaique: 'photovoltaïque', securite_incendie: 'sécurité incendie', general: 'tous travaux' };
  const VERIFIER_OF = { guardian: 'guardian', council_president: 'council', manager: 'manager' };
  const VERIFIER_LABEL = { guardian: 'le gardien', council: 'le président du conseil syndical', manager: 'le gestionnaire' };

  const STATUS = {
    guardian: 'À traiter par le gardien',
    guardian_active: 'Pris en charge par le gardien',
    guardian_done: 'Réparé par le gardien — à valider',
    manager_decision: 'Décision du gestionnaire',
    emergency: 'Urgence en cours',
    secured: 'Mis en sécurité — suite à décider',
    quotes: 'Consultation des entreprises',
    assigned: 'Prestataire affecté',
    progress: 'En intervention',
    verification: 'À vérifier sur place',
    reserved: 'Réserves émises',
    verified: 'Exécution confirmée',
    closed: 'Clôturé',
  };

  const GROUPS = [
    ['Éclairage et électricité', ['eclairage_commun', 'eclairage_securite', 'panne_electrique_collective', 'irve', 'photovoltaique']],
    ['Eau et chauffage', ['fuite_legere', 'fuite_majeure', 'degat_des_eaux', 'canalisation_bouchee', 'chauffage_localise', 'chauffage_collectif', 'eau_chaude_collective', 'eau_suspicion_sanitaire', 'inondation_sous_sol', 'infiltration_privative', 'infiltration_toiture']],
    ['Équipements et accès', ['ascenseur', 'porte_entree', 'interphone', 'portail_parking', 'badge_perdu', 'vmc']],
    ['Sécurité', ['incendie', 'alarme_incendie', 'intrusion', 'garde_corps', 'chute_facade', 'amiante_plomb', 'arbre_dangereux']],
    ['Vie de l’immeuble', ['nettoyage', 'encombrants', 'nuisibles', 'nuisances_sonores', 'vandalisme']],
    ['Travaux', ['renovation', 'travaux_votes_retard']],
  ];

  const byId = (id) => document.getElementById(id);
  const now = () => new Date().toLocaleString('fr-FR');
  const store = {
    get(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible : la démo continue en mémoire */ } },
  };

  let cases = store.get(CASES_KEY, []);
  if (!Array.isArray(cases)) cases = [];
  let config = null;
  let demoConfig = null;
  let catalog = null;
  let current = 'resident';
  let perms = {};
  let review = { blocked: [], recurrences: [], summaries: {} };
  let pendingReport = null;
  const demoNow = () => Date.now() + (Number(store.get(CLOCK_KEY, 0)) || 0);

  // ---------- Utilitaires d'affichage (textContent uniquement) ----------
  function el(tag, text, cls) { const e = document.createElement(tag); if (text !== undefined && text !== null) e.textContent = text; if (cls) e.className = cls; return e; }
  function button(text, onClick, variant) { const b = el('button', text, variant || ''); b.type = 'button'; b.addEventListener('click', onClick); return b; }
  function persist() { store.set(CASES_KEY, cases); }
  function log(d, text) { d.history.push({ time: now(), text }); d.updatedAt = Date.now(); }
  function setStatus(d, status, text) { d.status = status; if (text) log(d, text); persist(); render(); }
  function find(id) { return cases.find((c) => c.id === id); }

  function nextActorLabel(d) {
    const mgr = `${config?.managerName || 'Gestionnaire'} (gestionnaire)`;
    switch (d.status) {
      case 'guardian': case 'guardian_active': return `${d.decision?.firstActorName || 'Gardien'} (gardien)`;
      case 'assigned': case 'progress': return `${d.contractor?.provider || 'Prestataire'} (prestataire)`;
      case 'verification': return VERIFIER_LABEL[d.requiredVerifier] || mgr;
      default: return mgr;
    }
  }
  function snapshotOf(d) {
    return { id: d.id, typeId: d.typeId, location: d.location, description: d.description, status: d.status, statusLabel: STATUS[d.status] || d.status, pathway: d.decision?.pathway || null, createdAt: d.createdAt || Date.now(), updatedAt: d.updatedAt || d.createdAt || Date.now(), deadlineHours: d.decision ? d.decision.deadlineHours : null, nextActor: nextActorLabel(d), history: d.history.map((h) => h.text), missing: d.decision?.missing || [] };
  }
  async function refreshReview() {
    try {
      review = await api('/api/procedures/review', { cases: cases.slice(0, 60).map(snapshotOf), now: demoNow() });
    } catch { review = { blocked: [], recurrences: [], summaries: {}, error: true }; }
    if (current === 'manager') renderManagerReview();
  }

  async function api(path, body) {
    const res = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch { /* réponse vide */ }
    if (!res.ok) { const err = new Error(data.error || `Erreur ${res.status}`); err.details = data.details || data.errors || []; throw err; }
    return data;
  }

  async function loadPerms() {
    const actions = ['request_quote', 'compare_and_advise', 'confirm_apparent_completion'];
    const results = await Promise.all(actions.map((action) => api('/api/procedures/president-permission', { action, config }).then((r) => r.permission).catch(() => ({ allowed: false, reason: 'Vérification des délégations indisponible.' }))));
    perms = Object.fromEntries(actions.map((a, i) => [a, results[i]]));
  }

  // ---------- Rôles ----------
  function role(name) {
    current = name;
    for (const r of ROLES) {
      byId(r).classList.toggle('hidden', r !== name);
      byId(r + '-tab').setAttribute('aria-pressed', String(r === name));
    }
    const slot = byId(name).querySelector('.report-slot');
    if (slot) slot.append(byId('report-box'));
    if (name === 'building') {
      if (config) renderBuilding();
      else byId('building-form').replaceChildren(el('p', 'Chargement de la fiche…', 'empty'));
    }
  }
  for (const r of ROLES) byId(r + '-tab').addEventListener('click', () => role(r));

  // ---------- Décision du moteur → état du dossier ----------
  function applyDecision(d, decision) {
    d.decision = decision;
    d.requiredVerifier = VERIFIER_OF[decision.verifier] || 'manager';
    const p = `Parcours ${decision.pathway} · ${decision.pathwayLabel}`;
    if (decision.firstActor === 'emergency') {
      d.status = 'emergency';
      log(d, `${p} : procédure de sécurité déclenchée immédiatement`);
      log(d, `Alertes envoyées en parallèle (simulation) : ${decision.notify.map((n) => NOTIFY_LABEL[n] || n).join(', ')}`);
    } else if (decision.firstActor === 'guardian' || decision.firstActor === 'backup_guardian') {
      d.status = 'guardian';
      log(d, `${p} : transmis directement à ${decision.firstActorName} (${decision.firstActor === 'guardian' ? 'gardien' : 'remplaçant'}), sans passer par le gestionnaire`);
    } else if (decision.firstActor === 'contractor' && decision.autoAssign) {
      d.status = 'assigned';
      d.contractor = decision.contractor;
      log(d, `${p} : affecté à ${decision.contractor.provider} selon le contrat et la préautorisation vérifiée ; gestionnaire informé (simulation)`);
    } else {
      d.status = 'manager_decision';
      d.prepared = decision.contractor;
      log(d, `${p} : décision du gestionnaire requise${decision.contractor ? ` — affectation préparée pour ${decision.contractor.provider}` : ''}`);
    }
    if (decision.councilRole === 'consultation') log(d, 'Président du conseil syndical associé au dossier (consultation, simulation)');
    else if (decision.councilRole === 'information' && decision.firstActor !== 'emergency') log(d, 'Président du conseil syndical informé (simulation)');
  }

  async function routeCase(d, extraSignals, reportedBy) {
    const signals = [...(d.dangerSignals || []), ...(extraSignals || [])];
    d.dangerSignals = signals;
    const { decision, warnings } = await api('/api/procedures/route', { typeId: d.typeId, reportedBy, dangerSignals: signals, config });
    d.warnings = warnings;
    d.typeLabel = decision.typeLabel;
    applyDecision(d, decision);
  }

  // ---------- Signalement ----------
  byId('report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = byId('report-error');
    errBox.classList.add('hidden');
    const typeId = byId('issue-type').value;
    const location = byId('issue-location').value.trim();
    const description = byId('issue-description').value.trim();
    const danger = byId('issue-danger').value;
    if (!typeId || !location || !description) return;
    const label = catalog?.types.find((t) => t.id === typeId)?.label || typeId;
    const analysis = window.syndicDemoAnalysis ? window.syndicDemoAnalysis.evaluate(label, location, description) : { reasons: [], missing: [] };
    const signals = [...analysis.reasons];
    if (danger === 'Oui') signals.push('Danger immédiat déclaré');
    if (danger === 'Je ne sais pas') signals.push('Danger possible, à confirmer');
    const reportedBy = REPORTER_OF[current];
    const d = { id: 'DEMO-' + Date.now(), typeId, typeLabel: label, location, description, reportedBy, analysis, dangerSignals: signals, history: [], createdAt: Date.now() };
    // Doublon probable ? Proposer d'ajouter le signalement au dossier existant (jamais de fusion automatique).
    if (!pendingReport || pendingReport.force !== true) {
      try {
        const open = cases.filter((c) => c.status !== 'closed').slice(0, 60).map(snapshotOf);
        const { candidates } = await api('/api/procedures/duplicates', { incoming: { typeId, location, description }, cases: open, now: demoNow() });
        if (candidates.length) { pendingReport = { d, candidates }; showDuplicates(); return; }
      } catch { /* vérification des doublons indisponible : on crée le dossier */ }
    }
    pendingReport = null;
    byId('duplicate-box').replaceChildren();
    log(d, `Signalement enregistré par ${REPORTER_LABEL[reportedBy]}`);
    const submit = e.submitter || byId('report-form').querySelector('button[type=submit]');
    submit.disabled = true;
    try {
      await routeCase(d, [], reportedBy);
      cases.unshift(d);
      persist();
      byId('report-form').reset();
      byId('issue-type').value = 'eclairage_commun';
      render();
    } catch (err) {
      errBox.textContent = 'Le moteur de parcours est indisponible : ' + err.message + '. Le signalement n’a pas été créé.';
      errBox.classList.remove('hidden');
    } finally {
      submit.disabled = false;
    }
  });

  function showDuplicates() {
    const box = byId('duplicate-box');
    box.replaceChildren();
    if (!pendingReport) return;
    const wrap = el('div', undefined, 'warning');
    wrap.append(el('strong', 'Ce problème semble déjà signalé'));
    for (const c of pendingReport.candidates) {
      const existing = find(c.id);
      if (!existing) continue;
      const row = el('div', undefined, 'quote-row');
      row.append(el('b', `${existing.typeLabel} · ${existing.location}`), el('span', `${STATUS[existing.status] || existing.status} — ${c.reasons.join(', ')}`));
      row.append(button('Ajouter mon signalement à ce dossier', () => {
        const r = pendingReport.d;
        existing.linkedReports = [...(existing.linkedReports || []), { by: r.reportedBy, description: r.description, at: now() }];
        log(existing, `Signalement associé (${REPORTER_LABEL[r.reportedBy]}) : ${r.description}`);
        pendingReport = null; box.replaceChildren(); persist(); byId('report-form').reset(); byId('issue-type').value = 'eclairage_commun'; render();
      }, 'secondary'));
      wrap.append(row);
    }
    wrap.append(button('Non, créer un nouveau dossier', () => { pendingReport.force = true; byId('report-form').requestSubmit(); }));
    box.append(wrap);
  }

  // ---------- Carte de dossier ----------
  function card(d, todo, next) {
    const wrap = el('article', undefined, 'note');
    wrap.dataset.case = d.id;
    wrap.append(el('strong', `${d.typeLabel} · ${d.location}`));
    const meta = el('div', undefined, 'meta');
    meta.append(el('span', STATUS[d.status] || d.status, 'status'));
    if (d.decision) meta.append(el('span', `${d.decision.pathway} · ${d.decision.pathwayLabel}`, 'chip' + (d.decision.pathway === 'P5' ? ' p5' : '')));
    wrap.append(meta);
    wrap.append(el('p', d.description));
    if (todo) { const t = el('div', undefined, 'todo'); t.append(el('b', 'À faire'), el('span', todo)); wrap.append(t); }
    if (next) { const t = el('div', undefined, 'todo next'); t.append(el('b', 'Étape suivante'), el('span', next)); wrap.append(t); }
    return wrap;
  }

  function why(wrap, d) {
    if (!d.decision) return;
    const det = el('details');
    det.append(el('summary', 'Pourquoi ce circuit ?'));
    const ul = el('ul');
    for (const r of d.decision.reasons) ul.append(el('li', r));
    for (const m of d.decision.missing) ul.append(el('li', 'Information manquante : ' + m));
    det.append(ul);
    if (d.linkedReports?.length) det.append(el('p', `${d.linkedReports.length} signalement(s) associé(s) à ce dossier.`, 'small'));
    if (window.syndicDemoAnalysis && ['manager_decision', 'guardian', 'emergency'].includes(d.status)) window.syndicDemoAnalysis.display(det, d);
    wrap.append(det);
  }

  function history(wrap, d) {
    const det = el('details');
    det.append(el('summary', `Historique (${d.history.length})`));
    const ul = el('ul');
    for (const h of d.history) ul.append(el('li', `${h.time} — ${h.text}`));
    det.append(ul);
    wrap.append(det);
  }

  function actions(wrap, ...items) { const a = el('div', undefined, 'actions'); a.append(...items.filter(Boolean)); wrap.append(a); return a; }

  // ---------- Vérification et réserves (circuit validé) ----------
  function decideVerification(d, actor, decision) {
    if (!['verification', 'reserved'].includes(d.status) || d.requiredVerifier !== actor) return;
    d.verifications = d.verifications || {};
    d.verifications[actor] = decision;
    const who = { guardian: 'Gardien', council: 'Président CS', manager: 'Gestionnaire' }[actor];
    log(d, `${who} : ${decision === 'ok' ? 'bonne exécution apparente confirmée' : decision === 'reserve' ? 'réserves signalées' : 'vérification impossible'} (simulation)`);
    d.status = decision === 'reserve' ? 'reserved' : d.verifications[d.requiredVerifier] === 'ok' ? 'verified' : 'verification';
    persist(); render();
  }
  function verificationButtons(d, actor) {
    if (!['verification', 'reserved'].includes(d.status) || d.requiredVerifier !== actor) return [];
    return [
      button('Travaux conformes', () => decideVerification(d, actor, 'ok')),
      button('Émettre des réserves', () => decideVerification(d, actor, 'reserve'), 'secondary'),
      button('Impossible de vérifier', () => decideVerification(d, actor, 'unavailable'), 'secondary'),
    ];
  }
  function sendBackForRework(d) {
    if (d.status !== 'reserved') return;
    // Reprise : les vérifications et contrôles précédents ne valent plus, une nouvelle vérification terrain sera exigée.
    d.verifications = {}; d.techChecks = {}; d.rework = (d.rework || 0) + 1;
    setStatus(d, 'assigned', `Gestionnaire : réserves transmises au prestataire, reprise n°${d.rework} demandée (simulation)`);
  }

  // ---------- Technicien ----------
  function technicianForm(d, wrap) {
    const panel = el('div', undefined, 'tech-summary');
    panel.append(el('strong', 'Vérification et validation de l’intervention'));
    const note = el('label', 'Compte rendu des travaux et vérifications');
    const area = el('textarea'); area.setAttribute('aria-label', 'Compte rendu du technicien'); area.maxLength = 1000; area.placeholder = 'Travaux réalisés, vérifications effectuées, résultat et éventuelles réserves…'; area.value = d.techReport || '';
    note.append(area); panel.append(note);
    panel.append(el('label', 'Contrôles réellement effectués'));
    const inputs = {};
    for (const [key, text] of [['visual', 'Inspection visuelle effectuée'], ['safe', 'Zone vérifiée sans danger constaté'], ['functional', 'Essai de fonctionnement effectué']]) {
      const l = el('label', undefined, 'tech-check'); const box = el('input'); box.type = 'checkbox'; box.checked = Boolean(d.techChecks?.[key]); l.append(box, el('span', text)); panel.append(l); inputs[key] = box;
    }
    const photoLabel = el('label', 'Photo de vérification (facultative, nom du fichier seulement)'); const photo = el('input'); photo.type = 'file'; photo.accept = 'image/*'; photo.setAttribute('aria-label', 'Photo justificative'); photoLabel.append(photo); panel.append(photoLabel);
    const message = el('p', '', 'small'); panel.append(message);
    const save = () => { d.techReport = area.value.trim(); d.techChecks = Object.fromEntries(Object.entries(inputs).map(([k, n]) => [k, n.checked])); if (photo.files?.length) d.photoEvidenceName = photo.files[0].name; persist(); message.textContent = 'Vérifications enregistrées dans ce navigateur (simulation).'; };
    actions(panel,
      button('Enregistrer les vérifications', save, 'secondary'),
      button('Marquer les travaux réalisés', () => {
        save();
        if (!d.techReport || !d.techChecks?.visual) { message.textContent = 'Ajoutez un compte rendu et confirmez le contrôle visuel avant de terminer.'; return; }
        setStatus(d, 'verification', `Technicien : travaux déclarés réalisés. Vérification terrain attendue par ${VERIFIER_LABEL[d.requiredVerifier]} (simulation)`);
      }),
      button('Problème non résolu', () => { save(); setStatus(d, 'manager_decision', 'Technicien : difficulté signalée, décision du gestionnaire nécessaire (simulation)'); }, 'secondary'),
    );
    wrap.append(panel);
  }

  // ---------- Gardien ----------
  function guardianNotified(d) { return d.decision?.notify?.some((n) => n === 'guardian' || n === 'backup_guardian'); }

  async function guardianCannotResolve(d, estimateInput, errBox) {
    const raw = estimateInput.value.trim();
    const estimateHT = raw === '' ? undefined : Number(raw);
    try {
      const { decision } = await api('/api/procedures/after-guardian', { typeId: d.typeId, estimateHT, dangerSignals: d.dangerSignals || [], config });
      d.afterGuardian = decision;
      log(d, `Gardien : intervention extérieure nécessaire${estimateHT !== undefined ? ` (estimation ${estimateHT} € HT)` : ''}`);
      for (const r of [...decision.reasons, ...decision.missing]) log(d, 'Moteur : ' + r);
      if (decision.next === 'contractor' && decision.autoAssign) {
        d.contractor = decision.contractor;
        setStatus(d, 'assigned', `Affecté automatiquement à ${decision.contractor.provider} (préautorisation vérifiée) ; gestionnaire informé (simulation)`);
      } else {
        d.prepared = decision.contractor;
        setStatus(d, 'manager_decision', `Transmis au gestionnaire pour décision${decision.contractor ? ` — affectation préparée pour ${decision.contractor.provider}` : ''}`);
      }
    } catch (err) {
      errBox.textContent = 'Moteur indisponible : ' + err.message; errBox.classList.remove('hidden');
    }
  }

  function guardianView(host) {
    const g = config?.guardian;
    byId('guardian-sub').textContent = g ? `${g.name} — constats sans risque${g.canSmallRepair ? ' et petit entretien prévu dans vos missions' : ''}.` : 'Aucun gardien renseigné dans la fiche de l’immeuble.';
    const mine = cases.filter((d) => d.checkRequest?.open || ['guardian', 'guardian_active'].includes(d.status) || (d.status === 'emergency' && guardianNotified(d)) || (d.requiredVerifier === 'guardian' && ['verification', 'reserved'].includes(d.status)));
    if (!mine.length) { host.append(el('p', 'Rien à faire pour le moment.', 'empty')); return; }
    for (const d of mine) {
      if (d.checkRequest?.open && !['guardian', 'guardian_active', 'emergency'].includes(d.status) && !(d.requiredVerifier === 'guardian' && ['verification', 'reserved'].includes(d.status))) {
        const w = card(d, 'Le président du conseil syndical demande une vérification sur place, sans prendre de risque.', 'Votre constat est ajouté au dossier.');
        const text = el('textarea'); text.maxLength = 1000; text.setAttribute('aria-label', 'Constat du gardien'); w.append(field('Votre constat', text));
        actions(w, button('Constat effectué', () => { d.checkRequest = { ...d.checkRequest, open: false }; log(d, 'Gardien : constat effectué à la demande du président' + (text.value.trim() ? ' — ' + text.value.trim().slice(0, 1000) : '')); persist(); render(); }));
        history(w, d); host.append(w); continue;
      }
      if (d.status === 'emergency') {
        const w = card(d, 'Urgence : appliquez les consignes de sécurité sans vous exposer.', 'Le gestionnaire et le président du CS sont prévenus en parallèle.');
        w.append(el('p', d.decision.nextAction, 'alert'));
        actions(w, d.guardianSafetyNote ? null : button('Constat de sécurité transmis', () => { d.guardianSafetyNote = true; log(d, 'Gardien : constat de sécurité transmis (simulation)'); persist(); render(); }));
        history(w, d); host.append(w); continue;
      }
      if (d.status === 'verification' || d.status === 'reserved') {
        const w = card(d, 'Vérifiez sur place la bonne exécution apparente (ce n’est pas une réception juridique).', 'Conforme : le gestionnaire clôture. Réserves : la clôture est bloquée.');
        if (d.techReport) w.append(el('p', 'Compte rendu du technicien : ' + d.techReport, 'small'));
        actions(w, ...verificationButtons(d, 'guardian'));
        history(w, d); host.append(w); continue;
      }
      const canResolve = Boolean(d.decision?.guardianCanResolve);
      if (d.status === 'guardian') {
        const w = card(d, canResolve ? 'Vérifier sur place, puis réparer si c’est sans risque et prévu dans vos missions.' : 'Faire un constat sans risque. La réparation n’entre pas dans vos missions.', 'Vous indiquez ensuite si c’est réparé ou si un prestataire est nécessaire.');
        actions(w, button('Je prends en charge', () => setStatus(d, 'guardian_active', 'Gardien : prise en charge du constat')));
        why(w, d); history(w, d); host.append(w); continue;
      }
      // guardian_active
      const selfClose = Boolean(config?.guardian?.selfCloseSmallRepair);
      const w = card(d, canResolve ? 'Indiquez le résultat de votre intervention.' : 'Indiquez le résultat de votre constat.', canResolve ? (selfClose ? 'Réparé : le dossier est clôturé selon la fiche, sans le gestionnaire.' : 'Réparé : le gestionnaire valide la clôture.') : 'Prestataire nécessaire : contrat préautorisé ou décision du gestionnaire.');
      const est = el('label', 'Estimation du coût si un prestataire est nécessaire (€ HT, facultatif)');
      const input = el('input'); input.type = 'number'; input.min = '0'; input.max = '100000'; input.step = '10'; input.setAttribute('aria-label', 'Estimation du coût'); est.append(input);
      const errBox = el('p', '', 'alert hidden');
      w.append(est, errBox);
      actions(w,
        canResolve ? button('Petite réparation effectuée', () => {
          if (selfClose) setStatus(d, 'closed', 'Gardien : petite réparation effectuée — dossier clôturé selon la fiche de l’immeuble, gestionnaire non sollicité (simulation)');
          else setStatus(d, 'guardian_done', 'Gardien : petite réparation effectuée, validation du gestionnaire attendue (simulation)');
        }) : null,
        button('Prestataire nécessaire', () => guardianCannotResolve(d, input, errBox), canResolve ? 'secondary' : ''),
        button('Danger / urgence', async () => { try { log(d, 'Gardien : danger constaté sur place'); await routeCase(d, ['Danger constaté par le gardien'], 'guardian'); persist(); render(); } catch (err) { errBox.textContent = 'Moteur indisponible : ' + err.message; errBox.classList.remove('hidden'); } }, 'danger'),
      );
      why(w, d); history(w, d); host.append(w);
    }
  }

  // ---------- Gestionnaire : « Votre journée » ----------
  const MANAGER_URGENT = ['emergency', 'secured'];
  const MANAGER_DECISION = ['manager_decision', 'guardian_done', 'verified', 'reserved', 'quotes'];

  function managerCard(d) {
    if (d.status === 'emergency') {
      const w = card(d, 'Urgence : vérifier que la mise en sécurité est faite et que l’astreinte est prévenue.', 'Ensuite : décider de la suite (réparation, devis, assurance).');
      w.append(el('p', d.decision.nextAction, 'alert'));
      w.append(el('p', 'Prévenus en parallèle : ' + d.decision.notify.map((n) => NOTIFY_LABEL[n] || n).join(', ') + (d.decision.contractor ? ` — astreinte : ${d.decision.contractor.provider}` : ''), 'small'));
      actions(w, button('Mise en sécurité confirmée', () => setStatus(d, 'secured', 'Gestionnaire : mise en sécurité confirmée (simulation)')));
      why(w, d); history(w, d); return w;
    }
    if (d.status === 'manager_decision' || d.status === 'secured') {
      const prepared = d.prepared || (d.status === 'secured' ? d.decision?.contractor : null);
      const consult = d.decision?.councilRole === 'consultation';
      const w = card(d, prepared ? `Valider l’affectation préparée pour ${prepared.provider}, ou choisir une autre suite.` : 'Choisir la suite : affecter un prestataire ou consulter des entreprises.', consult ? 'Le président du conseil syndical peut recueillir et comparer les devis.' : 'Le prestataire reçoit la mission ; vérification puis clôture.');
      for (const m of d.decision?.missing || []) w.append(el('p', 'Information manquante : ' + m, 'small'));
      actions(w,
        prepared ? button(`Valider l’affectation à ${prepared.provider}`, () => { d.contractor = prepared; setStatus(d, 'assigned', `Gestionnaire : affectation validée pour ${prepared.provider} (simulation)`); }) : null,
        button('Affecter un prestataire (simulation)', () => { d.contractor = { provider: 'Prestataire choisi par le gestionnaire' }; setStatus(d, 'assigned', 'Gestionnaire : prestataire affecté (simulation)'); }, prepared ? 'secondary' : ''),
        ['P3', 'P4', 'P6', 'P5'].includes(d.decision?.pathway) ? button('Lancer une consultation (devis)', () => setStatus(d, 'quotes', 'Gestionnaire : consultation des entreprises ouverte (simulation)'), 'secondary') : null,
      );
      why(w, d); history(w, d); return w;
    }
    if (d.status === 'quotes') {
      const has = Boolean(d.quotes?.length);
      const w = card(d, has ? 'Examinez la comparaison et l’avis consultatif, puis retenez une entreprise.' : 'Consultation ouverte : en attente des devis (le président du CS peut les recueillir).', 'La commande relève de vous ; la vérification sur place suivra les travaux.');
      comparisonBlock(w, d);
      if (d.advice) w.append(adviceBox(d));
      if (d.presidentAuthorization) w.append(el('p', `Autorisé par le président dans sa délégation (${d.presidentAuthorization.reference}) : ${d.presidentAuthorization.company}, ${d.presidentAuthorization.amountHT} € HT. La commande reste à passer par vous.`, 'msg-ok'));
      actions(w,
        ...(d.quotes || []).map((q) => button(`Retenir ${q.company} et commander`, () => { d.contractor = { provider: q.company }; d.retainedQuote = q; setStatus(d, 'assigned', `Gestionnaire : ${q.company} retenue (${q.amountHT} € HT), commande passée (simulation)`); }, 'secondary')),
        has ? null : button('Affecter sans devis (simulation)', () => { d.contractor = { provider: 'Prestataire choisi par le gestionnaire' }; setStatus(d, 'assigned', 'Gestionnaire : prestataire affecté sans consultation (simulation)'); }, 'secondary'),
      );
      history(w, d); return w;
    }
    if (d.status === 'guardian_done') {
      const w = card(d, 'Le gardien a réparé : valider la clôture.', 'Le dossier sera clôturé.');
      actions(w, button('Valider la clôture', () => setStatus(d, 'closed', 'Gestionnaire : clôture validée après intervention du gardien')));
      history(w, d); return w;
    }
    if (d.status === 'verified') {
      const w = card(d, 'Exécution confirmée sur place : assurer les suites administratives et clôturer.', 'Le dossier sera clôturé ; la réception juridique éventuelle reste distincte.');
      actions(w, button('Clôturer administrativement', () => setStatus(d, 'closed', 'Gestionnaire : clôture administrative après confirmation terrain')));
      history(w, d); return w;
    }
    if (d.status === 'reserved') {
      const w = card(d, 'Réserves émises : renvoyez le dossier au prestataire pour reprise, ou attendez une nouvelle vérification sur place.', 'Après reprise, une nouvelle vérification terrain est exigée avant clôture.');
      actions(w, button('Renvoyer au prestataire pour reprise', () => sendBackForRework(d)));
      history(w, d); return w;
    }
    // Vérification par le gestionnaire lui-même (aucun vérificateur désigné)
    if (d.status === 'verification' && d.requiredVerifier === 'manager') {
      const w = card(d, 'Aucun vérificateur désigné : confirmez vous-même la bonne exécution apparente.', 'Conforme : clôture. Réserves : reprise.');
      actions(w, ...verificationButtons(d, 'manager'));
      history(w, d); return w;
    }
    const w = card(d, null, nextStepText(d));
    history(w, d); return w;
  }

  function nextStepText(d) {
    switch (d.status) {
      case 'guardian': case 'guardian_active': return `Chez ${d.decision?.firstActorName || 'le gardien'} : constat ou petit entretien.`;
      case 'assigned': return `Chez ${d.contractor?.provider || 'le prestataire'} : début d’intervention.`;
      case 'progress': return 'Intervention en cours.';
      case 'verification': return `Vérification attendue par ${VERIFIER_LABEL[d.requiredVerifier]}.`;
      case 'closed': return 'Dossier terminé.';
      default: return '';
    }
  }

  function renderManagerReview() {
    const box = byId('manager-review');
    if (!box) return;
    const open = new Set([...box.querySelectorAll('details[open]')].map(detailsKey));
    box.replaceChildren();
    const blocked = review.blocked.filter((b) => find(b.id));
    const head = el('div', undefined, 'section-title'); head.append(el('h3', 'À relancer'), el('span', String(blocked.length), 'count')); box.append(head);
    if (review.error) box.append(el('p', 'Analyse des dossiers indisponible.', 'empty'));
    else if (!blocked.length) box.append(el('p', 'Aucun dossier bloqué.', 'empty'));
    for (const b of blocked) {
      const d = find(b.id);
      const w = card(d, `Sans action depuis le délai prévu (+${b.overdueHours} h). Relance préparée pour ${b.nextActor}.`, 'Validez la relance : elle n’est jamais envoyée automatiquement.');
      const det = el('details'); det.append(el('summary', 'Voir la relance préparée'));
      det.append(el('p', 'Objet : ' + b.reminder.subject, 'small'));
      const pre = el('p', b.reminder.body, 'small'); pre.style.whiteSpace = 'pre-line'; det.append(pre);
      w.append(det);
      actions(w, button('Valider la relance (simulation)', () => { log(d, `Relance validée par le gestionnaire pour ${b.nextActor} (simulation, aucun envoi)`); d.updatedAt = demoNow(); persist(); render(); }));
      const sum = review.summaries[d.id];
      if (sum) { const s2 = el('details'); s2.append(el('summary', 'Résumé du dossier')); const ul = el('ul'); for (const l of sum) ul.append(el('li', l)); s2.append(ul); w.append(s2); }
      box.append(w);
    }
    if (review.recurrences.length) {
      const h2 = el('div', undefined, 'section-title'); h2.append(el('h3', 'Problèmes récurrents'), el('span', String(review.recurrences.length), 'count')); box.append(h2);
      for (const r of review.recurrences) box.append(el('p', r.message, 'todo'));
    }
    for (const dt of box.querySelectorAll('details')) if (open.has(detailsKey(dt))) dt.open = true;
  }

  function managerView(host) {
    const urgent = cases.filter((d) => MANAGER_URGENT.includes(d.status));
    const decide = cases.filter((d) => MANAGER_DECISION.includes(d.status) || (d.status === 'verification' && d.requiredVerifier === 'manager'));
    const auto = cases.filter((d) => !urgent.includes(d) && !decide.includes(d) && d.status !== 'closed');
    const closed = cases.filter((d) => d.status === 'closed');
    const section = (title, list, emptyText) => {
      const head = el('div', undefined, 'section-title'); head.append(el('h3', title), el('span', String(list.length), 'count'));
      host.append(head);
      if (!list.length) host.append(el('p', emptyText, 'empty'));
      for (const d of list) host.append(managerCard(d));
    };
    const reviewBox = el('div'); reviewBox.id = 'manager-review'; host.append(reviewBox);
    section('Urgences', urgent, 'Aucune urgence.');
    section('Décisions à prendre', decide, 'Aucune décision en attente.');
    const det = el('details');
    det.append(el('summary', `Suivis automatiques en cours (${auto.length}) — sans action de votre part`));
    if (!auto.length) det.append(el('p', 'Aucun dossier en suivi automatique.', 'empty'));
    for (const d of auto) det.append(managerCard(d));
    host.append(det);
    if (closed.length) { const c = el('details'); c.append(el('summary', `Dossiers clôturés (${closed.length})`)); for (const d of closed) c.append(managerCard(d)); host.append(c); }
  }

  // ---------- Prestataire ----------
  function providerView(host) {
    const mine = cases.filter((d) => ['assigned', 'progress', 'reserved'].includes(d.status) && d.contractor);
    if (!mine.length) { host.append(el('p', 'Aucune mission pour le moment.', 'empty')); return; }
    for (const d of mine) {
      if (d.status === 'reserved') { const w = card(d, null, 'Réserves émises lors de la vérification : en attente de la décision du gestionnaire.'); history(w, d); host.append(w); continue; }
      const w = card(d, d.status === 'assigned' ? `Mission pour ${d.contractor.provider} : confirmez le début d’intervention.` : 'Réalisez l’intervention, enregistrez vos contrôles, puis déclarez les travaux réalisés.', `Ensuite : vérification sur place par ${VERIFIER_LABEL[d.requiredVerifier]}.`);
      if (d.status === 'assigned') actions(w, button('Confirmer le début', () => setStatus(d, 'progress', 'Le prestataire a commencé l’intervention')));
      if (d.status === 'progress') technicianForm(d, w);
      history(w, d); host.append(w);
    }
  }

  // ---------- Président du conseil syndical ----------
  // Séparation stricte : constat et avis (consultatifs) ≠ demande de devis (n'engage pas) ≠ autorisation (délégation vérifiée) ≠ commande (gestionnaire).
  function comparisonBlock(wrap, d) {
    const c = d.comparison;
    if (!c || !c.rows.length) return;
    const box = el('div', undefined, 'quotes');
    box.append(el('strong', `Comparaison de ${c.rows.length} devis (indicative)`));
    for (const r of c.rows) {
      const row = el('div', undefined, 'quote-row');
      row.append(el('b', r.company));
      row.append(el('span', `${r.amountHT.toLocaleString('fr-FR')} € HT · ${r.amountTTC.toLocaleString('fr-FR')} € TTC · ${r.delayDays === null ? 'délai non précisé' : r.delayDays + ' j'}`));
      const tags = el('div', undefined, 'meta');
      if (r.lowestPrice) tags.append(el('span', 'Prix le plus bas', 'chip ok'));
      if (r.shortestDelay) tags.append(el('span', 'Délai le plus court', 'chip ok'));
      if (r.missing.length) tags.append(el('span', 'À compléter : ' + r.missing.join(', '), 'chip warn'));
      row.append(tags);
      box.append(row);
    }
    for (const n of c.notes) box.append(el('p', n, 'small'));
    wrap.append(box);
  }

  function adviceBox(d) {
    const b = el('div', undefined, 'todo');
    b.append(el('b', 'Avis consultatif du président'), el('span', d.advice.text + (d.advice.preferred ? ` — préférence : ${d.advice.preferred}` : '')));
    b.append(el('p', 'Cet avis ne vaut ni décision du conseil syndical ni attribution du marché.', 'small'));
    return b;
  }

  async function addQuote(d, fields, msg) {
    const amountHT = Number(fields.amount.value);
    const company = fields.company.value.trim();
    if (!company || fields.amount.value === '' || !Number.isFinite(amountHT) || amountHT < 0) { msg.textContent = 'Indiquez l’entreprise et un montant HT valide.'; return; }
    const q = { company: company.slice(0, 120), amountHT, vatRate: Number(fields.vat.value), delayDays: fields.delay.value === '' ? null : Number(fields.delay.value), scope: fields.scope.value.trim().slice(0, 500), warranty: fields.warranty.value.trim().slice(0, 200) };
    try {
      const quotes = [...(d.quotes || []).filter((x) => x.company !== q.company), q];
      const { comparison } = await api('/api/procedures/compare-quotes', { quotes });
      d.quotes = quotes; d.comparison = comparison;
      if (d.status === 'manager_decision') d.status = 'quotes';
      log(d, `Devis reçu et enregistré par le président : ${q.company}, ${q.amountHT} € HT`);
      persist(); render();
    } catch (err) { msg.textContent = 'Comparaison indisponible : ' + err.message; }
  }

  function quoteTools(wrap, d) {
    const box = el('div', undefined, 'tech-summary');
    const msg = el('p', '', 'small');
    // Demande de devis
    box.append(el('strong', '1. Solliciter des entreprises'));
    if (perms.request_quote?.allowed) {
      const company = textInput('', 'Entreprise à solliciter');
      const row = el('div', undefined, 'inline'); row.append(field('Entreprise à solliciter', company));
      row.append(button('Demander un devis', () => {
        const name = company.value.trim();
        if (!name) { msg.textContent = 'Indiquez le nom de l’entreprise.'; return; }
        d.quoteRequests = [...(d.quoteRequests || []), { company: name.slice(0, 120), at: now() }];
        if (d.status === 'manager_decision') d.status = 'quotes';
        log(d, `Demande de devis adressée à ${name} par le président (simulation : aucun envoi, n’engage pas la copropriété)`);
        persist(); render();
      }, 'secondary'));
      box.append(row);
      if (d.quoteRequests?.length) box.append(el('p', 'Sollicitées : ' + d.quoteRequests.map((r) => r.company).join(', '), 'small'));
    } else box.append(el('p', perms.request_quote?.reason || 'Demande de devis non prévue par la fiche.', 'small'));
    // Devis reçus
    box.append(el('strong', '2. Enregistrer un devis reçu'));
    const f = { company: textInput('', 'Entreprise du devis'), amount: numberInput('', 'Montant HT du devis'), vat: el('select'), delay: numberInput('', 'Délai en jours'), scope: textInput('', 'Périmètre des travaux'), warranty: textInput('', 'Garanties') };
    f.vat.setAttribute('aria-label', 'Taux de TVA');
    for (const v of ['10', '20', '5.5']) { const o = el('option', v + ' %'); o.value = v; f.vat.append(o); }
    const g = el('div', undefined, 'grid2');
    g.append(field('Entreprise', f.company), field('Montant (€ HT)', f.amount), field('TVA', f.vat), field('Délai (jours)', f.delay), field('Périmètre', f.scope), field('Garanties', f.warranty));
    const saveQuote = button('Enregistrer le devis reçu', async () => { saveQuote.disabled = true; try { await addQuote(d, f, msg); } finally { saveQuote.disabled = false; } }, 'secondary');
    box.append(g, saveQuote);
    comparisonBlock(box, d);
    // Avis
    if (d.quotes?.length) {
      box.append(el('strong', '3. Donner un avis consultatif'));
      if (d.advice) box.append(adviceBox(d));
      if (perms.compare_and_advise?.allowed) {
        const text = el('textarea'); text.maxLength = 1000; text.setAttribute('aria-label', 'Avis consultatif');
        const pref = el('select'); pref.setAttribute('aria-label', 'Préférence');
        for (const v of ['', ...d.quotes.map((q) => q.company)]) { const o = el('option', v || 'Sans préférence'); o.value = v; pref.append(o); }
        box.append(field('Votre avis', text), field('Préférence (facultatif)', pref));
        box.append(button(d.advice ? 'Modifier l’avis transmis' : 'Transmettre l’avis au gestionnaire', () => {
          if (!text.value.trim()) { msg.textContent = 'Rédigez votre avis.'; return; }
          d.advice = { text: text.value.trim().slice(0, 1000), preferred: pref.value };
          log(d, 'Avis consultatif du président transmis au gestionnaire (ne vaut pas attribution)' + (pref.value ? ` — préférence : ${pref.value}` : ''));
          persist(); render();
        }));
      } else box.append(el('p', perms.compare_and_advise?.reason || 'Avis non prévu par la fiche.', 'small'));
      // Délégation de dépense (rare, vérifiée)
      const deleg = config?.councilPresident?.delegations.authorizeExpenditure;
      if (deleg) {
        box.append(el('strong', '4. Délégation de dépense'));
        box.append(el('p', `Délégation vérifiée : ${deleg.verifiedReference}, jusqu’à ${deleg.ceilingHT} € HT. La commande reste au gestionnaire.`, 'small'));
        const row = el('div', undefined, 'actions');
        for (const q of d.quotes) {
          row.append(button(`Autoriser ${q.company} (${q.amountHT} € HT)`, async () => {
            const { permission } = await api('/api/procedures/president-permission', { action: 'authorize_expenditure', amountHT: q.amountHT, config });
            if (!permission.allowed) { msg.textContent = 'Autorisation impossible : ' + permission.reason; return; }
            d.presidentAuthorization = { company: q.company, amountHT: q.amountHT, reference: deleg.verifiedReference };
            log(d, `Président : dépense autorisée pour ${q.company} (${q.amountHT} € HT) dans sa délégation — commande à passer par le gestionnaire`);
            persist(); render();
          }, 'secondary'));
        }
        box.append(row);
      }
    }
    box.append(msg);
    wrap.append(box);
  }

  function observationTools(wrap, d) {
    const det = el('details');
    det.append(el('summary', 'Constat ou demande de vérification'));
    const text = el('textarea'); text.maxLength = 1000; text.setAttribute('aria-label', 'Votre constat');
    det.append(field('Votre constat', text));
    const msg = el('p', '', 'small');
    actions(det,
      button('Enregistrer le constat', () => { if (!text.value.trim()) { msg.textContent = 'Décrivez votre constat.'; return; } log(d, 'Constat du président du CS : ' + text.value.trim().slice(0, 1000)); persist(); render(); }, 'secondary'),
      config?.guardian && !d.checkRequest?.open ? button('Demander une vérification au gardien', () => { d.checkRequest = { open: true, at: now() }; log(d, 'Président du CS : vérification demandée au gardien (simulation)'); persist(); render(); }, 'secondary') : null,
    );
    det.append(msg);
    wrap.append(det);
  }

  function councilView(host) {
    if (!config?.councilPresident) { host.append(el('p', 'Aucun président renseigné dans la fiche de l’immeuble.', 'empty')); return; }
    const open = cases.filter((d) => d.status !== 'closed');
    const toVerify = cases.filter((d) => d.requiredVerifier === 'council' && ['verification', 'reserved'].includes(d.status));
    const consult = open.filter((d) => !toVerify.includes(d) && ['manager_decision', 'quotes'].includes(d.status) && (d.decision?.councilRole === 'consultation' || d.quoteRequests?.length));
    const followed = open.filter((d) => !toVerify.includes(d) && !consult.includes(d) && d.decision && (d.decision.councilRole !== 'none' || d.decision.notify.includes('council_president') || d.reportedBy === 'council_president'));
    const others = open.filter((d) => ![...toVerify, ...consult, ...followed].includes(d));
    const section = (title, list, emptyText, build) => {
      const head = el('div', undefined, 'section-title'); head.append(el('h3', title), el('span', String(list.length), 'count')); host.append(head);
      if (!list.length) host.append(el('p', emptyText, 'empty'));
      for (const d of list) host.append(build(d));
    };
    section('À vérifier sur place', toVerify, 'Aucune vérification demandée.', (d) => {
      const w = card(d, 'Vérifiez sur place la bonne exécution apparente (ce n’est pas une réception juridique).', 'Conforme : le gestionnaire clôture. Réserves : la clôture est bloquée.');
      if (d.techReport) w.append(el('p', 'Compte rendu du technicien : ' + d.techReport, 'small'));
      actions(w, ...verificationButtons(d, 'council'));
      history(w, d); return w;
    });
    section('Consultations et devis', consult, 'Aucune consultation en cours.', (d) => {
      const w = card(d, 'Recueillez et comparez les devis, puis transmettez votre avis au gestionnaire.', 'Le gestionnaire retient l’entreprise et passe commande.');
      quoteTools(w, d); observationTools(w, d); history(w, d); return w;
    });
    section('Dossiers suivis', followed, 'Aucun dossier suivi.', (d) => {
      const w = card(d, d.status === 'emergency' ? 'Information d’urgence : aucune action requise de votre part.' : null, nextStepText(d) || (d.status === 'manager_decision' ? 'Décision attendue du gestionnaire.' : ''));
      if (d.advice) w.append(adviceBox(d));
      observationTools(w, d); history(w, d); return w;
    });
    const det = el('details');
    det.append(el('summary', `Autres dossiers de l’immeuble (${others.length})`));
    for (const d of others) { const w = card(d, null, nextStepText(d)); observationTools(w, d); history(w, d); det.append(w); }
    host.append(det);
  }

  // ---------- Résident ----------
  function residentView(host) {
    if (!cases.length) { host.append(el('p', 'Aucun dossier pour le moment.', 'empty')); return; }
    for (const d of cases) {
      const next = d.status === 'emergency' ? 'Urgence prise en charge : suivez les consignes de sécurité.' : nextStepText(d) || (d.status === 'manager_decision' ? 'Le gestionnaire décide de la suite.' : d.status === 'quotes' ? 'Des devis sont en cours.' : '');
      const w = card(d, null, next);
      history(w, d); host.append(w);
    }
  }

  // Les sections dépliées par l'utilisateur restent ouvertes quand l'écran se redessine.
  function detailsKey(dt) {
    const owner = dt.closest('[data-case]')?.dataset.case || dt.closest('section')?.id || '';
    return owner + '|' + (dt.querySelector('summary')?.textContent || '').replace(/\s*\(\d+\)/g, '');
  }
  function render() {
    const views = { resident: residentView, guardian: guardianView, manager: managerView, provider: providerView, council: councilView };
    const open = new Set([...document.querySelectorAll('[id$="-cases"] details[open]')].map(detailsKey));
    for (const [name, view] of Object.entries(views)) { const host = byId(name + '-cases'); host.replaceChildren(); view(host); }
    renderManagerReview();
    for (const dt of document.querySelectorAll('[id$="-cases"] details')) if (open.has(detailsKey(dt))) dt.open = true;
    clearTimeout(render.reviewTimer);
    render.reviewTimer = setTimeout(refreshReview, 150);
  }

  // ---------- Fiche de l'immeuble ----------
  function field(labelText, input) { const l = el('label', labelText); l.append(input); return l; }
  function textInput(value, aria) { const i = el('input'); i.value = value ?? ''; i.maxLength = 120; if (aria) i.setAttribute('aria-label', aria); return i; }
  function numberInput(value, aria) { const i = el('input'); i.type = 'number'; i.min = '0'; i.step = '10'; i.value = value ?? ''; if (aria) i.setAttribute('aria-label', aria); return i; }
  function check(labelText, checked) { const l = el('label', undefined, 'check'); const i = el('input'); i.type = 'checkbox'; i.checked = Boolean(checked); l.append(i, el('span', labelText)); return { l, i }; }

  function renderBuilding() {
    const form = byId('building-form');
    form.replaceChildren();
    const c = structuredClone(config);
    const g = c.guardian;
    // Gardien
    const fg = el('fieldset'); fg.append(el('legend', 'Gardien'));
    const gName = textInput(g?.name, 'Nom du gardien'); fg.append(field('Nom', gName));
    const duty = el('select'); duty.setAttribute('aria-label', 'Disponibilité du gardien');
    for (const [v, t] of [['schedule', 'Selon ses horaires (lun–ven 8 h–12 h, 14 h–18 h)'], ['on', 'Démo : forcer « en service »'], ['off', 'Démo : forcer « hors service »']]) { const o = el('option', t); o.value = v; duty.append(o); }
    duty.value = g?.onDutyOverride === true ? 'on' : g?.onDutyOverride === false ? 'off' : 'schedule';
    fg.append(field('Disponibilité', duty));
    const gCheck = check('Peut faire un constat sans risque', g?.canCheck); const gRepair = check('Peut réaliser le petit entretien prévu dans ses missions', g?.canSmallRepair); const gClose = check('Petit entretien réalisé : clôture sans le gestionnaire', g?.selfCloseSmallRepair);
    fg.append(gCheck.l, gRepair.l, gClose.l);
    const bName = textInput(c.backupGuardian?.name, 'Nom du remplaçant'); fg.append(field('Remplaçant (vide = aucun)', bName));
    const bDuty = check('Remplaçant en service maintenant (démo)', c.backupGuardian?.onDutyOverride === true); fg.append(bDuty.l);
    form.append(fg);
    // Contrats
    const fc = el('fieldset'); fc.append(el('legend', 'Prestataires sous contrat'));
    const contractRows = c.contracts.map((k) => {
      const row = el('div', undefined, 'contract');
      row.append(el('strong', `${k.provider} — ${k.trades.map((t) => TRADE_LABEL[t] || t).join(', ')}`));
      const active = check('Contrat actif', true);
      const onCall = check('Astreinte 24 h/24', k.onCall247);
      const verified = check('Préautorisation vérifiée', k.preauthorization?.verified);
      const ceiling = numberInput(k.preauthorization?.ceilingHT ?? '', `Plafond préautorisé ${k.provider}`);
      const ref = textInput(k.preauthorization?.reference, `Référence ${k.provider}`);
      const grid = el('div', undefined, 'grid2'); grid.append(field('Plafond préautorisé (€ HT)', ceiling), field('Référence (contrat, décision)', ref));
      row.append(active.l, onCall.l, verified.l, grid);
      fc.append(row);
      return { k, active, onCall, verified, ceiling, ref };
    });
    form.append(fc);
    // Président
    const p = c.councilPresident;
    const fp = el('fieldset'); fp.append(el('legend', 'Président du conseil syndical'));
    const pName = textInput(p?.name, 'Nom du président'); fp.append(field('Nom (vide = non renseigné)', pName));
    const dQuotes = check('Peut demander des devis aux entreprises', p?.delegations.requestQuotes);
    const dAdvise = check('Peut comparer les devis et donner un avis', p?.delegations.compareAndAdvise);
    const dVerify = check('Désigné pour vérifier la bonne exécution apparente', p?.delegations.confirmCompletion);
    fp.append(dQuotes.l, dAdvise.l, dVerify.l);
    const exCeil = numberInput(p?.delegations.authorizeExpenditure?.ceilingHT ?? '', 'Plafond de délégation de dépense');
    const exRef = textInput(p?.delegations.authorizeExpenditure?.verifiedReference, 'Référence de la délégation vérifiée');
    const grid = el('div', undefined, 'grid2'); grid.append(field('Délégation de dépense : plafond (€ HT)', exCeil), field('Référence vérifiée (délibération)', exRef));
    fp.append(grid, el('p', 'Sans plafond ET référence vérifiée, le président ne peut autoriser aucune dépense. Il ne passe jamais de commande.', 'small'));
    form.append(fp);
    // Astreinte
    const fclock = el('fieldset'); fclock.append(el('legend', 'Horloge de la démonstration'));
    const clock = el('select'); clock.setAttribute('aria-label', 'Avancer l’horloge de la démo');
    for (const [v, t] of [['0', 'Heure réelle'], [String(24 * 3600e3), '+1 jour'], [String(3 * 24 * 3600e3), '+3 jours'], [String(8 * 24 * 3600e3), '+8 jours']]) { const o = el('option', t); o.value = v; clock.append(o); }
    clock.value = String(Number(store.get(CLOCK_KEY, 0)) || 0);
    clock.addEventListener('change', () => { store.set(CLOCK_KEY, Number(clock.value)); render(); });
    fclock.append(field('Avancer le temps pour voir les dossiers bloqués et les relances', clock));
    form.append(fclock);
    const fe = el('fieldset'); fe.append(el('legend', 'Urgences'));
    const onCall = textInput(c.emergency.onCallContact, 'Contact d’astreinte'); fe.append(field('Contact d’astreinte du cabinet', onCall));
    form.append(fe);

    const msg = el('div'); msg.setAttribute('role', 'status');
    const save = button('Enregistrer la fiche', async () => {
      const next = structuredClone(config);
      next.guardian = gName.value.trim() ? { ...(next.guardian || { schedule: demoConfig.guardian.schedule, smallRepairTypes: [] }), name: gName.value.trim(), canCheck: gCheck.i.checked, canSmallRepair: gRepair.i.checked, selfCloseSmallRepair: gClose.i.checked } : null;
      if (next.guardian) { delete next.guardian.onDutyOverride; if (duty.value !== 'schedule') next.guardian.onDutyOverride = duty.value === 'on'; }
      next.backupGuardian = bName.value.trim() ? { name: bName.value.trim(), schedule: [], onDutyOverride: bDuty.i.checked, canCheck: true, canSmallRepair: false, smallRepairTypes: [], selfCloseSmallRepair: false } : null;
      next.contracts = contractRows.filter((r) => r.active.i.checked).map((r) => ({ ...r.k, onCall247: r.onCall.i.checked, preauthorization: r.ceiling.value === '' ? null : { ceilingHT: Number(r.ceiling.value), verified: r.verified.i.checked, reference: r.ref.value.trim() } }));
      next.councilPresident = pName.value.trim() ? { name: pName.value.trim(), delegations: { requestQuotes: dQuotes.i.checked, compareAndAdvise: dAdvise.i.checked, confirmCompletion: dVerify.i.checked, authorizeExpenditure: exCeil.value || exRef.value.trim() ? { ceilingHT: Number(exCeil.value), verifiedReference: exRef.value.trim() } : null } } : null;
      next.emergency = { ...next.emergency, onCallContact: onCall.value.trim() };
      msg.replaceChildren();
      try {
        const r = await api('/api/procedures/validate-config', { config: next });
        config = r.config; store.set(CONFIG_KEY, config);
        await loadPerms();
        msg.append(el('p', 'Fiche enregistrée. Les prochains signalements suivront ces règles.', 'msg-ok'));
        if (r.warnings.length) { const ul = el('ul'); for (const w of r.warnings) ul.append(el('li', w)); msg.append(el('p', 'Informations manquantes (aucun engagement automatique sur ces points) :', 'small'), ul); }
        render();
      } catch (err) {
        const box = el('div', undefined, 'alert'); box.append(el('p', 'Fiche refusée : ' + err.message));
        const ul = el('ul'); for (const e of err.details || []) ul.append(el('li', e)); box.append(ul); msg.append(box);
      }
    });
    const reset = button('Revenir à la fiche de démonstration', async () => { config = structuredClone(demoConfig); store.set(CONFIG_KEY, config); await loadPerms(); renderBuilding(); render(); }, 'secondary');
    actions(form, save, reset);
    form.append(msg);
  }

  // ---------- Démarrage ----------
  byId('reset').addEventListener('click', () => { if (confirm('Effacer uniquement les dossiers fictifs de cette démonstration ?')) { cases = []; persist(); render(); } });

  async function init() {
    const select = byId('issue-type');
    try {
      [catalog, demoConfig] = await Promise.all([api('/api/procedures/catalog'), api('/api/procedures/demo-config')]);
    } catch (err) {
      byId('report-error').textContent = 'Le moteur de parcours est indisponible : ' + err.message;
      byId('report-error').classList.remove('hidden');
      return;
    }
    const saved = store.get(CONFIG_KEY, null);
    config = saved && typeof saved === 'object' ? saved : structuredClone(demoConfig);
    const known = new Set(catalog.types.map((t) => t.id));
    const placed = new Set();
    for (const [label, ids] of GROUPS) {
      const og = el('optgroup'); og.label = label;
      for (const id of ids) { const t = catalog.types.find((x) => x.id === id); if (!t) continue; const o = el('option', t.label); o.value = t.id; og.append(o); placed.add(id); }
      select.append(og);
    }
    const other = el('optgroup'); other.label = 'Autre';
    for (const t of catalog.types) if (!placed.has(t.id) && known.has(t.id)) { const o = el('option', t.label); o.value = t.id; other.append(o); }
    select.append(other);
    select.value = 'eclairage_commun';
    await loadPerms();
    // Conserver l'onglet choisi pendant le chargement (réseau lent).
    role(current);
    render();
    document.body.dataset.ready = 'true';
  }
  role('resident');
  init();
})();
