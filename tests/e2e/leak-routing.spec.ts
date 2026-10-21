import { test, expect } from '@playwright/test';

test('fuite ordinaire : gardien d’abord, président informé, puis prestataire préautorisé', async ({page})=>{
 await page.goto('/demo-lab.html');
 await page.getByLabel('Nature de la demande').selectOption('Fuite d’eau');
 await page.getByLabel('Description').fill('De l’eau coule doucement dans le couloir depuis hier');
 await page.getByRole('button',{name:'Créer le signalement fictif'}).click();
 await page.getByRole('button',{name:'Gardien'}).click();
 await expect(page.locator('#guardian-cases')).toContainText('À vérifier par le gardien');
 await page.getByRole('button',{name:'Je prends en charge'}).click();
 await page.getByRole('button',{name:'Prestataire nécessaire'}).click();
 await page.getByRole('button',{name:'Gestionnaire'}).click();
 await expect(page.locator('#manager-cases')).toContainText('Information président du conseil syndical');
 await page.getByRole('button',{name:'Appliquer le circuit configuré'}).click();
 await page.getByRole('button',{name:'Prestataire'}).click();
 await expect(page.locator('#provider-cases')).toContainText('Prestataire affecté');
});

test('une intervention au-dessus du plafond nécessite une validation',async ({page})=>{
 await page.goto('/demo-lab.html');
 await page.getByLabel('Nature de la demande').selectOption('Fuite d’eau');
 await page.getByLabel('Description').fill('Fuite légère au palier depuis hier');
 await page.getByRole('button',{name:'Créer le signalement fictif'}).click();
 await page.getByRole('button',{name:'Gardien'}).click();
 await page.getByRole('button',{name:'Je prends en charge'}).click();
 await page.getByRole('button',{name:'Prestataire nécessaire'}).click();
 await page.getByRole('button',{name:'Gestionnaire'}).click();
 await page.getByLabel('Estimation du coût pour Fuite d’eau').fill('500');
 await page.getByRole('button',{name:'Appliquer le circuit configuré'}).click();
 await expect(page.locator('#manager-cases')).toContainText('Devis / validation nécessaire');
 await page.getByRole('button',{name:'Valider le devis (simulation)'}).click();
 await page.getByRole('button',{name:'Prestataire'}).click();
 await expect(page.locator('#provider-cases')).toContainText('Prestataire affecté');
});
