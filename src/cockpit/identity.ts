/**
 * Identité — adaptateur de DÉMONSTRATION (préproduction et local uniquement).
 * En attendant l'authentification réelle (Sprint 1), une session signée (HMAC-SHA256) désigne une personne FICTIVE.
 * Activé seulement si DEMO_IDENTITY = "enabled" ET un secret DEMO_SECRET (≥ 16 caractères) est défini.
 * En production (variable absente ou "disabled"), aucune identité n'est reconnue : le cockpit répond 401.
 */

export type CockpitRole = 'cabinet_director' | 'manager' | 'guardian' | 'council_president';

export interface Principal {
  userId: string;
  cabinetId: string;
  cabinetName: string;
  name: string;
  role: CockpitRole;
  scopeAll: boolean;
  /** Copropriétés du périmètre (toutes celles du cabinet si scopeAll). */
  coproIds: string[];
}

export const SESSION_COOKIE = 'sp_demo_session';
const SESSION_SECONDS = 8 * 3600;

interface DemoEnv {
  DEMO_IDENTITY?: string;
  DEMO_SECRET?: string;
}

export function demoIdentityEnabled(env: unknown): boolean {
  const e = env as DemoEnv;
  return e.DEMO_IDENTITY === 'enabled' && typeof e.DEMO_SECRET === 'string' && e.DEMO_SECRET.length >= 16;
}

const enc = new TextEncoder();

async function sign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function sessionCookie(env: unknown, userId: string, nowMs: number, secure: boolean): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_SECONDS;
  const payload = `${userId}.${exp}`;
  const sig = await sign((env as DemoEnv).DEMO_SECRET!, payload);
  return `${SESSION_COOKIE}=${payload}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** Identité vérifiée de la requête, ou null. Le compte doit être actif, fictif et rattaché à un cabinet de démonstration. */
export async function getPrincipal(request: Request, env: Env, nowMs: number): Promise<Principal | null> {
  if (!demoIdentityEnabled(env)) return null;
  const raw = readCookie(request, SESSION_COOKIE);
  if (!raw) return null;
  const m = /^([a-z0-9_]{1,40})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(raw);
  if (!m) return null;
  const [, userId, exp, sig] = m as unknown as [string, string, string, string];
  if (Number(exp) * 1000 < nowMs) return null;
  if (!safeEqual(sig, await sign((env as unknown as DemoEnv).DEMO_SECRET!, `${userId}.${exp}`))) return null;
  const user = await env.DB.prepare(
    `SELECT u.id, u.cabinet_id, u.name, u.role, u.scope_all, c.name AS cabinet_name
       FROM users u JOIN cabinets c ON c.id = u.cabinet_id
      WHERE u.id = ? AND u.active = 1 AND u.is_demo = 1 AND c.is_demo = 1`,
  )
    .bind(userId)
    .first<{ id: string; cabinet_id: string; name: string; role: CockpitRole; scope_all: number; cabinet_name: string }>();
  if (!user) return null;
  const copros = user.scope_all
    ? await env.DB.prepare('SELECT id FROM coproprietes WHERE cabinet_id = ?').bind(user.cabinet_id).all<{ id: string }>()
    : await env.DB.prepare(
        'SELECT s.copro_id AS id FROM director_scopes s JOIN coproprietes p ON p.id = s.copro_id WHERE s.user_id = ? AND p.cabinet_id = ?',
      )
        .bind(user.id, user.cabinet_id)
        .all<{ id: string }>();
  return {
    userId: user.id,
    cabinetId: user.cabinet_id,
    cabinetName: user.cabinet_name,
    name: user.name,
    role: user.role,
    scopeAll: Boolean(user.scope_all),
    coproIds: copros.results.map((r) => r.id),
  };
}
