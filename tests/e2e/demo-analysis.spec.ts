import { test, expect } from '@playwright/test';

test('analyse guidée : informations manquantes sans prétendre à une IA réelle', async ({page})=>{
  await page.goto('/demo-lab.html');
  await page.getByLabel('Emplacement').fill('Bâtiment B');
  await page.getByLabel('Description').fill('La lumière est en panne');
  await page.getByRole('button',{name:'Créer le signalement fictif'}).click();
  await page.getByRole('button',{name:'Gestionnaire'}).click();
  const analysis=page.locator('#manager-cases [data-analysis]').first();
  await expect(analysis).toContainText('Éclairage');
  await expect(analysis).toContainText('Préciser depuis quand');
  await expect(analysis).toContainText('Règles locales');
});
test('une situation dangereuse ne déclenche pas automatiquement de mission',async ({page})=>{
  await page.goto('/demo-lab.html');
  await page.getByLabel('Description').fill('Fumée au tableau électrique depuis hier');
  await page.getByRole('button',{name:'Créer le signalement fictif'}).click();
  await page.getByRole('button',{name:'Gestionnaire'}).click();
  await expect(page.locator('#manager-cases [data-analysis]').first()).toContainText('Danger potentiel');
  await expect(page.locator('#manager-cases [data-analysis]').first()).toContainText('prévenir immédiatement un humain');
  await expect(page.locator('#provider-cases')).not.toContainText('Fumée au tableau');
});
