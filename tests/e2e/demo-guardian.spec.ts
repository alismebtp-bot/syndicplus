import { test, expect } from '@playwright/test';

test('gardien répare un éclairage, gestionnaire valide la clôture', async ({ page }) => {
  await page.goto('/demo-lab.html');
  await page.getByRole('button', { name: 'Créer le signalement fictif' }).click();
  await page.getByRole('button', { name: 'Gestionnaire' }).click();
  await page.getByRole('button', { name: 'Demander une vérification au gardien' }).click();
  await page.getByRole('button', { name: 'Gardien' }).click();
  await page.getByRole('button', { name: 'Je prends en charge' }).click();
  await page.getByRole('button', { name: 'Petite réparation effectuée' }).click();
  await page.getByRole('button', { name: 'Gestionnaire' }).click();
  await page.getByRole('button', { name: 'Valider la clôture' }).click();
  await page.getByRole('button', { name: 'Résident', exact: true }).click();
  await expect(page.locator('#resident-cases')).toContainText('Clôturé');
});

test('gardien ne peut pas réparer et le gestionnaire affecte un prestataire', async ({ page }) => {
  await page.goto('/demo-lab.html');
  await page.getByRole('button', { name: 'Créer le signalement fictif' }).click();
  await page.getByRole('button', { name: 'Gestionnaire' }).click();
  await page.getByRole('button', { name: 'Demander une vérification au gardien' }).click();
  await page.getByRole('button', { name: 'Gardien' }).click();
  await page.getByRole('button', { name: 'Je prends en charge' }).click();
  await page.getByRole('button', { name: 'Prestataire nécessaire' }).click();
  await page.getByRole('button', { name: 'Gestionnaire' }).click();
  await page.getByRole('button', { name: 'Affecter au prestataire après contrôle' }).click();
  await page.getByRole('button', { name: 'Prestataire' }).click();
  await expect(page.locator('#provider-cases')).toContainText('Prestataire affecté');
});
