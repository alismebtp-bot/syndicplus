import { expect, test, type Page } from '@playwright/test';

// Cockpit du responsable de cabinet (personas fictives). Les écritures ne sont faites que sur le projet desktop
// pour éviter que les deux projets, lancés en parallèle sur la même base, ne se gênent.

async function ready(page: Page) {
  await expect(page.locator('#root')).toHaveAttribute('data-ready', '1');
}
async function loginAs(page: Page, persona: string) {
  await page.goto('/cabinet/');
  await ready(page);
  const switchBtn = page.locator('#switch');
  if (await switchBtn.count()) {
    await switchBtn.click();
    await ready(page);
  }
  await page.locator(`[data-persona="${persona}"]`).click();
  await ready(page);
}
/** Navigation interne : attend le rendu de la NOUVELLE page (évite de lire l'état de la précédente). */
async function nav(page: Page, hash: string) {
  await page.evaluate((h) => {
    document.getElementById('root')!.setAttribute('data-ready', '0');
    location.hash = h;
  }, hash);
  await ready(page);
}
async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

test('vue globale : indicateurs cliquables et briefing justifié', async ({ page }) => {
  await loginAs(page, 'dir_lea');
  await expect(page.getByRole('heading', { name: 'Vue globale' })).toBeVisible();
  await expect(page.getByText('fictifs')).toBeVisible();
  const first = page.locator('[data-attention]').first();
  await expect(first).toContainText('Urgence D-9001');
  await expect(first).toContainText('Responsable');
  await expect(first).toContainText('Sources');
  await noHorizontalOverflow(page);
  await page.locator('[data-kpi="late"]').click();
  await ready(page);
  await expect(page).toHaveURL(/#\/incidents\?f=late/);
  await expect(page.locator('#inc-count')).toHaveText('3 dossiers');
  await expect(page.locator('[data-dossier="D-9004"]')).toBeVisible();
  await noHorizontalOverflow(page);
});

test('centre incidents : recherche et fiche dossier avec historique', async ({ page }) => {
  await loginAs(page, 'dir_lea');
  await nav(page, '#/incidents?f=all');
  await page.locator('#inc-q').fill('parking');
  await expect(page.locator('#inc-count')).toHaveText('3 dossiers');
  await page.locator('[data-dossier="D-9011"]').click();
  await ready(page);
  await expect(page.locator('#page h2').first()).toContainText('D-9011');
  await expect(page.getByText('Panne récurrente').first()).toBeVisible();
  await noHorizontalOverflow(page);
});

test('demander un point : notification interne, historique et journal', async ({ page }) => {
  await loginAs(page, 'dir_lea');
  await nav(page, '#/incidents/D-9002');
  await page.locator('[data-do="request_update"]').click();
  await page.locator('dialog textarea[name=message]').fill('Où en est le constat ?');
  await page.locator('#dlg-ok').click();
  await expect(page.locator('#toast')).toContainText('aucun e-mail envoyé');
  await ready(page);
  await expect(page.locator('.hist li').first()).toContainText('Point demandé par Léa Fontaine');
  await nav(page, '#/journal');
  await expect(page.getByRole('cell', { name: 'Point demandé' }).first()).toBeVisible();
});

test('réaffectation : confirmation obligatoire, refus visibles, auteur enregistré', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Écriture testée une seule fois');
  await loginAs(page, 'dir_lea');
  await nav(page, '#/incidents/D-9014');
  const current = (await page.locator('tr', { hasText: 'Suivi' }).innerText()).includes('Claire') ? 'mgr_claire' : 'mgr_hugo';
  const target = current === 'mgr_claire' ? 'mgr_hugo' : 'mgr_claire';
  await page.locator('[data-do="reassign"]').click();
  await expect(page.locator('#dlg select[name=to] option[value="mgr_nadia"]')).toHaveAttribute('disabled', '');
  await page.locator('dialog select[name=to]').selectOption(target);
  await page.locator('dialog input[name=reason]').fill('Rééquilibrage de la charge');
  await page.locator('#dlg-ok').click();
  await expect(page.locator('#dlg-confirm')).toBeVisible();
  await expect(page.locator('#dlg-confirm')).toContainText('seront informés');
  await page.locator('#dlg-ok').click();
  await expect(page.locator('#toast')).toContainText('Suivi confié');
  await ready(page);
  await expect(page.locator('.hist li').first()).toContainText('Suivi réaffecté par Léa Fontaine');
});

test('remplaçant d’un gestionnaire absent', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Écriture testée une seule fois');
  await loginAs(page, 'dir_lea');
  await nav(page, '#/equipe');
  const card = page.locator('[data-manager="mgr_nadia"]');
  await expect(card).toContainText('Absent');
  const txt = await card.innerText();
  const repl = txt.includes('Claire Moreau</') || txt.includes('remplacé(e) par Claire') ? 'mgr_hugo' : 'mgr_claire';
  await card.locator('[data-do="set_replacement"]').click();
  await page.locator('dialog select[name=replacement]').selectOption(repl);
  await page.locator('#dlg-ok').click();
  await expect(page.locator('#dlg-confirm')).toBeVisible();
  await page.locator('#dlg-ok').click();
  await expect(page.locator('#toast')).toContainText('remplace Nadia Kader');
  await ready(page);
  await expect(page.locator('[data-manager="mgr_nadia"]')).toContainText('remplacé(e) par');
});

test('finances : étapes séparées et écarts signalés ; prestataires jamais jugés', async ({ page }) => {
  await loginAs(page, 'dir_lea');
  await nav(page, '#/finances');
  await expect(page.getByText('Un devis n’est pas une autorisation')).toBeVisible();
  await expect(page.locator('[data-chain="CH-9003"]')).toContainText('Facture supérieure à la commande');
  await noHorizontalOverflow(page);
  await nav(page, '#/prestataires');
  await expect(page.locator('[data-provider="prov_asc"]')).toContainText('Échantillon faible');
  await expect(page.locator('body')).not.toContainText(/défaillant/i);
  await noHorizontalOverflow(page);
});

test('assistant : réponse sourcée, présentée comme un moteur de règles', async ({ page }) => {
  await loginAs(page, 'dir_lea');
  await nav(page, '#/assistant');
  await expect(page.getByText('pas d’IA générative').first()).toBeVisible();
  await page.locator('[data-q="late"]').click();
  await expect(page.locator('[data-answer]')).toContainText('Synthèse');
  await expect(page.locator('[data-answer]')).toContainText('Source');
  await expect(page.locator('[data-answer]')).toContainText('Confiance');
});

test('périmètre et isolation : autre cabinet, périmètre limité, gestionnaire refusé', async ({ page }) => {
  await loginAs(page, 'dir_paul');
  await nav(page, '#/incidents?f=all');
  await expect(page.locator('#inc-count')).toHaveText('2 dossiers');
  await expect(page.locator('body')).not.toContainText('Victor-Hugo');
  await nav(page, '#/incidents/D-9001');
  await expect(page.getByRole('heading', { name: 'Introuvable' })).toBeVisible();

  await loginAs(page, 'dir_marc');
  await nav(page, '#/portefeuille');
  await expect(page.locator('[data-copro]')).toHaveCount(2);

  await loginAs(page, 'mgr_claire');
  await expect(page.getByRole('heading', { name: 'Accès réservé' })).toBeVisible();
});

test('mobile : navigation basse et menu « Plus »', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Navigation mobile');
  await loginAs(page, 'dir_lea');
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: /Équipe/ }).click();
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Supervision des gestionnaires' })).toBeVisible();
  await page.locator('#more').click();
  await page.locator('#sheet').getByRole('link', { name: 'Qualité' }).click();
  await ready(page);
  await expect(page.getByText('ne signifie pas que le résident est satisfait')).toBeVisible();
  await noHorizontalOverflow(page);
  const box = await nav.getByRole('link', { name: /Accueil/ }).boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
