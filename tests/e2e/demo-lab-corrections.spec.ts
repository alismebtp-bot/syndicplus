import { expect, test } from '@playwright/test';

type Analysis = { priority: string; reasons: string[] };
type Evaluate = (type: string, location: string, description: string) => Analysis;

const evaluate = (page: import('@playwright/test').Page, description: string) =>
  page.evaluate(
    (d) => (window as unknown as { syndicDemoAnalysis: { evaluate: Evaluate } }).syndicDemoAnalysis.evaluate('Autre', 'Hall', d),
    description,
  );

test.describe('analyse guidée : mots accentués', () => {
  const dangers = [
    'Un enfant s’est électrocuté en touchant la prise',
    'Odeur de brûlé dans la cage d’escalier',
    'Le radiateur est brûlant',
    'Brûlure à la main en touchant le tableau',
    'Étincelles près du compteur',
    'Il y a de la fumée au 2e étage',
    'Une personne est coincée dans l’ascenseur',
    'L’ascenseur est bloqué avec quelqu’un dedans',
    'Forte odeur de gaz au rez-de-chaussée',
    'Incendie dans le local poubelles',
  ];
  for (const phrase of dangers) {
    test(`danger détecté : « ${phrase} »`, async ({ page }) => {
      await page.goto('/demo-lab.html');
      const a = await evaluate(page, phrase);
      expect(a.priority).toContain('Danger potentiel');
      expect(a.reasons.length).toBeGreaterThan(0);
    });
  }

  const ordinaires = [
    'Ampoule grillée au palier depuis hier',
    'Le chauffage est un peu faible dans le salon',
    'Porte du hall qui grince',
    'Gazon à tondre dans la cour',
  ];
  for (const phrase of ordinaires) {
    test(`pas de fausse alerte : « ${phrase} »`, async ({ page }) => {
      await page.goto('/demo-lab.html');
      const a = await evaluate(page, phrase);
      expect(a.priority).toBe('À qualifier');
    });
  }
});

test('les 4 onglets sont alignés en grille, sans onglet isolé ni débordement', async ({ page }) => {
  await page.goto('/demo-lab.html');
  const boxes = await page.locator('.tabs button').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
    }),
  );
  expect(boxes).toHaveLength(4);
  const widths = new Set(boxes.map((b) => b.w));
  expect(widths.size).toBe(1); // tous de la même largeur
  for (const b of boxes) expect(b.h).toBeGreaterThanOrEqual(44);
  const rows = new Set(boxes.map((b) => b.top));
  expect([1, 2]).toContain(rows.size); // une ligne de 4 ou une grille 2 × 2
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
