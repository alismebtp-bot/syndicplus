import {test,expect} from '@playwright/test';
test('dix pages secondaires accessibles sans altérer la page d accueil',async({page})=>{
 await page.goto('/secondary-pages.html');
 const picker=page.locator('#screen-select');
 await expect(picker.locator('option')).toHaveCount(10);
 for(let i=0;i<10;i++){await picker.selectOption(String(i));await expect(page.locator('#heading')).not.toBeEmpty();await expect(page.locator('.item').first()).toBeVisible();await page.locator('.actions button').first().click();await expect(page.getByRole('status')).toContainText('Simulation')}
 await page.goto('/');await expect(page.locator('body')).toBeVisible();
});
