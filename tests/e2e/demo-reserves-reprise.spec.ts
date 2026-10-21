import { expect, test, type Page } from '@playwright/test';

const tab = (page: Page, id: string) => page.locator(`#${id}-tab`).click();
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function jusquaVerification(page: Page) {
  await page.goto('/demo-lab.html');
  await page.getByLabel('Nature de la demande').selectOption('Chauffage');
  await btn(page, 'Créer le signalement fictif').click();
  await tab(page, 'manager');
  await btn(page, 'Affecter au prestataire (simulation)').click();
  await tab(page, 'provider');
  await btn(page, 'Confirmer le début').click();
  await page.getByLabel('Compte rendu du technicien').fill('Purge des radiateurs, contrôle visuel réalisé');
  await page.getByLabel('Inspection visuelle effectuée').check();
  await btn(page, 'Marquer les travaux réalisés').click();
}

test('réserves : renvoi au prestataire, reprise, nouvelle vérification puis clôture', async ({ page }) => {
  await jusquaVerification(page);

  // Le président du CS émet des réserves
  await tab(page, 'council');
  await btn(page, 'Émettre des réserves').click();

  // Le prestataire voit le dossier en attente, sans action
  await tab(page, 'provider');
  await expect(page.locator('#provider-cases')).toContainText('en attente de la décision du gestionnaire');

  // Le gestionnaire renvoie au prestataire
  await tab(page, 'manager');
  await expect(btn(page, 'Clôturer administrativement')).toHaveCount(0);
  await btn(page, 'Renvoyer au prestataire pour reprise').click();
  await expect(page.locator('#manager-cases .status').first()).toHaveText('Prestataire affecté');

  // Reprise : les contrôles précédents sont effacés et doivent être refaits
  await tab(page, 'provider');
  await btn(page, 'Confirmer le début').click();
  await expect(page.getByLabel('Inspection visuelle effectuée')).not.toBeChecked();
  await btn(page, 'Marquer les travaux réalisés').click();
  await expect(page.locator('#provider-cases')).toContainText('confirmez le contrôle visuel');
  await page.getByLabel('Inspection visuelle effectuée').check();
  await btn(page, 'Marquer les travaux réalisés').click();

  // L'ancienne décision ne suffit pas : une nouvelle vérification est exigée
  await tab(page, 'manager');
  await expect(page.locator('#manager-cases .status').first()).toHaveText('À vérifier sur place');
  await expect(btn(page, 'Clôturer administrativement')).toHaveCount(0);

  await tab(page, 'council');
  await btn(page, 'Travaux conformes').click();
  await tab(page, 'manager');
  await btn(page, 'Clôturer administrativement').click();

  await tab(page, 'resident');
  const dossier = page.locator('#resident-cases article').first();
  await expect(dossier.locator('.status')).toHaveText('Clôturé');
  await expect(dossier).toContainText('reprise n°1 demandée');
});

test('le renvoi au prestataire n’apparaît que sur un dossier en réserves', async ({ page }) => {
  await jusquaVerification(page);
  await tab(page, 'manager');
  await expect(btn(page, 'Renvoyer au prestataire pour reprise')).toHaveCount(0);
});
