/**
 * SyndicPlus — Worker Cloudflare.
 * - /api/*  : API JSON (dossiers et historique) sur D1
 * - le reste : fichiers statiques de public/ (binding ASSETS)
 *
 * Sprint 0 : conversion TypeScript à comportement identique au prototype v0.2.
 * Aucune authentification à ce stade (voir docs/SECURITY.md) — données fictives uniquement.
 */
import { historyText, isMeaningfulUpdate, parseDossierUpdate, parseNewDossier, parseRef } from './domain';
import { handleCockpit } from './cockpit/http';
import { handleProcedures } from './procedures/http';
import { applyUpdate, createDossier, getStatus, listDossiers } from './repository';

const MAX_BODY_BYTES = 10_000;
/** La fiche d'un immeuble accompagne les calculs de parcours : limite plus large, toujours bornée. */
const MAX_PROCEDURE_BODY_BYTES = 64_000;

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
};

export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS, ...extra },
  });
}

async function readBody(request: Request, max = MAX_BODY_BYTES): Promise<unknown | null> {
  if (Number(request.headers.get('content-length') || 0) > max) return null;
  try {
    const text = await request.text();
    if (text.length > max) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function handleApi(request: Request, env: Env, path: string): Promise<Response> {
  if (path.startsWith('/api/procedures/')) {
    const res = await handleProcedures(request, path, () => readBody(request, MAX_PROCEDURE_BODY_BYTES), json);
    if (res) return res;
  }

  if (path.startsWith('/api/cockpit/') || path.startsWith('/api/demo/')) {
    const res = await handleCockpit(request, env, path, json);
    if (res) return res;
  }

  if (path === '/api/dossiers' && request.method === 'GET') {
    return json(await listDossiers(env.DB));
  }

  if (path === '/api/dossiers' && request.method === 'POST') {
    const parsed = parseNewDossier(await readBody(request));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const id = await createDossier(env.DB, parsed.value);
    return json({ id }, 201);
  }

  const m = /^\/api\/dossiers\/([^/]+)\/updates$/.exec(path);
  if (m && request.method === 'POST') {
    const num = parseRef(decodeURIComponent(m[1]!));
    if (num === null) return json({ error: 'Dossier introuvable' }, 404);
    const parsed = parseDossierUpdate(await readBody(request));
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const current = await getStatus(env.DB, num);
    if (current === null) return json({ error: 'Dossier introuvable' }, 404);
    if (!isMeaningfulUpdate(current, parsed.value)) return json({ error: 'Ajoutez une note ou modifiez le statut.' }, 400);
    await applyUpdate(env.DB, num, parsed.value, historyText(parsed.value));
    return json({ ok: true });
  }

  return json({ error: 'Introuvable' }, 404);
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await handleApi(request, env, path);
    } catch (e) {
      console.error(e);
      return json({ error: 'Erreur serveur' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
