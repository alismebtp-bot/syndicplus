import { test, expect } from '@playwright/test';
test('le gardien peut préparer un constat en français par écrit',async({page})=>{
 await page.goto('/guardian-report-preview.html');
 await expect(page.getByRole('button',{name:'Écrire'})).toHaveAttribute('aria-pressed','true');
 await page.locator('#report').fill('Ampoule grillée dans le couloir.');
 await page.locator('#location').fill('Bâtiment B, 2e étage');
 await page.getByRole('button',{name:'Préparer le constat'}).click();
 await expect(page.locator('#summary')).toContainText('Ampoule grillée');
 await page.getByRole('button',{name:'Confirmer le brouillon'}).click();
 await expect(page.locator('#result')).toContainText('Aucune transmission réelle');
});
test('la dictée française est facultative et le texte reste utilisable',async({page})=>{
 await page.goto('/guardian-report-preview.html');
 await page.getByRole('button',{name:'Dicter en français'}).click();
 await expect(page.getByRole('button',{name:'Dicter en français'})).toHaveAttribute('aria-pressed','true');
 await page.locator('#report').fill('Porte bloquée');
 await page.locator('#location').fill('Hall');
 await page.getByRole('button',{name:'Préparer le constat'}).click();
 await expect(page.locator('#summary')).toContainText('Porte bloquée');
});