/**
 * API du cockpit responsable de cabinet (/api/cockpit/*) et de l'identité de démonstration (/api/demo/*).
 * - Identité : session de démonstration signée (préproduction/local) ; en production → 401.
 * - Chaque lecture est filtrée par cabinet et périmètre (loadSnapshot) ; chaque écriture repasse par la politique,
 *   écrit l'historique interne, le journal d'audit et une notification interne (aucun e-mail/SMS envoyé).
 */
import { parseDossierAction, parseReplacement, parseReview } from './actions';
import { loadSnapshot, type Snapshot } from './data';
import { clearSessionCookie, demoIdentityEnabled, getPrincipal, sessionCookie, type Principal } from './identity';
import {
  ASSISTANT_QUESTIONS, allDossierViews, fr, assistant, coproDetail, currentAbsence, effectiveOwner, finance, financeChains, nextAbsence,
  overview, portfolio, providers, quality, ref, team, userName, type QuestionId,
} from './metrics';
import { canReassign, canSetReplacement, canSupervise, type TargetUser } from './policy';
import { DEMO_PERSONAS, demoSeedStatements } from './seed';

type Json = (data: unknown, status?: number, headers?: Record<string, string>) => Response;

const MAX_BODY = 4_000;

async function readJson(request: Request): Promise<unknown | null> {
  // JSON obligatoire : un formulaire d'un autre site ne peut pas l'envoyer sans pré-vérification CORS.
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) return null;
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) return null;
  try {
    const t = await request.text();
    return t.length > MAX_BODY ? null : (JSON.parse(t) as unknown);
  } catch {
    return null;
  }
}

function targetUser(s: Snapshot, cabinetId: string, id: string | null): TargetUser | null {
  if (!id) return null;
  const u = s.users.find((x) => x.id === id);
  if (!u) return null;
  return { id: u.id, cabinetId, role: u.role, active: u.active, absentToday: Boolean(currentAbsence(s, u.id)) };
}

async function seedDemo(db: D1Database, now: number) {
  await db.batch(demoSeedStatements(db, now));
}

export async function handleCockpit(request: Request, env: Env, path: string, json: Json, now = Date.now()): Promise<Response | null> {
  const secure = new URL(request.url).protocol === 'https:';
  const method = request.method;

  // Défense en profondeur contre les requêtes inter-sites (lien piégé, image, formulaire) :
  // les navigateurs récents indiquent l'origine de la requête ; seules « same-origin » et « none » (saisie directe) passent.
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return json({ error: 'Requête inter-sites refusée.' }, 403);

  // ---------------- Identité de démonstration ----------------
  if (path.startsWith('/api/demo/')) {
    if (!demoIdentityEnabled(env)) return json({ error: 'Démonstration indisponible sur cet environnement.' }, 404);
    if (path === '/api/demo/personas' && method === 'GET') return json({ personas: DEMO_PERSONAS, notice: 'Personnes et données entièrement fictives.' });
    if (path === '/api/demo/login' && method === 'POST') {
      const body = await readJson(request);
      const id = (body as { userId?: unknown } | null)?.userId;
      if (typeof id !== 'string' || !DEMO_PERSONAS.some((p) => p.id === id)) return json({ error: 'Persona inconnue.' }, 400);
      const exists = await env.DB.prepare("SELECT 1 AS x FROM users WHERE id = ? AND is_demo = 1").bind(id).first();
      if (!exists) await seedDemo(env.DB, now);
      return json({ ok: true }, 200, { 'set-cookie': await sessionCookie(env, id, now, secure) });
    }
    if (path === '/api/demo/logout' && method === 'POST') return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie(secure) });
    if (path === '/api/demo/reset' && method === 'POST') {
      if ((await readJson(request)) === null) return json({ error: 'Requête invalide.' }, 400);
      const p = await getPrincipal(request, env, now);
      if (!p) return json({ error: 'Connectez-vous avec une persona de démonstration.' }, 401);
      await seedDemo(env.DB, now);
      return json({ ok: true, message: 'Données de démonstration régénérées.' });
    }
    return json({ error: 'Introuvable' }, 404);
  }

  if (!path.startsWith('/api/cockpit/')) return null;

  // ---------------- Cockpit ----------------
  if (!demoIdentityEnabled(env)) return json({ error: 'Authentification requise. Le cockpit n’est pas encore ouvert sur cet environnement.', code: 'auth_unavailable' }, 401);
  const p = await getPrincipal(request, env, now);
  if (!p) return json({ error: 'Authentification requise.', code: 'auth_required' }, 401);
  const verdict = canSupervise(p);
  if (path === '/api/cockpit/me' && method === 'GET') {
    return json({ user: { id: p.userId, name: p.name, role: p.role, cabinetName: p.cabinetName, scopeAll: p.scopeAll, copros: p.coproIds.length }, canSupervise: verdict.ok, reason: verdict.ok ? null : verdict.reason });
  }
  if (!verdict.ok) return json({ error: verdict.reason, code: 'forbidden' }, 403);

  const s = await loadSnapshot(env.DB, p, now);
  const url = new URL(request.url);

  if (method === 'GET') {
    switch (path) {
      case '/api/cockpit/overview':
        return json(overview(s));
      case '/api/cockpit/dossiers':
        return json({ dossiers: allDossierViews(s), managers: managersFor(s) });
      case '/api/cockpit/portfolio':
        return json({ copros: portfolio(s) });
      case '/api/cockpit/team':
        return json({ ...team(s), candidates: managersFor(s) });
      case '/api/cockpit/finance':
        return json(finance(s));
      case '/api/cockpit/providers':
        return json({ providers: providers(s), note: 'Indicateurs factuels issus des interventions enregistrées. Ils ne constituent pas un jugement sur le prestataire ; le contexte (pièces, accès, météo, diagnostic) n’est pas toujours connu.' });
      case '/api/cockpit/quality':
        return json(quality(s));
      case '/api/cockpit/assistant': {
        const q = url.searchParams.get('q');
        if (!q) return json({ questions: ASSISTANT_QUESTIONS, engine: 'Règles déterministes — pas d’IA générative.' });
        if (!ASSISTANT_QUESTIONS.some((x) => x.id === q)) return json({ error: 'Question inconnue.' }, 400);
        return json(assistant(s, q as QuestionId));
      }
      case '/api/cockpit/journal':
        return json(await journal(env.DB, p, s));
      case '/api/cockpit/report.csv': {
        await audit(env.DB, p, 'export_report', 'report', null, `Export CSV de ${s.dossiers.length} dossier(s)`).run();
        return new Response(reportCsv(s), {
          headers: {
            'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="syndicplus-rapport-${new Date(now).toISOString().slice(0, 10)}.csv"`,
            'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          },
        });
      }
    }
    const dm = /^\/api\/cockpit\/dossiers\/D-(\d{1,9})$/.exec(path);
    if (dm) return dossierDetail(env.DB, s, Number(dm[1]), json);
    const pm = /^\/api\/cockpit\/portfolio\/([a-z0-9_]{1,40})$/.exec(path);
    if (pm) {
      const d = coproDetail(s, pm[1]!);
      return d ? json(d) : json({ error: 'Copropriété introuvable dans votre périmètre.' }, 404);
    }
    return json({ error: 'Introuvable' }, 404);
  }

  if (method === 'POST') {
    const am = /^\/api\/cockpit\/dossiers\/D-(\d{1,9})\/actions$/.exec(path);
    if (am) return dossierAction(env.DB, p, s, Number(am[1]), await readJson(request), json);
    const rm = /^\/api\/cockpit\/team\/([a-z0-9_]{1,40})\/replacement$/.exec(path);
    if (rm) return setReplacement(env.DB, p, s, rm[1]!, await readJson(request), json);
    if (path === '/api/cockpit/reviews') return addReview(env.DB, p, s, await readJson(request), json);
  }
  return json({ error: 'Introuvable' }, 404);
}

function managersFor(s: Snapshot) {
  return s.users
    .filter((u) => u.role === 'manager')
    .map((u) => {
      const a = currentAbsence(s, u.id);
      return { id: u.id, name: u.name, active: u.active, absentToday: Boolean(a), absentUntil: a?.endsOn ?? null };
    });
}

// ---------------- Écritures ----------------

function audit(db: D1Database, p: Principal, action: string, entity: string, entityId: string | null, detail: string) {
  return db.prepare('INSERT INTO audit_log (cabinet_id,actor_user_id,action,entity,entity_id,detail) VALUES (?,?,?,?,?,?)').bind(p.cabinetId, p.userId, action, entity, entityId, detail);
}
function history(db: D1Database, p: Principal, num: number, text: string) {
  return db.prepare('INSERT INTO history (dossier_num,text,actor_user_id,internal) VALUES (?,?,?,1)').bind(num, text, p.userId);
}
function notify(db: D1Database, p: Principal, to: string, num: number | null, kind: string, message: string) {
  return db.prepare('INSERT INTO notifications (cabinet_id,to_user_id,dossier_num,kind,message,created_by) VALUES (?,?,?,?,?,?)').bind(p.cabinetId, to, num, kind, message, p.userId);
}

async function dossierAction(db: D1Database, p: Principal, s: Snapshot, num: number, body: unknown, json: Json): Promise<Response> {
  const d = s.dossiers.find((x) => x.num === num);
  if (!d) return json({ error: 'Dossier introuvable dans votre périmètre.' }, 404);
  const parsed = parseDossierAction(body, s.now);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const a = parsed.value;
  const r = ref(num);
  const owner = effectiveOwner(s, d);
  const copro = s.copros.find((c) => c.id === d.coproId);
  // Destinataire du suivi : responsable effectif, sinon gestionnaire de la copropriété
  const followUp = owner.id ?? copro?.managerId ?? null;
  const ops: D1PreparedStatement[] = [];
  const notified: string[] = [];
  const tell = (to: string | null, kind: string, msg: string) => {
    if (!to || notified.includes(to)) return;
    notified.push(to);
    ops.push(notify(db, p, to, num, kind, msg));
  };
  let message = '';
  // Garde exécutée seule avant le reste : écriture conditionnelle, une requête simultanée identique échoue (pas de doublon)
  let guard: { stmt: D1PreparedStatement; conflict: string } | null = null;

  // Dossier clôturé : seule une vérification reste possible (règle appliquée par le serveur, pas seulement par l'interface)
  if (d.status === 'Résolu' && a.action !== 'request_verification') return json({ error: 'Dossier clôturé : seule une demande de vérification est possible.' }, 409);

  switch (a.action) {
    case 'request_update': {
      if (!followUp) return json({ error: 'Aucun destinataire : affectez d’abord un gestionnaire.' }, 409);
      const msg = `${p.name} demande un point sur ${r} : ${a.message || 'merci d’indiquer l’avancement et la prochaine action.'}`;
      tell(followUp, 'update_request', msg);
      ops.push(history(db, p, num, `Point demandé par ${p.name} à ${userName(s, followUp)}${a.message ? ` : ${a.message}` : ''}`));
      ops.push(audit(db, p, 'request_update', 'dossier', r, `Destinataire : ${userName(s, followUp)}${a.message ? ` — ${a.message}` : ''}`));
      message = `Demande enregistrée et notifiée dans SyndicPlus à ${userName(s, followUp)} (aucun e-mail envoyé).`;
      break;
    }
    case 'request_verification': {
      if (!followUp) return json({ error: 'Aucun destinataire : affectez d’abord un gestionnaire.' }, 409);
      const msg = `${p.name} demande une vérification sur ${r}${a.message ? ` : ${a.message}` : ''}`;
      tell(followUp, 'verification_request', msg);
      tell(copro?.guardianId ?? null, 'verification_request', msg);
      ops.push(history(db, p, num, `Vérification demandée par ${p.name}${a.message ? ` : ${a.message}` : ''}`));
      ops.push(audit(db, p, 'request_verification', 'dossier', r, `Notifiés : ${notified.map((id) => userName(s, id)).join(', ')}`));
      message = `Vérification demandée. Notification interne : ${notified.map((id) => userName(s, id)).join(', ')}.`;
      break;
    }
    case 'flag_priority': {
      if (d.status === 'Résolu') return json({ error: 'Dossier clôturé.' }, 409);
      if (d.flagged === a.flagged) return json({ error: a.flagged ? 'Dossier déjà signalé prioritaire.' : 'Dossier non prioritaire.' }, 409);
      guard = { stmt: db.prepare('UPDATE dossiers SET flagged = ? WHERE num = ? AND cabinet_id = ? AND flagged = ?').bind(a.flagged ? 1 : 0, num, p.cabinetId, a.flagged ? 0 : 1), conflict: 'Le dossier vient d’être modifié. Rechargez la page.' };
      ops.push(history(db, p, num, a.flagged ? `Signalé prioritaire par ${p.name}${a.message ? ` : ${a.message}` : ''}` : `Priorité retirée par ${p.name}`));
      ops.push(audit(db, p, a.flagged ? 'flag_priority' : 'unflag_priority', 'dossier', r, a.message));
      tell(followUp, 'priority', a.flagged ? `${p.name} a signalé ${r} comme prioritaire${a.message ? ` : ${a.message}` : ''}` : `${p.name} a retiré la priorité de ${r}`);
      message = a.flagged ? 'Dossier signalé prioritaire.' : 'Priorité retirée.';
      break;
    }
    case 'reassign': {
      const target = targetUser(s, p.cabinetId, a.to);
      const v = canReassign(p, { cabinetId: p.cabinetId, coproId: d.coproId, closed: d.status === 'Résolu', assigneeId: d.assigneeId }, target);
      if (!v.ok) return json({ error: v.reason }, 403);
      const before = userName(s, d.assigneeId) ?? 'personne';
      const after = userName(s, a.to)!;
      guard = { stmt: db.prepare('UPDATE dossiers SET assignee_user_id = ? WHERE num = ? AND cabinet_id = ? AND assignee_user_id IS ?').bind(a.to, num, p.cabinetId, d.assigneeId), conflict: 'Le suivi de ce dossier vient d’être modifié. Rechargez la page.' };
      ops.push(history(db, p, num, `Suivi réaffecté par ${p.name} : ${before} → ${after}. Motif : ${a.reason}`));
      ops.push(audit(db, p, 'reassign', 'dossier', r, `${before} → ${after} — ${a.reason}`));
      tell(a.to, 'assignment', `${p.name} vous confie le suivi de ${r} (${d.description}). Motif : ${a.reason}`);
      tell(d.assigneeId, 'assignment', `${p.name} a confié le suivi de ${r} à ${after}. Motif : ${a.reason}`);
      message = `Suivi confié à ${after}. ${v.reason} Personnes informées : ${notified.map((id) => userName(s, id)).join(', ')}.`;
      break;
    }
    case 'prepare_decision': {
      guard = {
        stmt: db.prepare(
          `INSERT OR IGNORE INTO decisions (dossier_num,kind,label,amount_ht,status,authority,prepared_by,prepared_at)
           SELECT ?,?,?,?,'pending',?,?,? WHERE NOT EXISTS (SELECT 1 FROM decisions WHERE dossier_num = ? AND status = 'pending' AND label = ?)`,
        ).bind(num, a.kind, a.label, a.amountHt, a.authority, p.userId, new Date(s.now).toISOString(), num, a.label),
        conflict: 'Une décision identique est déjà en attente sur ce dossier.',
      };
      ops.push(history(db, p, num, `Décision préparée par ${p.name} (à prendre par : ${a.authority}) : ${a.label}`));
      ops.push(audit(db, p, 'prepare_decision', 'dossier', r, `${a.label}${a.amountHt !== null ? ` — ${a.amountHt} € HT` : ''} ; autorité : ${a.authority}`));
      tell(followUp, 'decision', `${p.name} a préparé une décision sur ${r} : ${a.label} (à prendre par : ${a.authority})`);
      message = `Décision préparée, en attente. Elle n’est ni approuvée ni engagée : elle doit être prise par ${a.authority}.`;
      break;
    }
    case 'schedule_review': {
      ops.push(db.prepare('INSERT INTO reviews (cabinet_id,entity,entity_id,due_on,note,created_by) VALUES (?,?,?,?,?,?)').bind(p.cabinetId, 'dossier', String(num), a.dueOn, a.note, p.userId));
      ops.push(history(db, p, num, `Revue programmée par ${p.name} le ${fr(a.dueOn)}${a.note ? ` : ${a.note}` : ''}`));
      ops.push(audit(db, p, 'schedule_review', 'dossier', r, `${a.dueOn}${a.note ? ` — ${a.note}` : ''}`));
      tell(followUp, 'review', `${p.name} a programmé une revue de ${r} le ${fr(a.dueOn)}${a.note ? ` : ${a.note}` : ''}`);
      message = `Revue programmée le ${fr(a.dueOn)} (rappel interne, aucune invitation envoyée).`;
      break;
    }
  }
  if (guard) {
    const res = await guard.stmt.run();
    if (res.meta.changes !== 1) return json({ error: guard.conflict }, 409);
  }
  await db.batch(ops);
  return json({ ok: true, message, notified: notified.map((id) => userName(s, id)) });
}

async function setReplacement(db: D1Database, p: Principal, s: Snapshot, userId: string, body: unknown, json: Json): Promise<Response> {
  const parsed = parseReplacement(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const absence = currentAbsence(s, userId) ?? nextAbsence(s, userId);
  if (!absence) return json({ error: 'Aucune absence en cours ou à venir pour cette personne.' }, 404);
  const absent = targetUser(s, p.cabinetId, userId);
  const repl = targetUser(s, p.cabinetId, parsed.value.replacement);
  if (parsed.value.replacement && !repl) return json({ error: 'Remplaçant introuvable dans votre cabinet.' }, 403);
  const v = canSetReplacement(p, absent, repl);
  if (!v.ok) return json({ error: v.reason }, 403);
  if (absence.replacementId === parsed.value.replacement) return json({ error: 'Aucun changement.' }, 409);
  const absentName = userName(s, userId)!;
  const replName = userName(s, parsed.value.replacement);
  const changed = await db.prepare('UPDATE absences SET replacement_user_id = ? WHERE id = ? AND replacement_user_id IS ?').bind(parsed.value.replacement, absence.id, absence.replacementId).run();
  if (changed.meta.changes !== 1) return json({ error: 'Le remplacement vient d’être modifié. Rechargez la page.' }, 409);
  const ops: D1PreparedStatement[] = [
    audit(db, p, 'set_replacement', 'absence', String(absence.id), `${absentName} (${fr(absence.startsOn)} → ${fr(absence.endsOn)}) : remplaçant ${replName ?? 'retiré'}`),
  ];
  const notified: string[] = [];
  if (parsed.value.replacement) {
    ops.push(notify(db, p, parsed.value.replacement, null, 'replacement', `${p.name} vous désigne remplaçant(e) de ${absentName} du ${fr(absence.startsOn)} au ${fr(absence.endsOn)}.`));
    notified.push(replName!);
  }
  ops.push(notify(db, p, userId, null, 'replacement', replName ? `${p.name} a désigné ${replName} pour vous remplacer du ${fr(absence.startsOn)} au ${fr(absence.endsOn)}.` : `${p.name} a retiré le remplaçant de votre absence.`));
  notified.push(absentName);
  // Historique des dossiers ouverts concernés
  for (const d of s.dossiers.filter((x) => x.assigneeId === userId && x.status !== 'Résolu')) {
    ops.push(history(db, p, d.num, replName ? `Suivi assuré par ${replName} pendant l’absence de ${absentName} (désigné par ${p.name})` : `Remplaçant retiré par ${p.name}`));
  }
  await db.batch(ops);
  return json({ ok: true, message: replName ? `${replName} remplace ${absentName} du ${fr(absence.startsOn)} au ${fr(absence.endsOn)}. Personnes informées : ${notified.join(', ')}.` : 'Remplaçant retiré.' });
}

async function addReview(db: D1Database, p: Principal, s: Snapshot, body: unknown, json: Json): Promise<Response> {
  const parsed = parseReview(body, s.now);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const v = parsed.value;
  const found =
    v.entity === 'copro' ? s.copros.find((c) => c.id === v.entityId)?.name
    : v.entity === 'contract' ? s.contracts.find((c) => c.id === v.entityId)?.label
    : s.providers.find((x) => x.id === v.entityId)?.name;
  if (!found) return json({ error: 'Élément introuvable dans votre périmètre.' }, 404);
  await db.batch([
    db.prepare('INSERT INTO reviews (cabinet_id,entity,entity_id,due_on,note,created_by) VALUES (?,?,?,?,?,?)').bind(p.cabinetId, v.entity, v.entityId, v.dueOn, v.note, p.userId),
    audit(db, p, 'schedule_review', v.entity, v.entityId, `${found} — ${v.dueOn}${v.note ? ` — ${v.note}` : ''}`),
  ]);
  return json({ ok: true, message: `Revue programmée le ${fr(v.dueOn)} : ${found} (rappel interne, aucune invitation envoyée).` });
}

// ---------------- Lectures détaillées ----------------

async function dossierDetail(db: D1Database, s: Snapshot, num: number, json: Json): Promise<Response> {
  const view = allDossierViews(s).find((v) => v.num === num);
  if (!view) return json({ error: 'Dossier introuvable dans votre périmètre.' }, 404);
  const h = await db.prepare('SELECT text, created_at, actor_user_id, internal FROM history WHERE dossier_num = ? ORDER BY created_at DESC, id DESC LIMIT 100').bind(num).all<{ text: string; created_at: string; actor_user_id: string | null; internal: number }>();
  return json({
    dossier: view,
    history: h.results.map((x) => ({ text: x.text, at: Date.parse(x.created_at), actor: userName(s, x.actor_user_id), internal: Boolean(x.internal) })),
    interventions: s.interventions.filter((i) => i.dossierNum === num).map((i) => ({ ...i, providerName: s.providers.find((x) => x.id === i.providerId)?.name ?? '—' })),
    reserves: s.reserves.filter((r) => r.dossierNum === num),
    finance: financeChains(s).filter((c) => c.dossier === view.ref),
    decisions: s.decisions.filter((d) => d.dossierNum === num).map((d) => ({ ...d, preparedByName: userName(s, d.preparedBy) ?? d.preparedBy })),
    satisfaction: s.satisfaction.filter((q) => q.dossierNum === num).map((q) => ({ score: q.score, comment: q.consent ? q.comment : '', collectedAt: q.collectedAt })),
    reviews: s.reviews.filter((r) => r.entity === 'dossier' && r.entityId === String(num)),
    managers: managersFor(s),
  });
}

async function journal(db: D1Database, p: Principal, s: Snapshot) {
  const rows = await db.prepare('SELECT action, entity, entity_id, detail, actor_user_id, created_at FROM audit_log WHERE cabinet_id = ? ORDER BY id DESC LIMIT 300').bind(p.cabinetId).all<{ action: string; entity: string; entity_id: string | null; detail: string; actor_user_id: string; created_at: string }>();
  const refs = new Set(s.dossiers.map((d) => ref(d.num)));
  const copros = new Set(s.copros.map((c) => c.id));
  const contracts = new Set(s.contracts.map((c) => c.id));
  const visible = rows.results.filter((r) =>
    r.entity === 'dossier' ? refs.has(r.entity_id ?? '') : r.entity === 'copro' ? copros.has(r.entity_id ?? '') : r.entity === 'contract' ? contracts.has(r.entity_id ?? '') : true,
  );
  return {
    entries: visible.map((r) => ({ action: r.action, entity: r.entity, entityId: r.entity_id, detail: r.detail, actor: userName(s, r.actor_user_id) ?? r.actor_user_id, at: Date.parse(r.created_at) })),
    decisions: s.decisions.map((d) => ({ ...d, ref: ref(d.dossierNum), preparedByName: userName(s, d.preparedBy) ?? d.preparedBy })),
    reviews: s.reviews,
  };
}

/** CSV (séparateur « ; » pour Excel FR), protégé contre l'injection de formules. */
export function csvCell(v: unknown): string {
  let t = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

function reportCsv(s: Snapshot): string {
  const head = ['Référence', 'Copropriété', 'Type', 'Lieu', 'Parcours', 'Statut', 'Suivi par', 'Prochaine action', 'Échéance', 'Signaux', 'Créé le', 'Mis à jour le'];
  const iso = (n: number | null) => (n ? new Date(n).toISOString().slice(0, 16).replace('T', ' ') : '');
  const lines = allDossierViews(s).filter((v) => v.open).map((v) =>
    [v.ref, v.coproName, v.typeLabel, v.place, v.pathway ?? '', v.status, v.owner.name, v.nextAction ?? '', iso(v.nextActionDue), v.flags.map((f) => f.label).join(', '), iso(v.createdAt), iso(v.updatedAt)].map(csvCell).join(';'),
  );
  return `﻿${[head.join(';'), ...lines].join('\r\n')}\r\n`;
}
