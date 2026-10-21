import { test, expect } from '@playwright/test';
test('les six rôles possèdent un aperçu mobile lisible et des actions adaptées', async ({page})=>{
 await page.goto('/role-mobile-preview.html');
 for(const label of ['Résident','Gardien','Président du CS','Gestionnaire','Prestataire','Responsable cabinet']){
   await page.getByRole('button',{name:label,exact:true}).click();
   await expect(page.locator('#role-caption')).toHaveText(label);
   await expect(page.locator('#mobile-body .card').first()).toBeVisible();
   await page.getByRole('button',{name:/Ouvrir le dossier/}).first().click();
   await expect(page.getByText('Prochaine action :',{exact:false})).toBeVisible();
   await expect(page.getByRole('heading',{name:'Actions disponibles'})).toBeVisible();
   await page.getByRole('button',{name:'← Retour aux dossiers'}).click();
   await expect(page.locator('#mobile-body .primary').first()).toBeVisible();
   await page.locator('#mobile-body .primary').first().click();
   await expect(page.locator('#notice')).not.toBeEmpty();
 }
 await page.getByRole('button',{name:'Messages'}).click();
 await expect(page.getByText('Aucun nouveau message fictif')).toBeVisible();
 await page.getByRole('button',{name:'Dossiers'}).click();
 await expect(page.locator('#mobile-body .card').first()).toBeVisible();
});
