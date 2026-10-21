import { expect, test, type Page } from '@playwright/test';

/**
 * Laboratoire branché sur le moteur P1–P6.
 * Chaque test fixe la fiche de l'immeuble (gardien forcé en service par défaut) pour ne pas dépendre de l'heure.
 */

type Config = Record<string, any>; // any : fiche JSON modifiée librement dans les tests

const CONFIG_KEY = 'syndicplus-demo-building-v1';

async function open(page: Page, mutate?: (c: Config) => void) {
  const c = (await (await page.request.get('/api/procedures/demo-config')).json()) as Config;
  c.guardian.onDutyOverride = true;
  mutate?.(c);
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [CONFIG_KEY, JSON.stringify(c)] as const);
  await page.goto('/demo-lab.html');
  await page.waitForSelector('#issue-type option', { state: 'attached' });
}

const tab = (page: Page, id: string) => page.locator(`#${id}-tab`).click();
const btn = (page: Page, name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' });

async function report(page: Page, o: { as?: string; type?: string; description?: string; location?: string; danger?: string } = {}) {
  const as = o.as ?? 'resident';
  await tab(page, as);
  if (as !== 'resident') await page.locator(`#${as} summary`, { hasText: 'Signaler un problème' }).click();
  if (o.type) await page.locator('#issue-type').selectOption(o.type);
  if (o.location) await page.getByLabel('Emplacement').fill(o.location);
  if (o.description) await page.getByLabel('Description').fill(o.description);
  if (o.danger) await page.getByLabel('Danger immédiat ?').selectOption(o.danger);
  const before = await page.locator('#resident-cases article').count();
  await btn(page, 'Créer le signalement fictif').click();
  await expect(page.locator('#resident-cases article')).toHaveCount(before + 1);
}

const statusOf = (page: Page, host: string) => page.locator(`#${host}-cases article .status`).first();
const managerCount = (page: Page, i: number) => page.locator('#manager-cases .section-title .count').nth(i);

async function technicianCompletes(page: Page) {
  await tab(page, 'provider');
  await btn(page, 'Confirmer le début').click();
  await page.getByLabel('Compte rendu du technicien').fill('Remise en état, contrôle visuel réalisé');
  await page.getByLabel('Inspection visuelle effectuée').check();
  await btn(page, 'Marquer les travaux réalisés').click();
}

test.describe('P1 — petit entretien : gardien d’abord', () => {
  test('éclairage : gardien directement, réparation et clôture sans le gestionnaire', async ({ page }) => {
    await open(page);
    await report(page);
    await expect(statusOf(page, 'resident')).toHaveText('À traiter par le gardien');
    await tab(page, 'manager');
    await expect(managerCount(page, 0)).toHaveText('0');
    await expect(managerCount(page, 1)).toHaveText('0');
    await tab(page, 'guardian');
    await expect(page.locator('#guardian-cases')).toContainText('Vérifier sur place, puis réparer');
    await btn(page, 'Je prends en charge').click();
    await btn(page, 'Petite réparation effectuée').click();
    await tab(page, 'resident');
    await expect(statusOf(page, 'resident')).toHaveText('Clôturé');
    await expect(page.locator('#resident-cases article').first()).toContainText('gestionnaire non sollicité');
  });

  test('gardien ne peut pas réparer, estimation dans le plafond vérifié : affectation automatique', async ({ page }) => {
    await open(page);
    await report(page);
    await tab(page, 'guardian');
    await btn(page, 'Je prends en charge').click();
    await page.getByLabel('Estimation du coût').fill('120');
    await btn(page, 'Prestataire nécessaire').click();
    await tab(page, 'manager');
    await expect(managerCount(page, 1)).toHaveText('0');
    await tab(page, 'provider');
    await expect(page.locator('#provider-cases')).toContainText('Mission pour Élec Services (démo)');
    await technicianCompletes(page);
    // P1 : vérification par le gardien
    await tab(page, 'guardian');
    await btn(page, 'Travaux conformes').click();
    await tab(page, 'manager');
    await btn(page, 'Clôturer administrativement').click();
    await tab(page, 'resident');
    await expect(statusOf(page, 'resident')).toHaveText('Clôturé');
  });

  test('estimation au-delà du plafond : décision du gestionnaire, affectation préparée', async ({ page }) => {
    await open(page);
    await report(page);
    await tab(page, 'guardian');
    await btn(page, 'Je prends en charge').click();
    await page.getByLabel('Estimation du coût').fill('400');
    await btn(page, 'Prestataire nécessaire').click();
    await tab(page, 'manager');
    await expect(managerCount(page, 1)).toHaveText('1');
    await expect(btn(page, 'Valider l’affectation à Élec Services (démo)')).toBeVisible();
  });

  test('gardien hors service : le dossier ne l’attend pas', async ({ page }) => {
    await open(page, (c) => (c.guardian.onDutyOverride = false));
    await report(page);
    await expect(statusOf(page, 'resident')).toHaveText('Décision du gestionnaire');
    await tab(page, 'guardian');
    await expect(page.locator('#guardian-cases')).toContainText('Rien à faire');
  });

  test('le gardien qui signale lui-même traite directement, même hors service', async ({ page }) => {
    await open(page, (c) => (c.guardian.onDutyOverride = false));
    await report(page, { as: 'guardian' });
    await tab(page, 'guardian');
    await expect(statusOf(page, 'guardian')).toHaveText('À traiter par le gardien');
    await expect(page.locator('#guardian-cases article').first()).toContainText('Signalement enregistré par le gardien');
  });
});

test.describe('P5 — urgence : alertes parallèles, aucune attente', () => {
  test('fuite importante signalée par le président : urgence chez tous, astreinte proposée', async ({ page }) => {
    await open(page);
    await report(page, { as: 'council', type: 'fuite_majeure', description: 'Eau qui coule du plafond du hall' });
    await tab(page, 'manager');
    await expect(managerCount(page, 0)).toHaveText('1');
    await expect(page.locator('#manager-cases')).toContainText('Prévenus en parallèle : gestionnaire, président du conseil syndical, gardien en service, astreinte du prestataire');
    await tab(page, 'guardian');
    await expect(page.locator('#guardian-cases')).toContainText('Urgence : appliquez les consignes');
    await tab(page, 'council');
    await expect(page.locator('#council-cases')).toContainText('Information d’urgence');
    await tab(page, 'manager');
    await btn(page, 'Mise en sécurité confirmée').click();
    await btn(page, 'Valider l’affectation à Plomberie Rapide (démo)').click();
    await tab(page, 'provider');
    await expect(page.locator('#provider-cases')).toContainText('Plomberie Rapide (démo)');
  });

  test('un signe de danger dans la description fait passer en P5 au lieu du gardien', async ({ page }) => {
    await open(page);
    await report(page, { description: 'Odeur de brûlé au niveau du luminaire depuis ce matin' });
    await expect(statusOf(page, 'resident')).toHaveText('Urgence en cours');
  });

  test('le gardien signale un danger pendant son constat : bascule en urgence', async ({ page }) => {
    await open(page);
    await report(page);
    await tab(page, 'guardian');
    await btn(page, 'Je prends en charge').click();
    await btn(page, 'Danger / urgence').click();
    await tab(page, 'manager');
    await expect(managerCount(page, 0)).toHaveText('1');
  });
});

test.describe('P2 — maintenance sous contrat', () => {
  test('chauffage collectif : prestataire contractuel préautorisé, gestionnaire seulement informé', async ({ page }) => {
    await open(page);
    await report(page, { type: 'chauffage_collectif', description: 'Plus de chauffage dans tout le bâtiment depuis hier' });
    await expect(statusOf(page, 'resident')).toHaveText('Prestataire affecté');
    await tab(page, 'manager');
    await expect(managerCount(page, 1)).toHaveText('0');
    await tab(page, 'provider');
    await expect(page.locator('#provider-cases')).toContainText('Chauffage Plus (démo)');
  });

  test('préautorisation décochée dans la fiche : décision du gestionnaire', async ({ page }) => {
    await open(page, (c) => (c.contracts[1].preauthorization = null));
    await report(page, { type: 'chauffage_collectif', description: 'Plus de chauffage dans tout le bâtiment depuis hier' });
    await expect(statusOf(page, 'resident')).toHaveText('Décision du gestionnaire');
  });
});

test.describe('P3 — diagnostic, consultation, vérification par le président, réserves', () => {
  test('infiltration : consultation, travaux, réserves, reprise, nouvelle vérification, clôture', async ({ page }) => {
    await open(page);
    await report(page, { type: 'infiltration_toiture', location: 'Dernier étage, cage B', description: 'Traces d’humidité au plafond depuis une semaine' });
    await tab(page, 'council');
    await expect(page.locator('#council-cases')).toContainText('Vous êtes associé(e) à ce dossier');
    await tab(page, 'manager');
    await btn(page, 'Lancer une consultation (devis)').click();
    await btn(page, 'Affecter après consultation (simulation)').click();
    await technicianCompletes(page);
    await tab(page, 'manager');
    await expect(btn(page, 'Clôturer administrativement')).toHaveCount(0);
    await tab(page, 'council');
    await btn(page, 'Émettre des réserves').click();
    await tab(page, 'manager');
    await btn(page, 'Renvoyer au prestataire pour reprise').click();
    await tab(page, 'provider');
    await btn(page, 'Confirmer le début').click();
    await expect(page.getByLabel('Inspection visuelle effectuée')).not.toBeChecked();
    await page.getByLabel('Inspection visuelle effectuée').check();
    await btn(page, 'Marquer les travaux réalisés').click();
    await tab(page, 'manager');
    await expect(btn(page, 'Clôturer administrativement')).toHaveCount(0);
    await tab(page, 'council');
    await btn(page, 'Travaux conformes').click();
    await tab(page, 'manager');
    await btn(page, 'Clôturer administrativement').click();
    await tab(page, 'resident');
    await expect(statusOf(page, 'resident')).toHaveText('Clôturé');
    await expect(page.locator('#resident-cases article').first()).toContainText('reprise n°1 demandée');
  });
});

test.describe('fiche de l’immeuble', () => {
  test('délégation de dépense sans référence vérifiée : fiche refusée', async ({ page }) => {
    await open(page);
    await tab(page, 'building');
    await page.getByLabel('Plafond de délégation de dépense').fill('1000');
    await btn(page, 'Enregistrer la fiche').click();
    await expect(page.locator('#building-form .alert')).toContainText('Fiche refusée');
  });

  test('sans président : enregistrée, avec l’information manquante signalée', async ({ page }) => {
    await open(page);
    await tab(page, 'building');
    await page.getByLabel('Nom du président').fill('');
    await btn(page, 'Enregistrer la fiche').click();
    await expect(page.locator('#building-form .msg-ok')).toBeVisible();
    await expect(page.locator('#building-form')).toContainText('Président du conseil syndical non renseigné');
  });

  test('les explications du circuit et l’analyse guidée sont consultables', async ({ page }) => {
    await open(page);
    await report(page, { description: 'La lumière est en panne' });
    await tab(page, 'guardian');
    await page.locator('#guardian-cases summary', { hasText: 'Pourquoi ce circuit ?' }).click();
    await expect(page.locator('#guardian-cases')).toContainText('Mme Martin est en service');
    await expect(page.locator('#guardian-cases [data-analysis]')).toContainText('Règles locales');
  });
});

test('aucune erreur JavaScript, aucun débordement', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await report(page);
  for (const t of ['guardian', 'manager', 'provider', 'council', 'building']) await tab(page, t);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});
