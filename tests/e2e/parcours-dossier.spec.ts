import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours de référence du prototype :
 * un résident signale → le syndic voit, qualifie et commente sur un autre appareil → le résident voit la mise à jour.
 * Les deux rôles utilisent des contextes navigateur séparés (pas de stockage partagé) : seule l'API relie les appareils.
 */

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1200) <= 900;

async function switchRole(page: Page, role: 'resident' | 'manager') {
  await page.evaluate((r) => (window as unknown as { setRole: (x: string) => void }).setRole(r), role);
}

test('signalement partagé entre résident et syndic', async ({ browser }) => {
  const unique = `Test e2e ${Date.now()}`;
  const residentCtx = await browser.newContext();
  const managerCtx = await browser.newContext();
  const resident = await residentCtx.newPage();
  const manager = await managerCtx.newPage();
  const errors: string[] = [];
  for (const p of [resident, manager]) p.on('pageerror', (e) => errors.push(e.message));

  // 1. Le résident signale un problème
  await resident.goto('/');
  await switchRole(resident, 'resident');
  await expect(resident.getByRole('heading', { name: /Bonjour Jean/ })).toBeVisible();
  await resident.locator('.act.blue').click();
  await resident.locator('select[name=type]').selectOption('Ascenseur');
  await resident.locator('input[name=place]').fill('Hall bâtiment A');
  await resident.locator('textarea[name=description]').fill(unique);
  await resident.getByRole('button', { name: 'Envoyer le signalement' }).click();
  await expect(resident.getByRole('heading', { name: 'Signalement enregistré' })).toBeVisible();
  const ref = (await resident.locator('#modalContent strong').textContent())!.trim();
  expect(ref).toMatch(/^D-\d+$/);

  // 2. Le syndic, sur un autre appareil, voit le dossier et le traite
  await manager.goto('/');
  await switchRole(manager, 'manager');
  const row = manager.locator('.row', { hasText: ref });
  await expect(row).toBeVisible();
  await row.click();
  await manager.locator('#newStatus').selectOption('En cours');
  await manager.locator('#newNote').fill('Ascensoriste appelé');
  await manager.locator('#saveBtn').click();
  await expect(manager.getByRole('heading', { name: 'Modification partagée' })).toBeVisible();

  // 3. Le résident voit le nouveau statut et l'historique
  await resident.reload();
  await switchRole(resident, 'resident');
  await resident.evaluate(() => (window as unknown as { go: (v: string) => void }).go('demandes'));
  const req = resident.locator('.req', { hasText: unique });
  await expect(req).toContainText('En cours');
  await req.click();
  await expect(resident.locator('.timeline')).toContainText('Ascensoriste appelé — statut : En cours');

  // Pas d'erreur JavaScript, pas de débordement horizontal sur mobile
  expect(errors).toEqual([]);
  if (isMobile(resident)) {
    const overflow = await resident.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  }
  await residentCtx.close();
  await managerCtx.close();
});

test('le texte saisi est affiché comme du texte, jamais exécuté', async ({ page }) => {
  let dialog = false;
  page.on('dialog', async (d) => {
    dialog = true;
    await d.dismiss();
  });
  const payload = `<img src=x onerror=alert(1)> ${Date.now()}`;
  const res = await page.request.post('/api/dossiers', { data: { type: 'Autre', place: 'Test', description: payload } });
  expect(res.status()).toBe(201);
  await page.goto('/');
  await (page.evaluate(() => (window as unknown as { setRole: (x: string) => void }).setRole('resident')));
  await expect(page.locator('.req').first()).toContainText('<img src=x onerror=alert(1)>');
  expect(dialog).toBe(false);
});
