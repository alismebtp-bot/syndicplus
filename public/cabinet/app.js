/* Cockpit du responsable de cabinet — SyndicPlus.
 * Toutes les données viennent de /api/cockpit/* (filtrées par cabinet et périmètre côté serveur).
 * Toute donnée affichée passe par esc(). Les actions n'existent que si le serveur les exécute réellement.
 */
(function () {
  'use strict';
  var root = document.getElementById('root');
  var dlg = document.getElementById('dlg');
  var me = null;

  // ---------- Utilitaires ----------
  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var dtf = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  var df = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
  function when(ms) { return ms ? dtf.format(new Date(ms)) : '—'; }
  function day(s) { return s ? df.format(new Date(s + 'T12:00:00Z')) : '—'; }
  function ago(ms) {
    if (!ms) return '—';
    var h = Math.round((Date.now() - ms) / 3600000);
    if (h < 1) return 'à l’instant';
    if (h < 48) return 'il y a ' + h + ' h';
    return 'il y a ' + Math.round(h / 24) + ' j';
  }
  function euros(n) { return n === null || n === undefined ? 'non renseigné' : new Intl.NumberFormat('fr-FR').format(n) + ' € HT'; }
  function plural(n, s, p) { return n + ' ' + (n > 1 ? (p || s + 's') : s); }
  function toast(msg, err) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast' + (err ? ' err' : '');
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 6000);
  }
  function api(path, opts) {
    opts = opts || {};
    var init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; });
    });
  }
  function flagTag(f) {
    var red = { urgent: 1, late: 1, owner_absent: 1, unassigned: 1 };
    var cls = red[f.code] ? 'red' : f.code === 'priority' ? '' : 'orange';
    return '<span class="tag ' + cls + '" title="' + esc(f.detail) + '">' + esc(f.label) + '</span>';
  }

  // ---------- Routage ----------
  var PAGES = [
    { id: 'vue', label: 'Vue globale', icon: '◎' },
    { id: 'portefeuille', label: 'Portefeuille', icon: '▦' },
    { id: 'equipe', label: 'Équipe', icon: '◉' },
    { id: 'incidents', label: 'Incidents', icon: '!' },
    { id: 'finances', label: 'Finances & contrats', icon: '€' },
    { id: 'prestataires', label: 'Prestataires', icon: '⚙' },
    { id: 'qualite', label: 'Qualité', icon: '★' },
    { id: 'assistant', label: 'Assistant', icon: '?' },
    { id: 'journal', label: 'Journal & décisions', icon: '≡' },
  ];
  var BOTTOM = ['vue', 'incidents', 'equipe', 'assistant'];
  function route() {
    var h = (location.hash || '#/vue').slice(2);
    var q = '';
    var i = h.indexOf('?');
    if (i >= 0) { q = h.slice(i + 1); h = h.slice(0, i); }
    var parts = h.split('/').filter(Boolean);
    var params = {};
    q.split('&').forEach(function (kv) { if (kv) { var p = kv.split('='); params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); } });
    return { page: parts[0] || 'vue', id: parts[1] ? decodeURIComponent(parts[1]) : null, params: params };
  }
  function go(hash) { root.setAttribute('data-ready', '0'); if (location.hash === hash) render(); else location.hash = hash; }
  // Liens internes : l'état « prêt » est remis à zéro dès le clic (le changement d'ancre est asynchrone)
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#/"]') : null;
    if (!a || !me || e.defaultPrevented) return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });

  // ---------- Coquille ----------
  function shell(r, title, inner) {
    var nav = PAGES.map(function (p) {
      return '<a href="#/' + p.id + '" class="' + (r.page === p.id ? 'on' : '') + '"' + (r.page === p.id ? ' aria-current="page"' : '') + '><span aria-hidden="true">' + p.icon + '</span>' + esc(p.label) + '</a>';
    }).join('');
    var bottom = BOTTOM.map(function (id) {
      var p = PAGES.filter(function (x) { return x.id === id; })[0];
      return '<a href="#/' + id + '" class="' + (r.page === id ? 'on' : '') + '"><i aria-hidden="true">' + p.icon + '</i>' + esc(id === 'vue' ? 'Accueil' : p.label) + '</a>';
    }).join('') + '<button type="button" id="more" aria-expanded="false" aria-controls="sheet"><i aria-hidden="true">⋯</i>Plus</button>';
    var sheet = PAGES.filter(function (p) { return BOTTOM.indexOf(p.id) < 0; }).map(function (p) {
      return '<a href="#/' + p.id + '">' + esc(p.label) + '</a>';
    }).join('') + '<a href="/api/cockpit/report.csv" download>Exporter le rapport (CSV)</a>';
    return '<div class="app">' +
      '<aside class="side" aria-label="Navigation du cockpit"><div class="brand">SyndicPlus<small>Cockpit du cabinet</small></div><nav class="nav">' + nav + '</nav>' +
      '<div class="foot">' + esc(me.user.cabinetName) + '<br>' + (me.user.scopeAll ? 'Toutes les copropriétés du cabinet' : 'Périmètre : ' + plural(me.user.copros, 'copropriété')) + '</div></aside>' +
      '<div class="main"><header class="top"><h1>' + esc(title) + '</h1><div class="who">' +
      '<a class="btn small hide-m" href="/api/cockpit/report.csv" download>Exporter (CSV)</a>' +
      '<span class="tag grey hide-m">' + esc(me.user.name) + '</span>' +
      '<button class="btn small" type="button" id="switch" aria-label="Changer de persona (' + esc(me.user.name) + ')"><span class="hide-m">Changer de persona</span><span class="only-m">' + esc(me.user.name.split(' ')[0]) + ' ⇄</span></button></div></header>' +
      '<main class="content" id="page"><div class="banner">Démonstration : cabinet, personnes et dossiers <strong>fictifs</strong>. Aucune notification externe n’est envoyée.</div>' + inner + '</main></div>' +
      '<nav class="bottom" aria-label="Navigation principale">' + bottom + '</nav><div class="sheet" id="sheet">' + sheet + '</div></div>';
  }
  function bindShell() {
    var sw = document.getElementById('switch');
    if (sw) sw.onclick = logout;
    var more = document.getElementById('more');
    if (more) more.onclick = function () {
      var s = document.getElementById('sheet');
      var open = s.classList.toggle('open');
      more.setAttribute('aria-expanded', String(open));
    };
  }
  function logout() {
    api('/api/demo/logout', { method: 'POST', body: {} }).then(function () { me = null; location.hash = '#/vue'; start(); });
  }
  function loading(r, title) {
    root.innerHTML = shell(r, title, '<div class="list" aria-busy="true"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>');
    bindShell();
  }
  function failed(r, title, res, retry) {
    var msg = res && res.body && res.body.error ? res.body.error : 'Le serveur n’a pas répondu.';
    if (res && res.status === 401) { me = null; start(); return; }
    var body = res && res.status === 403
      ? '<div class="state card"><h2>Accès refusé</h2><p>' + esc(msg) + '</p></div>'
      : res && res.status === 404
        ? '<div class="state card"><h2>Introuvable</h2><p>' + esc(msg) + '</p><a class="btn" href="#/vue">Retour à la vue globale</a></div>'
        : '<div class="state card"><h2>Données indisponibles</h2><p>' + esc(msg) + '</p><button class="btn primary" type="button" id="retry">Réessayer</button></div>';
    root.innerHTML = shell(r, title, body);
    bindShell();
    root.setAttribute('data-ready', '1');
    var b = document.getElementById('retry');
    if (b) b.onclick = retry;
  }
  function empty(text) { return '<div class="state card"><p>' + esc(text) + '</p></div>'; }

  var seq = 0;
  function page(r, title, path, draw) {
    var my = ++seq;
    loading(r, title);
    return api(path).then(function (res) {
      if (my !== seq) return;
      if (res.status !== 200) return failed(r, title, res, function () { page(r, title, path, draw); });
      root.innerHTML = shell(r, title, draw(res.body));
      bindShell();
      if (draw.after) draw.after(res.body);
      bindActions();
      root.setAttribute('data-ready', '1');
    }, function () {
      if (my === seq) failed(r, title, null, function () { page(r, title, path, draw); });
    });
  }

  // ---------- A. Vue globale ----------
  function attentionItem(a) {
    return '<article class="item ' + (a.severity === 'high' ? 'high' : '') + '" data-attention="' + esc(a.id) + '">' +
      '<div class="row"><h3>' + esc(a.title) + '</h3>' + (a.severity === 'high' ? '<span class="tag red">Prioritaire</span>' : '') + '</div>' +
      '<div>' + esc(a.justification) + '</div>' +
      (a.dossiers.length ? '<div class="row">' + a.dossiers.map(function (d) { return '<a href="#/incidents/' + esc(d) + '">' + esc(d) + '</a>'; }).join(' ') + '</div>' : '') +
      '<div class="meta"><span>Responsable : <strong>' + esc(a.responsible) + '</strong></span><span>Dernière mise à jour : ' + esc(a.lastUpdate ? ago(a.lastUpdate) : 'non renseignée') + '</span><span>Sources : ' + esc(a.sources.join(' · ')) + '</span></div>' +
      '<div class="row">' + actionButton(a.action) + '</div></article>';
  }
  function actionButton(a) {
    if (!a) return '';
    return '<button type="button" class="btn small primary" data-do="' + esc(a.kind) + '" data-target="' + esc(a.target) + '">' + esc(a.label) + '</button>';
  }
  function drawOverview(d) {
    var kpis = d.kpis.map(function (k) {
      var alert = k.value > 0 && ['urgent', 'late', 'unassigned', 'uncovered'].indexOf(k.id) >= 0;
      return '<button type="button" class="kpi' + (alert ? ' alert' : '') + '" data-kpi="' + esc(k.id) + '" data-go="#/' + esc(k.page) + '?f=' + esc(k.filter) + '"><b>' + esc(k.value) + '</b><span>' + esc(k.label) + '</span><small>' + esc(k.hint) + '</small></button>';
    }).join('');
    return '<p class="muted">' + esc(d.cabinetName) + ' · ' + plural(d.coproCount, 'copropriété') + ' dans votre périmètre · calculé le ' + esc(when(d.generatedAt)) + '</p>' +
      '<section aria-label="Indicateurs"><div class="grid kpis">' + kpis + '</div></section>' +
      '<section><h2>Nécessite votre attention (' + d.attention.length + ')</h2>' +
      (d.attention.length ? '<div class="list">' + d.attention.map(attentionItem).join('') + '</div>' : empty('Rien ne demande votre attention dans votre périmètre.')) + '</section>';
  }

  // ---------- B. Portefeuille ----------
  var pf = { q: '', signal: 'all', sort: 'name' };
  function drawPortfolio(d) {
    var rows = d.copros.filter(function (c) {
      if (pf.q && (c.name + ' ' + c.address + ' ' + (c.managerName || '')).toLowerCase().indexOf(pf.q.toLowerCase()) < 0) return false;
      if (pf.signal === 'signals' && !c.attentionSignals && !c.openReserves && !c.recurring && !c.contractsToReview) return false;
      if (pf.signal === 'urgent' && !c.urgent) return false;
      return true;
    });
    rows.sort(function (a, b) {
      if (pf.sort === 'open') return b.open - a.open || a.name.localeCompare(b.name);
      if (pf.sort === 'signals') return b.attentionSignals - a.attentionSignals || a.name.localeCompare(b.name);
      if (pf.sort === 'last') return (b.lastIncidentAt || 0) - (a.lastIncidentAt || 0);
      return a.name.localeCompare(b.name);
    });
    var cards = rows.map(function (c) {
      return '<a class="card" style="text-decoration:none;color:inherit;display:grid;gap:6px" href="#/portefeuille/' + esc(c.id) + '" data-copro="' + esc(c.id) + '">' +
        '<h3>' + esc(c.name) + '</h3><div class="muted">' + esc(c.address) + '</div>' +
        '<div class="stats"><span>' + (c.lots === null ? 'Lots : non renseigné' : esc(c.lots) + ' lots') + '</span><span>Gestionnaire : ' + esc(c.managerName || 'non renseigné') + (c.managerAbsent ? ' (absent)' : '') + '</span></div>' +
        '<div class="row"><span class="tag grey">' + plural(c.open, 'dossier ouvert', 'dossiers ouverts') + '</span>' +
        (c.urgent ? '<span class="tag red">' + plural(c.urgent, 'urgence') + '</span>' : '') +
        (c.late ? '<span class="tag red">' + c.late + ' en retard</span>' : '') +
        (c.unassigned ? '<span class="tag red">' + c.unassigned + ' non affecté(s)</span>' : '') +
        (c.openReserves ? '<span class="tag orange">Réserves</span>' : '') +
        (c.recurring ? '<span class="tag orange">Panne récurrente</span>' : '') +
        (c.contractsToReview ? '<span class="tag orange">' + plural(c.contractsToReview, 'contrat') + ' à revoir</span>' : '') + '</div></a>';
    }).join('');
    return '<div class="filters" role="search"><input id="pf-q" type="search" placeholder="Rechercher une copropriété, une adresse, un gestionnaire" aria-label="Rechercher" value="' + esc(pf.q) + '" style="flex:1 1 260px">' +
      '<select id="pf-signal" aria-label="Filtrer"><option value="all">Toutes</option><option value="signals">Avec signaux</option><option value="urgent">Avec urgence</option></select>' +
      '<select id="pf-sort" aria-label="Trier"><option value="name">Tri : nom</option><option value="open">Tri : dossiers ouverts</option><option value="signals">Tri : signaux</option><option value="last">Tri : dernier incident</option></select></div>' +
      '<p class="muted">' + plural(rows.length, 'copropriété') + ' — les signaux sont comptés, pas pondérés : ce n’est pas un classement.</p>' +
      (rows.length ? '<div class="grid cards">' + cards + '</div>' : empty('Aucune copropriété ne correspond à ces critères.'));
  }
  drawPortfolio.after = function (d) {
    var q = document.getElementById('pf-q'), s = document.getElementById('pf-signal'), o = document.getElementById('pf-sort');
    s.value = pf.signal; o.value = pf.sort;
    function redraw() { document.getElementById('page').innerHTML = document.querySelector('.banner').outerHTML + drawPortfolio(d); drawPortfolio.after(d); }
    q.oninput = function () { pf.q = q.value; var pos = q.selectionStart; redraw(); var n = document.getElementById('pf-q'); n.focus(); n.setSelectionRange(pos, pos); };
    s.onchange = function () { pf.signal = s.value; redraw(); };
    o.onchange = function () { pf.sort = o.value; redraw(); };
  };
  function drawCopro(c) {
    var dossiers = c.dossiers.filter(function (x) { return x.open; });
    return '<p><a href="#/portefeuille">← Portefeuille</a></p><div class="two"><section class="card"><h2 style="margin-top:0">' + esc(c.name) + '</h2><p class="muted">' + esc(c.address) + '</p>' +
      '<table><tbody><tr><th>Lots</th><td>' + (c.lots === null ? 'Non renseigné' : esc(c.lots)) + '</td></tr><tr><th>Gestionnaire</th><td>' + esc(c.managerName || 'Non renseigné') + (c.managerAbsent ? ' <span class="tag red">absent</span>' : '') + '</td></tr>' +
      '<tr><th>Gardien</th><td>' + esc(c.guardianName || 'Aucun') + '</td></tr><tr><th>Président du CS</th><td>' + esc(c.presidentName || 'Non renseigné') + '</td></tr>' +
      '<tr><th>Budget d’entretien</th><td>' + esc(euros(c.budgetHt)) + '</td></tr><tr><th>Payé sur 12 mois</th><td>' + esc(euros(c.paidLast12Ht)) + ' <span class="muted">(pièces enregistrées dans SyndicPlus uniquement)</span></td></tr></tbody></table>' +
      '<div class="row" style="margin-top:12px"><button class="btn small" type="button" data-do="schedule_review" data-target="copro:' + esc(c.id) + '">Programmer une revue</button></div></section>' +
      '<section class="card"><h3>Contrats</h3>' + (c.contracts.length ? c.contracts.map(contractLine).join('') : '<p class="muted">Aucun contrat enregistré.</p>') + '</section></div>' +
      '<h2>Dossiers ouverts (' + dossiers.length + ')</h2>' + (dossiers.length ? '<div class="list">' + dossiers.map(dossierRow).join('') + '</div>' : empty('Aucun dossier ouvert.')) +
      '<h2>Dépenses</h2>' + (c.finance.length ? '<div class="list">' + c.finance.map(chainCard).join('') + '</div>' : empty('Aucune pièce financière enregistrée.')) +
      (c.reviews.length ? '<h2>Revues programmées</h2><ul>' + c.reviews.map(function (v) { return '<li>' + esc(day(v.dueOn)) + ' — ' + esc(v.note || 'sans note') + '</li>'; }).join('') + '</ul>' : '');
  }

  // ---------- C. Équipe ----------
  function drawTeam(d) {
    var cards = d.managers.map(function (m) {
      var abs = m.absence || m.upcomingAbsence;
      var absLine = abs
        ? '<div class="' + (m.absence && !m.absence.replacementId ? 'confirm' : 'muted') + '">' + (abs.current ? 'Absent(e)' : 'Absence prévue') + ' du ' + esc(day(abs.startsOn)) + ' au ' + esc(day(abs.endsOn)) + ' — ' + (abs.replacementName ? 'remplacé(e) par <strong>' + esc(abs.replacementName) + '</strong>' : '<strong>sans remplaçant</strong>') + '</div>' +
          '<div class="row"><button class="btn small primary" type="button" data-do="set_replacement" data-target="' + esc(m.id) + '">' + (abs.replacementName ? 'Changer le remplaçant' : 'Désigner un remplaçant') + '</button></div>'
        : '<div class="muted">Aucune absence enregistrée</div>';
      return '<article class="card" data-manager="' + esc(m.id) + '"><h3>' + esc(m.name) + '</h3><div class="muted">' + esc(m.copros.join(', ') || 'Aucune copropriété attitrée') + '</div>' +
        '<div class="stats" style="margin:8px 0"><span>' + plural(m.open, 'dossier ouvert', 'dossiers ouverts') + '</span><span>' + plural(m.urgent, 'urgence') + '</span><span>' + m.late + ' en retard</span><span>' + m.noNextAction + ' sans prochaine action</span>' +
        (m.oldestOpenDays !== null ? '<span>Plus ancien : ' + m.oldestOpenDays + ' j</span>' : '') + (m.covering.length ? '<span>Remplace sur : ' + esc(m.covering.join(', ')) + '</span>' : '') + '</div>' + absLine +
        (m.dossiers.length ? '<details style="margin-top:8px"><summary>Voir les dossiers</summary><ul>' + m.dossiers.map(function (x) { return '<li><a href="#/incidents/' + esc(x.ref) + '">' + esc(x.ref) + '</a> — ' + esc(x.typeLabel) + ', ' + esc(x.coproName) + (x.flags.length ? ' <span class="muted">(' + esc(x.flags.join(', ')) + ')</span>' : '') + '</li>'; }).join('') + '</ul></details>' : '') + '</article>';
    }).join('');
    return '<p class="muted">' + esc(d.note) + (d.scopeNote ? ' ' + esc(d.scopeNote) : '') + '</p>' + (d.managers.length ? '<div class="grid cards">' + cards + '</div>' : empty('Aucun gestionnaire enregistré.'));
  }

  // ---------- D. Incidents ----------
  var FLAGS = [['urgent', 'Urgent'], ['late', 'En retard'], ['no_next_action', 'Sans prochaine action'], ['unassigned', 'Non affecté'], ['owner_absent', 'Responsable absent'], ['failed_intervention', 'Intervention échouée'], ['open_reserves', 'Réserves non levées'], ['recurring', 'Récurrent'], ['stale', 'Sans mise à jour'], ['contested', 'Contesté'], ['priority', 'Prioritaire']];
  var inc = { q: '', copro: '', sort: 'due' };
  function dossierRow(v) {
    return '<a class="item" style="text-decoration:none;color:inherit" href="#/incidents/' + esc(v.ref) + '" data-dossier="' + esc(v.ref) + '">' +
      '<div class="row"><strong>' + esc(v.ref) + '</strong><span>' + esc(v.typeLabel) + '</span><span class="tag grey">' + esc(v.pathway || '—') + '</span><span class="tag ' + (v.open ? '' : 'green') + '">' + esc(v.status) + '</span></div>' +
      '<div class="muted">' + esc(v.coproName) + ' · ' + esc(v.place) + '</div>' +
      '<div class="row">' + v.flags.map(flagTag).join('') + '</div>' +
      '<div class="meta"><span>Suivi : ' + esc(v.owner.name) + '</span><span>Prochaine action : ' + esc(v.nextAction || 'aucune') + (v.nextActionDue ? ' (' + esc(when(v.nextActionDue)) + ')' : '') + '</span><span>Mis à jour ' + esc(ago(v.updatedAt)) + '</span></div></a>';
  }
  function drawIncidents(d, r) {
    var f = r.params.f || 'open';
    var copros = {};
    d.dossiers.forEach(function (v) { copros[v.coproId] = v.coproName; });
    var rows = d.dossiers.filter(function (v) {
      if (f === 'open' && !v.open) return false;
      if (f === 'closed' && v.open) return false;
      if (f !== 'open' && f !== 'closed' && f !== 'all' && !v.flags.some(function (x) { return x.code === f; })) return false;
      if (inc.copro && v.coproId !== inc.copro) return false;
      if (inc.q && (v.ref + ' ' + v.typeLabel + ' ' + v.place + ' ' + v.description + ' ' + v.coproName + ' ' + v.owner.name).toLowerCase().indexOf(inc.q.toLowerCase()) < 0) return false;
      return true;
    });
    rows.sort(function (a, b) {
      if (inc.sort === 'updated') return a.updatedAt - b.updatedAt;
      if (inc.sort === 'created') return b.createdAt - a.createdAt;
      return (a.nextActionDue || Infinity) - (b.nextActionDue || Infinity);
    });
    var chips = [['open', 'Ouverts'], ['all', 'Tous'], ['closed', 'Clôturés']].concat(FLAGS).map(function (c) {
      var n = c[0] === 'all' ? d.dossiers.length : c[0] === 'open' ? d.dossiers.filter(function (v) { return v.open; }).length : c[0] === 'closed' ? d.dossiers.filter(function (v) { return !v.open; }).length : d.dossiers.filter(function (v) { return v.flags.some(function (x) { return x.code === c[0]; }); }).length;
      return '<a class="chip' + (f === c[0] ? ' on' : '') + '" href="#/incidents?f=' + c[0] + '"' + (f === c[0] ? ' aria-current="true"' : '') + '>' + esc(c[1]) + ' (' + n + ')</a>';
    }).join('');
    return '<div class="filters" aria-label="Signaux">' + chips + '</div><div class="filters" role="search"><input id="inc-q" type="search" placeholder="Rechercher (référence, type, lieu, gestionnaire)" aria-label="Rechercher" value="' + esc(inc.q) + '" style="flex:1 1 240px">' +
      '<select id="inc-copro" aria-label="Copropriété"><option value="">Toutes les copropriétés</option>' + Object.keys(copros).map(function (k) { return '<option value="' + esc(k) + '">' + esc(copros[k]) + '</option>'; }).join('') + '</select>' +
      '<select id="inc-sort" aria-label="Trier"><option value="due">Tri : échéance</option><option value="updated">Tri : mise à jour la plus ancienne</option><option value="created">Tri : plus récents</option></select></div>' +
      '<p class="muted" id="inc-count">' + plural(rows.length, 'dossier') + '</p>' + (rows.length ? '<div class="list">' + rows.map(dossierRow).join('') + '</div>' : empty('Aucun dossier ne correspond à ce filtre.'));
  }
  function drawDossier(d) {
    var v = d.dossier;
    var actions = v.open
      ? '<div class="row"><button class="btn small primary" type="button" data-do="request_update" data-target="' + esc(v.ref) + '">Demander un point</button>' +
        '<button class="btn small" type="button" data-do="reassign" data-target="' + esc(v.ref) + '">Réaffecter</button>' +
        '<button class="btn small" type="button" data-do="flag_priority" data-target="' + esc(v.ref) + '" data-flagged="' + (v.flagged ? '1' : '0') + '">' + (v.flagged ? 'Retirer la priorité' : 'Signaler prioritaire') + '</button>' +
        '<button class="btn small" type="button" data-do="request_verification" data-target="' + esc(v.ref) + '">Demander une vérification</button>' +
        '<button class="btn small" type="button" data-do="schedule_review" data-target="' + esc(v.ref) + '">Programmer une revue</button>' +
        '<button class="btn small" type="button" data-do="prepare_decision" data-target="' + esc(v.ref) + '">Préparer une décision</button></div>'
      : '<div class="row"><button class="btn small" type="button" data-do="request_verification" data-target="' + esc(v.ref) + '">Demander une vérification</button></div>';
    return '<p><a href="#/incidents">← Centre incidents</a></p><div class="two"><section class="card"><div class="row"><h2 style="margin:0">' + esc(v.ref) + ' — ' + esc(v.typeLabel) + '</h2><span class="tag">' + esc(v.status) + '</span></div>' +
      '<p>' + esc(v.description) + '</p><table><tbody>' +
      '<tr><th>Copropriété</th><td><a href="#/portefeuille/' + esc(v.coproId) + '">' + esc(v.coproName) + '</a> · ' + esc(v.place) + '</td></tr>' +
      '<tr><th>Parcours</th><td>' + esc(v.pathway ? v.pathway + ' — ' + v.pathwayLabel : 'Non déterminé') + '</td></tr>' +
      '<tr><th>Suivi</th><td>' + esc(v.owner.name) + (v.owner.note ? '<br><span class="muted">' + esc(v.owner.note) + '</span>' : '') + '</td></tr>' +
      '<tr><th>Prestataire</th><td>' + esc(v.providerName || '—') + '</td></tr>' +
      '<tr><th>Prochaine action</th><td>' + esc(v.nextAction || 'Aucune') + (v.nextActionDue ? '<br><span class="muted">Échéance : ' + esc(when(v.nextActionDue)) + '</span>' : '') + '</td></tr>' +
      '<tr><th>Signalé le</th><td>' + esc(when(v.createdAt)) + '</td></tr><tr><th>Mis à jour</th><td>' + esc(when(v.updatedAt)) + '</td></tr></tbody></table>' +
      '<div class="row" style="margin:10px 0">' + v.flags.map(flagTag).join('') + '</div>' + actions +
      '<p class="muted" style="font-size:13px">Les actions de supervision sont enregistrées dans l’historique interne et le journal ; les personnes concernées reçoivent une notification dans SyndicPlus (aucun e-mail ni SMS).</p></section>' +
      '<section class="card"><h3>Historique</h3><ul class="hist">' + d.history.map(function (h) { return '<li class="' + (h.internal ? 'internal' : '') + '"><div>' + esc(h.text) + '</div><div class="muted" style="font-size:12.5px">' + esc(when(h.at)) + (h.actor ? ' · ' + esc(h.actor) : '') + (h.internal ? ' · interne' : '') + '</div></li>'; }).join('') + '</ul></section></div>' +
      (d.interventions.length ? '<h2>Interventions</h2><table class="resp"><thead><tr><th>Prestataire</th><th>Demandée</th><th>Réponse</th><th>Rendez-vous</th><th>Résultat</th></tr></thead><tbody>' + d.interventions.map(function (i) {
        var st = { requested: 'Demandée', scheduled: 'Planifiée', in_progress: 'En cours', done: 'Réalisée', failed: 'Sans résolution' }[i.status] || i.status;
        return '<tr><td>' + esc(i.providerName) + '</td><td>' + esc(when(i.requestedAt)) + '</td><td>' + esc(i.respondedAt ? when(i.respondedAt) : 'Aucune réponse enregistrée') + '</td><td>' + esc(i.scheduledAt ? when(i.scheduledAt) : '—') + '</td><td>' + esc(st) + (i.rework ? ' (reprise nécessaire)' : '') + '</td></tr>';
      }).join('') + '</tbody></table>' : '') +
      (d.reserves.length ? '<h2>Réserves</h2><ul>' + d.reserves.map(function (x) { return '<li>' + esc(x.description) + ' — ' + (x.liftedAt ? 'levée le ' + esc(when(x.liftedAt)) : '<strong>non levée</strong> (émise ' + esc(ago(x.raisedAt)) + ')') + '</li>'; }).join('') + '</ul>' : '') +
      (d.finance.length ? '<h2>Pièces financières</h2><div class="list">' + d.finance.map(chainCard).join('') + '</div>' : '') +
      (d.decisions.length ? '<h2>Décisions</h2><div class="list">' + d.decisions.map(decisionLine).join('') + '</div>' : '') +
      (d.satisfaction.length ? '<h2>Satisfaction</h2><ul>' + d.satisfaction.map(function (q) { return '<li>' + esc(q.score) + '/5' + (q.comment ? ' — « ' + esc(q.comment) + ' »' : '') + ' (' + esc(when(q.collectedAt)) + ')</li>'; }).join('') + '</ul>' : '') +
      (d.reviews.length ? '<h2>Revues programmées</h2><ul>' + d.reviews.map(function (x) { return '<li>' + esc(day(x.dueOn)) + ' — ' + esc(x.note || 'sans note') + '</li>'; }).join('') + '</ul>' : '');
  }

  // ---------- E. Finances & contrats ----------
  var STAGES = [['quote', 'Devis'], ['authorized', 'Autorisée'], ['ordered', 'Commandée'], ['invoiced', 'Facturée'], ['paid', 'Payée']];
  function chainCard(c) {
    var by = {};
    c.stages.forEach(function (s) { by[s.stage] = s; });
    return '<article class="item" id="chain-' + esc(c.chainId) + '" data-chain="' + esc(c.chainId) + '"><div class="row"><h3>' + esc(c.label) + '</h3>' + (c.dossier ? '<a href="#/incidents/' + esc(c.dossier) + '">' + esc(c.dossier) + '</a>' : '') + '</div>' +
      '<div class="muted">' + esc(c.providerName || 'Prestataire non renseigné') + (c.contractLabel ? ' · contrat : ' + esc(c.contractLabel) : '') + ' · étape actuelle : <strong>' + esc(c.currentStageLabel) + '</strong></div>' +
      '<div class="stages">' + STAGES.map(function (s) {
        var x = by[s[0]];
        return '<div class="stage' + (x ? ' done' : '') + '"><b>' + esc(s[1]) + '</b>' + (x ? esc(euros(x.amountHt)) + '<br><span title="Pièce référencée">' + esc(x.documentRef || 'pièce non référencée') + '</span>' : 'non enregistré') + '</div>';
      }).join('') + '</div>' +
      (c.alerts.length ? '<div class="confirm">' + c.alerts.map(esc).join('<br>') + '</div>' : '') + '</article>';
  }
  function decisionLine(d) {
    var st = { pending: '<span class="tag orange">En attente</span>', approved: '<span class="tag green">Prise</span>', rejected: '<span class="tag grey">Refusée</span>' }[d.status] || '';
    return '<div class="item"><div class="row"><strong>' + esc(d.label) + '</strong>' + st + (d.ref ? '<a href="#/incidents/' + esc(d.ref) + '">' + esc(d.ref) + '</a>' : '') + '</div>' +
      '<div class="meta"><span>Montant : ' + esc(d.amountHt === null ? 'non renseigné' : euros(d.amountHt)) + '</span><span>Instance habilitée : ' + esc(d.authority) + '</span><span>Préparée par ' + esc(d.preparedByName || '—') + ' le ' + esc(when(d.preparedAt)) + '</span>' + (d.decidedBy ? '<span>Décidée par ' + esc(d.decidedBy) + ' le ' + esc(when(d.decidedAt)) + '</span>' : '') + '</div></div>';
  }
  function contractLine(c) {
    var cls = c.state === 'running' ? 'green' : c.state === 'expired' ? 'red' : 'orange';
    return '<div class="item" data-contract="' + esc(c.id) + '"><div class="row"><strong>' + esc(c.label) + '</strong><span class="tag ' + cls + '">' + esc(c.state === 'running' ? 'En cours' : c.state === 'expired' ? 'Échu' : 'À revoir') + '</span></div>' +
      '<div class="meta"><span>' + esc(c.coproName) + ' · ' + esc(c.providerName) + '</span><span>Fin : ' + esc(day(c.endsOn)) + ' — ' + esc(c.stateLabel) + '</span><span>Délai de réponse contractuel : ' + esc(c.responseHours === null ? 'non précisé' : c.responseHours + ' h') + '</span><span>Montant annuel : ' + esc(euros(c.annualHt)) + '</span><span>Pièce : ' + esc(c.documentRef || 'non référencée') + ' (fichier non stocké dans ce prototype)</span></div>' +
      '<div class="row"><button class="btn small" type="button" data-do="schedule_review" data-target="contract:' + esc(c.id) + '">Programmer une revue</button></div></div>';
  }
  function drawFinance(d, r) {
    var tab = r.params.f === 'decisions' ? 'decisions' : r.params.f === 'contracts' ? 'contracts' : 'chains';
    var tabs = [['chains', 'Dépenses (' + d.chains.length + ')'], ['decisions', 'Décisions (' + d.decisions.filter(function (x) { return x.status === 'pending'; }).length + ' en attente)'], ['contracts', 'Contrats (' + d.contracts.length + ')']].map(function (t) {
      return '<a class="chip' + (tab === t[0] ? ' on' : '') + '" href="#/finances?f=' + t[0] + '">' + esc(t[1]) + '</a>';
    }).join('');
    var totals = '<div class="grid kpis five">' + d.totals.map(function (t) {
      return '<div class="card"><span class="muted" style="font-weight:600">' + esc(t.label) + '</span><b style="display:block;font-size:20px">' + (t.amountHt === null ? esc(plural(t.count, 'dépense')) : esc(euros(t.amountHt))) + '</b><small class="muted">' + esc(t.note || plural(t.count, 'dépense') + ' avec cette pièce') + '</small></div>';
    }).join('') + '</div>';
    var body = tab === 'decisions'
      ? (d.decisions.length ? '<div class="list">' + d.decisions.map(decisionLine).join('') + '</div>' : empty('Aucune décision enregistrée.'))
      : tab === 'contracts'
        ? (d.contracts.length ? '<div class="list">' + d.contracts.map(contractLine).join('') + '</div>' : empty('Aucun contrat enregistré.'))
        : (d.chains.length ? '<div class="list">' + d.chains.map(chainCard).join('') + '</div>' : empty('Aucune pièce financière enregistrée.'));
    return '<p class="muted">' + esc(d.note) + '</p>' + totals + '<div class="filters" style="margin-top:16px">' + tabs + '</div>' + body;
  }
  drawFinance.after = function () {
    var r = route();
    if (r.params.chain) { var el = document.getElementById('chain-' + r.params.chain); if (el) { el.scrollIntoView({ block: 'center' }); el.style.outline = '3px solid #9cc0ff'; } }
  };

  // ---------- F. Prestataires ----------
  function drawProviders(d) {
    return '<p class="muted">' + esc(d.note) + '</p>' + (d.providers.length ? '<div class="grid cards">' + d.providers.map(function (p) {
      return '<article class="card" data-provider="' + esc(p.id) + '"><h3>' + esc(p.name) + '</h3><div class="muted">' + esc(p.trades) + '</div>' +
        (p.sampleWarning ? '<div class="tag orange" style="margin:6px 0;white-space:normal">' + esc(p.sampleWarning) + '</div>' : '') +
        '<table><tbody><tr><th>Interventions</th><td>' + esc(p.interventions) + '</td></tr>' +
        '<tr><th>Délai de réponse médian</th><td>' + esc(p.medianResponseHours === null ? 'Aucune réponse enregistrée' : p.medianResponseHours + ' h') + (p.contractualResponseHours !== null ? ' <span class="muted">(contrat : ' + esc(p.contractualResponseHours) + ' h)</span>' : '') + '</td></tr>' +
        '<tr><th>Ponctualité</th><td>' + esc(p.onTime ? p.onTime.onTime + ' à l’heure sur ' + p.onTime.known + ' renseignées' : 'Non renseignée') + '</td></tr>' +
        '<tr><th>Sans résolution / reprises</th><td>' + esc(p.failed) + ' / ' + esc(p.rework) + '</td></tr>' +
        '<tr><th>Réserves</th><td>' + esc(p.reservesOpen) + ' non levée(s), ' + esc(p.reservesLifted) + ' levée(s)</td></tr>' +
        '<tr><th>Contrats</th><td>' + esc(p.contracts.join(', ') || 'Aucun') + '</td></tr></tbody></table>' +
        (p.observations.length ? '<h3 style="margin-top:10px">Observations à examiner</h3><ul>' + p.observations.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul>' : '<p class="muted">Aucune observation particulière.</p>') +
        '<div class="row"><button class="btn small" type="button" data-do="schedule_review" data-target="provider:' + esc(p.id) + '">Programmer une revue</button></div></article>';
    }).join('') + '</div>' : empty('Aucun prestataire enregistré.'));
  }

  // ---------- G. Qualité ----------
  function drawQuality(d) {
    return '<p class="banner" style="background:var(--blue-soft);color:#1559c9">' + esc(d.note) + '</p>' +
      '<div class="grid kpis"><div class="card"><b style="font-size:24px">' + esc(d.closed) + '</b><div class="muted">Dossiers clôturés (' + d.periodDays + ' j)</div></div>' +
      '<div class="card"><b style="font-size:24px">' + esc(d.answered) + '</b><div class="muted">Réponses de satisfaction</div></div>' +
      '<div class="card"><b style="font-size:24px">' + esc(d.responseRate === null ? '—' : d.responseRate + ' %') + '</b><div class="muted">Taux de réponse</div></div>' +
      '<div class="card"><b style="font-size:24px">' + esc(d.averageScore === null ? '—' : d.averageScore + ' / 5') + '</b><div class="muted">Note moyenne' + (d.sampleWarning ? ' — ' + esc(d.sampleWarning) : '') + '</div></div></div>' +
      '<h2>Retours défavorables</h2>' + (d.lowScores.length ? '<ul>' + d.lowScores.map(function (x) { return '<li><a href="#/incidents/' + esc(x.ref) + '">' + esc(x.ref) + '</a> — ' + esc(x.score) + '/5 — ' + esc(x.comment) + ' <button class="btn small" type="button" data-do="request_verification" data-target="' + esc(x.ref) + '">Demander une vérification</button></li>'; }).join('') + '</ul>' : empty('Aucun retour défavorable.')) +
      '<h2>Rouverts ou contestés</h2>' + ((d.reopened.length || d.contested.length) ? '<p>' + esc(Array.from(new Set(d.reopened.concat(d.contested))).join(', ')) + '</p>' : empty('Aucun.')) +
      '<h2>Clôturés sans retour du résident</h2>' + (d.closedWithoutFeedback.length ? '<p>' + d.closedWithoutFeedback.map(function (x) { return '<a href="#/incidents/' + esc(x) + '">' + esc(x) + '</a>'; }).join(', ') + '</p>' : empty('Tous les dossiers clôturés ont un retour.')) +
      '<h2>Commentaires (publiés avec consentement)</h2>' + (d.comments.length ? '<ul>' + d.comments.map(function (c) { return '<li>' + esc(c.ref) + ' — ' + esc(c.score) + '/5 — « ' + esc(c.comment) + ' »</li>'; }).join('') + '</ul>' : empty('Aucun commentaire publiable.'));
  }

  // ---------- H. Assistant ----------
  function drawAssistant(d, r) {
    var qs = d.questions;
    var current = r.params.q;
    return '<div class="banner" style="background:var(--blue-soft);color:#1559c9"><strong>Assistant à règles.</strong> ' + esc(d.engine) + ' Chaque réponse cite ses sources et son niveau de confiance ; aucune action n’est exécutée sans votre clic.</div>' +
      '<div class="filters">' + qs.map(function (q) { return '<a class="chip' + (current === q.id ? ' on' : '') + '" style="min-height:44px" href="#/assistant?q=' + esc(q.id) + '" data-q="' + esc(q.id) + '">' + esc(q.label) + '</a>'; }).join('') + '</div>' +
      '<div id="answer">' + (current ? '<div class="skeleton"></div>' : empty('Choisissez une question.')) + '</div>';
  }
  drawAssistant.after = function () {
    var r = route();
    if (!r.params.q) return;
    var my = seq;
    api('/api/cockpit/assistant?q=' + encodeURIComponent(r.params.q)).then(function (res) {
      if (my !== seq) return;
      var box = document.getElementById('answer');
      if (!box) return;
      if (res.status !== 200) { box.innerHTML = empty(res.body.error || 'Réponse indisponible.'); return; }
      var a = res.body;
      box.innerHTML = '<article class="card" data-answer="1"><h2 style="margin-top:0">' + esc(a.question) + '</h2>' +
        '<p><strong>Synthèse :</strong> ' + esc(a.summary) + '</p>' +
        '<h3>Faits</h3>' + (a.facts.length ? '<ul>' + a.facts.map(function (f) { return '<li>' + esc(f.text) + '<br><span class="muted" style="font-size:13px">Source : ' + esc(f.source) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">Aucun fait à signaler.</p>') +
        '<p><strong>Confiance :</strong> ' + esc(a.confidence.level) + ' — ' + esc(a.confidence.reason) + '</p>' +
        (a.recommendations.length ? '<h3>Recommandations</h3><ul>' + a.recommendations.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
        (a.nextAction ? '<h3>Prochaine action proposée</h3><div class="row">' + (a.nextAction.kind === 'open_page' ? '<a class="btn small primary" href="#/' + esc(a.nextAction.target) + '">' + esc(a.nextAction.label) + '</a>' : actionButton(a.nextAction)) + '</div>' : '') +
        '<p class="muted" style="font-size:12.5px">' + esc(a.engine) + '</p></article>';
      bindActions();
    });
  };

  // ---------- Journal ----------
  var ACTION_LABELS = { request_update: 'Point demandé', request_verification: 'Vérification demandée', flag_priority: 'Signalé prioritaire', unflag_priority: 'Priorité retirée', reassign: 'Réaffectation', set_replacement: 'Remplaçant désigné', schedule_review: 'Revue programmée', prepare_decision: 'Décision préparée', export_report: 'Rapport exporté' };
  function drawJournal(d) {
    return '<h2 style="margin-top:0">Actions de supervision</h2>' + (d.entries.length ? '<table class="resp"><thead><tr><th>Date</th><th>Auteur</th><th>Action</th><th>Objet</th><th>Détail</th></tr></thead><tbody>' + d.entries.map(function (e) {
      return '<tr><td>' + esc(when(e.at)) + '</td><td>' + esc(e.actor) + '</td><td>' + esc(ACTION_LABELS[e.action] || e.action) + '</td><td>' + (e.entity === 'dossier' ? '<a href="#/incidents/' + esc(e.entityId) + '">' + esc(e.entityId) + '</a>' : esc(e.entityId || '—')) + '</td><td>' + esc(e.detail) + '</td></tr>';
    }).join('') + '</tbody></table>' : empty('Aucune action enregistrée pour le moment.')) +
      '<h2>Historique des décisions</h2>' + (d.decisions.length ? '<div class="list">' + d.decisions.map(decisionLine).join('') + '</div>' : empty('Aucune décision.')) +
      '<h2>Revues programmées</h2>' + (d.reviews.length ? '<ul>' + d.reviews.map(function (v) { return '<li>' + esc(day(v.dueOn)) + ' — ' + esc(v.entity) + ' ' + esc(v.entityId) + (v.note ? ' — ' + esc(v.note) : '') + '</li>'; }).join('') + '</ul>' : empty('Aucune revue programmée.')) +
      '<p class="muted" style="margin-top:24px">Le journal est en ajout seul : une action enregistrée ne peut être ni modifiée ni supprimée.</p>' +
      '<p><button class="btn small" type="button" id="reset">Régénérer les données de démonstration</button></p>';
  }
  drawJournal.after = function () {
    var b = document.getElementById('reset');
    if (b) b.onclick = function () {
      if (!window.confirm('Régénérer les données fictives ? Les actions de démonstration seront effacées.')) return;
      b.disabled = true;
      api('/api/demo/reset', { method: 'POST', body: {} }).then(function (res) { toast(res.body.message || res.body.error, res.status !== 200); render(); });
    };
  };

  // ---------- Actions (dialogues) ----------
  var cache = { managers: null };
  function managers() {
    if (cache.managers) return Promise.resolve(cache.managers);
    return api('/api/cockpit/team').then(function (res) { cache.managers = res.status === 200 ? res.body.candidates : []; return cache.managers; });
  }
  function bindActions() {
    Array.prototype.forEach.call(root.querySelectorAll('[data-go]'), function (b) { b.onclick = function () { go(b.getAttribute('data-go')); }; });
    Array.prototype.forEach.call(root.querySelectorAll('[data-do]'), function (b) {
      b.onclick = function (e) { e.preventDefault(); openAction(b.getAttribute('data-do'), b.getAttribute('data-target'), b); };
    });
    var q = document.getElementById('inc-q');
    if (q) {
      var c = document.getElementById('inc-copro'), s = document.getElementById('inc-sort');
      c.value = inc.copro; s.value = inc.sort;
      q.oninput = function () { inc.q = q.value; rerenderIncidents(); };
      c.onchange = function () { inc.copro = c.value; rerenderIncidents(); };
      s.onchange = function () { inc.sort = s.value; rerenderIncidents(); };
    }
  }
  var lastIncidents = null;
  function rerenderIncidents() {
    if (!lastIncidents) return;
    var q = document.getElementById('inc-q');
    var pos = q ? q.selectionStart : 0;
    document.getElementById('page').innerHTML = document.querySelector('.banner').outerHTML + drawIncidents(lastIncidents, route());
    bindActions();
    var n = document.getElementById('inc-q');
    if (document.activeElement !== n && q) { n.focus(); n.setSelectionRange(pos, pos); }
  }

  function field(label, html) { return '<label>' + esc(label) + html + '</label>'; }
  function today(offset) { return new Date(Date.now() + (offset || 0) * 86400000).toISOString().slice(0, 10); }

  function openAction(kind, target, btn) {
    if (kind === 'consult') {
      if (target.indexOf('chain:') === 0) go('#/finances?f=chains&chain=' + encodeURIComponent(target.slice(6)));
      return;
    }
    if (kind === 'set_replacement') return replacementDialog(target);
    if (kind === 'schedule_review' && target.indexOf(':') > 0) return reviewDialog(target);
    var ref = target;
    var title = { request_update: 'Demander un point', request_verification: 'Demander une vérification', flag_priority: btn && btn.getAttribute('data-flagged') === '1' ? 'Retirer la priorité' : 'Signaler prioritaire', reassign: 'Réaffecter le suivi', schedule_review: 'Programmer une revue', prepare_decision: 'Préparer une décision' }[kind];
    var sensitive = kind === 'reassign' || kind === 'prepare_decision';
    var p = kind === 'reassign' ? managers() : Promise.resolve(null);
    p.then(function (list) {
      var body = '';
      if (kind === 'request_update' || kind === 'request_verification' || kind === 'flag_priority') body = field('Message (facultatif)', '<textarea name="message" maxlength="500" rows="3"></textarea>');
      if (kind === 'reassign') {
        body = field('Confier le suivi à', '<select name="to" required><option value="">Choisir un gestionnaire</option>' + list.map(function (m) {
          return '<option value="' + esc(m.id) + '"' + (m.absentToday || !m.active ? ' disabled' : '') + '>' + esc(m.name) + (m.absentToday ? ' — absent(e) jusqu’au ' + esc(day(m.absentUntil)) : '') + '</option>';
        }).join('') + '</select>') + field('Motif (obligatoire)', '<input name="reason" required maxlength="300">') +
          '<p class="muted" style="margin:0;font-size:13px">Seul le suivi change : les règles du parcours et les pouvoirs de décision restent identiques.</p>';
      }
      if (kind === 'schedule_review') body = field('Date de la revue', '<input type="date" name="dueOn" required min="' + today() + '" max="' + today(366) + '" value="' + today(7) + '">') + field('Note (facultatif)', '<input name="note" maxlength="300">');
      if (kind === 'prepare_decision') {
        body = field('Type', '<select name="kind"><option value="quote_approval">Choix d’un devis</option><option value="expenditure">Dépense</option><option value="closure">Clôture</option><option value="procedure_exception">Exception de procédure</option><option value="other">Autre</option></select>') +
          field('Objet', '<input name="label" required maxlength="200">') + field('Montant HT en euros (facultatif)', '<input name="amountHt" inputmode="numeric" pattern="[0-9]*" maxlength="9">') +
          field('Instance habilitée à décider', '<input name="authority" required maxlength="120" placeholder="Gestionnaire, conseil syndical, assemblée générale…">') +
          '<p class="muted" style="margin:0;font-size:13px">Préparer n’est pas décider : aucune dépense n’est autorisée ni engagée par SyndicPlus.</p>';
      }
      showDialog(title + ' — ' + ref, body, sensitive, function (fd) {
        var payload = { action: kind };
        if (kind === 'request_update' || kind === 'request_verification') payload.message = fd.get('message') || '';
        if (kind === 'flag_priority') { payload.flagged = !(btn && btn.getAttribute('data-flagged') === '1'); payload.message = fd.get('message') || ''; }
        if (kind === 'reassign') { payload.to = fd.get('to'); payload.reason = fd.get('reason'); }
        if (kind === 'schedule_review') { payload.dueOn = fd.get('dueOn'); payload.note = fd.get('note') || ''; }
        if (kind === 'prepare_decision') {
          payload.kind = fd.get('kind'); payload.label = fd.get('label'); payload.authority = fd.get('authority');
          var a = String(fd.get('amountHt') || '').trim();
          if (a) payload.amountHt = Number(a);
        }
        if (sensitive) payload.confirm = true;
        return api('/api/cockpit/dossiers/' + encodeURIComponent(ref) + '/actions', { method: 'POST', body: payload });
      }, function (form) {
        if (kind !== 'reassign') return null;
        var sel = form.querySelector('[name=to]');
        return sel.value ? 'Vous allez confier le suivi de ' + ref + ' à ' + sel.options[sel.selectedIndex].text + '. Cette personne et l’ancien responsable seront informés dans SyndicPlus.' : null;
      });
    });
  }
  function replacementDialog(userId) {
    api('/api/cockpit/team').then(function (res) {
      if (res.status !== 200) return toast(res.body.error || 'Équipe indisponible.', true);
      var m = res.body.managers.filter(function (x) { return x.id === userId; })[0];
      if (!m) return toast('Gestionnaire introuvable.', true);
      var abs = m.absence || m.upcomingAbsence;
      if (!abs) return toast('Aucune absence enregistrée pour ' + m.name + '.', true);
      var opts = res.body.candidates.filter(function (c) { return c.id !== userId; }).map(function (c) {
        return '<option value="' + esc(c.id) + '"' + (c.absentToday || !c.active ? ' disabled' : '') + (abs.replacementId === c.id ? ' selected' : '') + '>' + esc(c.name) + (c.absentToday ? ' — absent(e)' : '') + '</option>';
      }).join('');
      showDialog('Remplaçant de ' + m.name, '<p style="margin:0">Absence du ' + esc(day(abs.startsOn)) + ' au ' + esc(day(abs.endsOn)) + ' · ' + plural(m.open, 'dossier ouvert', 'dossiers ouverts') + '</p>' +
        field('Remplaçant', '<select name="replacement" required><option value="">Choisir</option>' + opts + '</select>'), true, function (fd) {
        return api('/api/cockpit/team/' + encodeURIComponent(userId) + '/replacement', { method: 'POST', body: { replacement: fd.get('replacement'), confirm: true } });
      }, function (form) {
        var sel = form.querySelector('[name=replacement]');
        return sel.value ? sel.options[sel.selectedIndex].text + ' assurera le suivi des dossiers de ' + m.name + ' pendant son absence. Les deux personnes seront informées dans SyndicPlus.' : null;
      });
    });
  }
  function reviewDialog(target) {
    var i = target.indexOf(':');
    var entity = target.slice(0, i), id = target.slice(i + 1);
    var label = { copro: 'la copropriété', contract: 'le contrat', provider: 'le prestataire' }[entity] || '';
    showDialog('Programmer une revue', '<p style="margin:0">Revue de ' + esc(label) + '. Rappel interne : aucune invitation n’est envoyée.</p>' +
      field('Date', '<input type="date" name="dueOn" required min="' + today() + '" max="' + today(366) + '" value="' + today(7) + '">') + field('Note (facultatif)', '<input name="note" maxlength="300">'), false, function (fd) {
      return api('/api/cockpit/reviews', { method: 'POST', body: { entity: entity, entityId: id, dueOn: fd.get('dueOn'), note: fd.get('note') || '' } });
    });
  }

  function showDialog(title, body, sensitive, submit, confirmText) {
    dlg.innerHTML = '<form method="dialog" novalidate><h2 style="margin:0">' + esc(title) + '</h2>' + body +
      '<div class="confirm" id="dlg-confirm" hidden></div><div class="muted" id="dlg-err" role="alert" style="color:var(--red)"></div>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn" type="button" id="dlg-cancel">Annuler</button><button class="btn primary" type="submit" id="dlg-ok">' + (sensitive ? 'Continuer' : 'Valider') + '</button></div></form>';
    var form = dlg.querySelector('form');
    var ok = dlg.querySelector('#dlg-ok');
    var step = 0;
    dlg.querySelector('#dlg-cancel').onclick = function () { dlg.close(); };
    form.onsubmit = function (e) {
      e.preventDefault();
      var err = dlg.querySelector('#dlg-err');
      err.textContent = '';
      if (!form.checkValidity()) { err.textContent = 'Complétez les champs obligatoires.'; return; }
      if (sensitive && step === 0) {
        var box = dlg.querySelector('#dlg-confirm');
        box.textContent = (confirmText && confirmText(form)) || 'Action sensible : elle sera enregistrée au journal avec votre nom. Confirmez-vous ?';
        box.hidden = false;
        ok.textContent = 'Confirmer';
        step = 1;
        Array.prototype.forEach.call(form.querySelectorAll('input,select,textarea'), function (x) { x.addEventListener('input', function () { step = 0; box.hidden = true; ok.textContent = 'Continuer'; }, { once: true }); });
        return;
      }
      ok.disabled = true;
      submit(new FormData(form)).then(function (res) {
        ok.disabled = false;
        if (res.status !== 200) { err.textContent = res.body.error || 'Action impossible.'; return; }
        dlg.close();
        cache.managers = null;
        toast(res.body.message || 'Action enregistrée.');
        render();
      }, function () { ok.disabled = false; err.textContent = 'Le serveur n’a pas répondu.'; });
    };
    dlg.showModal();
  }

  // ---------- Rendu ----------
  function render() {
    var r = route();
    root.setAttribute('data-ready', '0');
    var sheet = document.getElementById('sheet');
    if (sheet) sheet.classList.remove('open');
    switch (r.page) {
      case 'portefeuille':
        return r.id ? page(r, 'Portefeuille', '/api/cockpit/portfolio/' + encodeURIComponent(r.id), drawCopro) : page(r, 'Portefeuille', '/api/cockpit/portfolio', drawPortfolio);
      case 'equipe':
        return page(r, 'Supervision des gestionnaires', '/api/cockpit/team', drawTeam);
      case 'incidents':
        if (r.id) return page(r, 'Dossier ' + r.id, '/api/cockpit/dossiers/' + encodeURIComponent(r.id), drawDossier);
        return page(r, 'Centre incidents', '/api/cockpit/dossiers', function (d) { lastIncidents = d; return drawIncidents(d, r); });
      case 'finances':
        return page(r, 'Finances & contrats', '/api/cockpit/finance', Object.assign(function (d) { return drawFinance(d, r); }, { after: drawFinance.after }));
      case 'prestataires':
        return page(r, 'Performance des prestataires', '/api/cockpit/providers', drawProviders);
      case 'qualite':
        return page(r, 'Qualité & satisfaction', '/api/cockpit/quality', drawQuality);
      case 'assistant':
        return page(r, 'Assistant', '/api/cockpit/assistant', Object.assign(function (d) { return drawAssistant(d, r); }, { after: drawAssistant.after }));
      case 'journal':
        return page(r, 'Journal & décisions', '/api/cockpit/journal', drawJournal);
      default:
        return page(r, 'Vue globale', '/api/cockpit/overview', drawOverview);
    }
  }

  // ---------- Connexion de démonstration ----------
  function loginScreen(notice) {
    api('/api/demo/personas').then(function (res) {
      if (res.status !== 200) {
        root.innerHTML = '<div class="login"><div class="state card"><h2>Cockpit indisponible</h2><p>' + esc(notice || 'L’accès au cockpit nécessite une authentification qui n’est pas encore ouverte sur cet environnement.') + '</p><a class="btn" href="/">Retour à l’accueil</a></div></div>';
        root.setAttribute('data-ready', '1');
        return;
      }
      root.innerHTML = '<div class="login"><h1>Cockpit du cabinet</h1><p class="muted">Démonstration : choisissez une persona <strong>fictive</strong>. Les données sont générées pour l’exemple et ne concernent aucune personne réelle.</p>' +
        (notice ? '<div class="confirm" style="margin-bottom:12px">' + esc(notice) + '</div>' : '') +
        '<div class="list">' + res.body.personas.map(function (p) { return '<button type="button" class="persona" data-persona="' + esc(p.id) + '"><b>' + esc(p.label) + '</b><span class="muted">' + esc(p.detail) + '</span></button>'; }).join('') + '</div></div>';
      Array.prototype.forEach.call(root.querySelectorAll('[data-persona]'), function (b) {
        b.onclick = function () {
          b.disabled = true;
          api('/api/demo/login', { method: 'POST', body: { userId: b.getAttribute('data-persona') } }).then(function (r) {
            if (r.status !== 200) { b.disabled = false; return toast(r.body.error || 'Connexion impossible.', true); }
            start();
          });
        };
      });
      root.setAttribute('data-ready', '1');
    }, function () { root.innerHTML = '<div class="login state">Serveur injoignable.</div>'; });
  }
  function start() {
    api('/api/cockpit/me').then(function (res) {
      if (res.status === 401) return loginScreen(res.body.code === 'auth_unavailable' ? res.body.error : null);
      if (res.status !== 200) { root.innerHTML = '<div class="login state">Erreur : ' + esc(res.body.error || res.status) + '</div>'; return; }
      if (!res.body.canSupervise) {
        root.innerHTML = '<div class="login"><div class="state card"><h2>Accès réservé</h2><p>' + esc(res.body.user.name) + ' : ' + esc(res.body.reason) + '</p><button class="btn primary" type="button" id="switch">Changer de persona</button></div></div>';
        document.getElementById('switch').onclick = logout;
        root.setAttribute('data-ready', '1');
        return;
      }
      me = res.body;
      render();
    }, function () { root.innerHTML = '<div class="login state">Serveur injoignable.</div>'; root.setAttribute('data-ready', '1'); });
  }
  window.addEventListener('hashchange', function () { if (me) render(); });
  start();
})();
