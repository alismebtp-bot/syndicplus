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

test('onglets : une ligne égale sur ordinateur, grille complète sur mobile, aucun onglet isolé', async ({ page }) => {
  await page.goto('/demo-lab.html');
  const boxes = await page.locator('.tabs button').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
    }),
  );
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  for (const b of boxes) expect(b.h).toBeGreaterThanOrEqual(44);
  const width = page.viewportSize()!.width;
  const rows = [...new Set(boxes.map((b) => b.top))];
  if (width > 650) {
    expect(rows).toHaveLength(1);
    expect(new Set(boxes.map((b) => b.w)).size).toBe(1);
  } else {
    // Deux colonnes ; si le nombre est impair, le dernier onglet occupe toute la ligne.
    const full = Math.max(...boxes.map((b) => b.x + b.w)) - Math.min(...boxes.map((b) => b.x));
    for (const top of rows) {
      const row = boxes.filter((b) => b.top === top);
      const used = row.reduce((s, b) => s + b.w, 0);
      expect(used).toBeGreaterThanOrEqual(full - 16); // ligne remplie (à l'espacement près)
    }
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
