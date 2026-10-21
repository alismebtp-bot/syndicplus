import { expect, test, type Page } from '@playwright/test';

/** Automatisations : doublons, dossiers bloqués et relances préparées, pannes récurrentes. Toujours des propositions. */

type Config = Record<string, any>; // any : fiche JSON modifiée librement dans les tests

async function open(page: Page) {
  const c = (await (await page.request.get('/api/procedures/demo-config')).json()) as Config;
  c.guardian.onDutyOverride = true;
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ['syndicplus-demo-building-v1', JSON.stringify(c)] as const);
  await page.goto('/demo-lab.html');
  await page.waitForSelector('body[data-ready="true"]');
}
const tab = (page: Page, id: string) => page.locator(`#${id}-tab`).click();
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const cards = (page: Page) => page.locator('#resident-cases article');
const section = (page: Page, title: string) => page.locator('#manager-cases .section-title', { hasText: title }).locator('.count');

test('doublon : proposé, ajouté au dossier existant sans créer de second dossier', async ({ page }) => {
  await open(page);
  await btn(page, 'Créer le signalement fictif').click();
  await expect(cards(page)).toHaveCount(1);
  await page.getByLabel('Emplacement').fill('couloir 3ème étage');
  await page.getByLabel('Description').fill('Plus de lumière dans le couloir');
  await btn(page, 'Créer le signalement fictif').click();
  await expect(page.locator('#duplicate-box')).toContainText('Ce problème semble déjà signalé');
  await expect(page.locator('#duplicate-box')).toContainText('Même emplacement');
  await btn(page, 'Ajouter mon signalement à ce dossier').click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText('Signalement associé (un résident) : Plus de lumière dans le couloir');
});

test('doublon refusé : un nouveau dossier est créé', async ({ page }) => {
  await open(page);
  await btn(page, 'Créer le signalement fictif').click();
  await btn(page, 'Créer le signalement fictif').click();
  await btn(page, 'Non, créer un nouveau dossier').click();
  await expect(cards(page)).toHaveCount(2);
});

test('dossier bloqué : relance préparée, validée par le gestionnaire, jamais envoyée seule', async ({ page }) => {
  await open(page);
  await btn(page, 'Créer le signalement fictif').click();
  await tab(page, 'manager');
  await expect(section(page, 'À relancer')).toHaveText('0');
  await tab(page, 'building');
  await page.getByLabel('Avancer l’horloge de la démo').selectOption({ label: '+3 jours' });
  await tab(page, 'manager');
  await expect(section(page, 'À relancer')).toHaveText('1');
  await page.locator('#manager-review summary', { hasText: 'Voir la relance préparée' }).click();
  await expect(page.locator('#manager-review')).toContainText('Relance — Éclairage des parties communes');
  await expect(page.locator('#manager-review')).toContainText('Mme Martin (gardien)');
  await btn(page, 'Valider la relance (simulation)').click();
  await expect(section(page, 'À relancer')).toHaveText('0');
  await tab(page, 'resident');
  await expect(cards(page).first()).toContainText('Relance validée par le gestionnaire pour Mme Martin (gardien) (simulation, aucun envoi)');
});

test('panne récurrente : 3 signalements au même endroit', async ({ page }) => {
  await open(page);
  for (let i = 0; i < 3; i++) {
    await btn(page, 'Créer le signalement fictif').click();
    if (i > 0) await btn(page, 'Non, créer un nouveau dossier').click();
    await expect(cards(page)).toHaveCount(i + 1);
  }
  await tab(page, 'manager');
  await expect(page.locator('#manager-review')).toContainText('Éclairage des parties communes : 3 signalements en 90 jours');
});

test('double clic sur « Créer » : un seul dossier', async ({ page }) => {
  await open(page);
  await btn(page, 'Créer le signalement fictif').dblclick();
  await expect(cards(page)).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(cards(page)).toHaveCount(1);
});
