import { test, expect } from '@playwright/test';
test('ampoule couloir : gardien traite sans passage gestionnaire',async ({page})=>{
 await page.goto('/demo-lab.html');
 await page.getByRole('button',{name:'Créer le signalement fictif'}).click();
 await page.getByRole('button',{name:'Gardien'}).click();
 await expect(page.locator('#guardian-cases')).toContainText('À vérifier par le gardien');
 await page.getByRole('button',{name:'Je prends en charge'}).click();
 await page.getByRole('button',{name:'Petite réparation effectuée'}).click();
 await page.getByRole('button',{name:'Résident',exact:true}).click();
 await expect(page.locator('#resident-cases')).toContainText('Clôturé');
});
test('gardien demande un prestataire préautorisé sans validation systématique du gestionnaire',async ({page})=>{
 await page.goto('/demo-lab.html');
 await page.getByRole('button',{name:'Créer le signalement fictif'}).click();
 await page.getByRole('button',{name:'Gardien'}).click();
 await page.getByRole('button',{name:'Je prends en charge'}).click();
 await page.getByRole('button',{name:'Prestataire nécessaire'}).click();
 await page.getByRole('button',{name:'Prestataire'}).click();
 await expect(page.locator('#provider-cases')).toContainText('Prestataire affecté');
});
