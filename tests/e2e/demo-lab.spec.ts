import { expect, test } from '@playwright/test';

test('laboratoire démo : signalement, affectation, intervention et clôture', async ({ page }) => {
  await page.goto('/demo-lab.html');
  await expect(page.getByRole('heading', { name: 'Tester une intervention de bout en bout' })).toBeVisible();

  await page.getByRole('button', { name: 'Créer le signalement fictif' }).click();
  await expect(page.locator('#resident-cases')).toContainText('À qualifier');

  await page.getByRole('button', { name: 'Gestionnaire' }).click();
  await page.getByRole('button', { name: 'Affecter au prestataire (simulation)' }).click();
  await expect(page.locator('#manager-cases')).toContainText('Prestataire affecté');

  await page.getByRole('button', { name: 'Prestataire' }).click();
  await page.getByRole('button', { name: 'Confirmer le début' }).click();
  await page.getByLabel('Compte rendu du technicien').fill('Luminaire remplacé et contrôles effectués.');
  await page.getByLabel('Inspection visuelle effectuée').check();
  await page.getByRole('button', { name: 'Marquer les travaux réalisés' }).click();

  await page.getByRole('button', { name: 'Gardien' }).click();
  await page.getByRole('button', { name: 'Travaux conformes' }).click();
  await page.getByRole('button', { name: 'Gestionnaire' }).click();
  await page.getByRole('button', { name: 'Clôturer administrativement' }).click();
  await page.getByRole('button', { name: 'Résident' }).click();
  await expect(page.locator('#resident-cases')).toContainText('Clôturé');
  await page.reload();
  await expect(page.locator('#resident-cases')).toContainText('Clôturé');
});
