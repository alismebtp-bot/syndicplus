import { expect, test, type Page } from '@playwright/test';

/** Président du conseil syndical : constats, vérifications, devis, avis, délégations — jamais de commande. */

type Config = Record<string, any>; // any : fiche JSON modifiée librement dans les tests

async function open(page: Page, mutate?: (c: Config) => void) {
  const c = (await (await page.request.get('/api/procedures/demo-config')).json()) as Config;
  c.guardian.onDutyOverride = true;
  mutate?.(c);
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), ['syndicplus-demo-building-v1', JSON.stringify(c)] as const);
  await page.goto('/demo-lab.html');
  await page.waitForSelector('body[data-ready="true"]');
}
const tab = (page: Page, id: string) => page.locator(`#${id}-tab`).click();
const btn = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const council = (page: Page) => page.locator('#council-cases');

async function infiltrationReportedByPresident(page: Page) {
  await tab(page, 'council');
  await page.locator('#council summary', { hasText: 'Signaler un problème' }).click();
  await page.locator('#issue-type').selectOption('infiltration_toiture');
  await page.getByLabel('Emplacement').fill('Dernier étage, cage B');
  await page.getByLabel('Description').fill('Traces d’humidité au plafond depuis une semaine');
  await btn(page, 'Créer le signalement fictif').click();
  await expect(council(page)).toContainText('Recueillez et comparez les devis');
}

async function addQuote(page: Page, company: string, amount: string, delay: string) {
  await page.getByLabel('Entreprise du devis').fill(company);
  await page.getByLabel('Montant HT du devis').fill(amount);
  await page.getByLabel('Délai en jours').fill(delay);
  await page.getByLabel('Périmètre des travaux').fill('Reprise de l’étanchéité');
  await page.getByLabel('Garanties').fill('Décennale');
  await btn(page, 'Enregistrer le devis reçu').click();
  // Attendre la confirmation réelle (historique), pas un texte déjà présent ailleurs
  await expect(council(page)).toContainText(`Devis reçu et enregistré par le président : ${company}`);
}

test('le président sollicite, compare, donne un avis ; le gestionnaire retient et commande', async ({ page }) => {
  await open(page);
  await infiltrationReportedByPresident(page);
  await page.getByLabel('Entreprise à solliciter').fill('Toitures Martin (démo)');
  await btn(page, 'Demander un devis').click();
  await expect(council(page)).toContainText('Sollicitées : Toitures Martin (démo)');
  await addQuote(page, 'Toitures Martin (démo)', '4200', '30');
  await addQuote(page, 'Étanchéité Pro (démo)', '3800', '45');
  await expect(council(page).locator('.quote-row').first()).toContainText('Étanchéité Pro (démo)');
  await expect(council(page)).toContainText('Prix le plus bas');
  await expect(council(page)).toContainText('ni décision d’attribution');
  await page.getByLabel('Avis consultatif').fill('Les deux offres sont comparables ; préférence pour le délai le plus court.');
  await page.getByLabel('Préférence').selectOption('Toitures Martin (démo)');
  await btn(page, 'Transmettre l’avis au gestionnaire').click();
  // Le président ne peut jamais commander
  await expect(council(page).getByRole('button', { name: /commander/i })).toHaveCount(0);
  await tab(page, 'manager');
  await expect(page.locator('#manager-cases')).toContainText('Avis consultatif du président');
  await expect(page.locator('#manager-cases')).toContainText('ne vaut ni décision du conseil syndical ni attribution');
  await btn(page, 'Retenir Toitures Martin (démo) et commander').click();
  await tab(page, 'provider');
  await expect(page.locator('#provider-cases')).toContainText('Mission pour Toitures Martin (démo)');
});

test('sans délégation de devis : la demande est refusée avec la raison', async ({ page }) => {
  await open(page, (c) => (c.councilPresident.delegations.requestQuotes = false));
  await infiltrationReportedByPresident(page);
  await expect(btn(page, 'Demander un devis')).toHaveCount(0);
  await expect(council(page)).toContainText('ne prévoit pas de demande de devis');
});

test('délégation de dépense vérifiée : autorisation dans le plafond seulement, commande au gestionnaire', async ({ page }) => {
  await open(page, (c) => (c.councilPresident.delegations.authorizeExpenditure = { ceilingHT: 4000, verifiedReference: 'Délibération AG 2026 n°7 (démo)' }));
  await infiltrationReportedByPresident(page);
  await addQuote(page, 'Toitures Martin (démo)', '4200', '30');
  await addQuote(page, 'Étanchéité Pro (démo)', '3800', '45');
  await btn(page, 'Autoriser Toitures Martin (démo) (4200 € HT)').click();
  await expect(council(page)).toContainText('Autorisation impossible : Montant au-delà du plafond délégué');
  await btn(page, 'Autoriser Étanchéité Pro (démo) (3800 € HT)').click();
  await tab(page, 'manager');
  await expect(page.locator('#manager-cases .msg-ok')).toContainText('Autorisé par le président dans sa délégation');
  await expect(page.locator('#manager-cases .msg-ok')).toContainText('La commande reste à passer par vous');
});

test('sans délégation de dépense : aucun bouton d’autorisation', async ({ page }) => {
  await open(page);
  await infiltrationReportedByPresident(page);
  await addQuote(page, 'Toitures Martin (démo)', '4200', '30');
  await expect(council(page).getByRole('button', { name: /^Autoriser/ })).toHaveCount(0);
});

test('constat du président et demande de vérification au gardien', async ({ page }) => {
  await open(page);
  // Un dossier P2 suivi par le président (impact collectif)
  await page.locator('#issue-type').selectOption('ascenseur');
  await page.getByLabel('Description').fill('Ascenseur à l’arrêt au rez-de-chaussée');
  await btn(page, 'Créer le signalement fictif').click();
  await tab(page, 'council');
  await council(page).locator('summary', { hasText: 'Constat ou demande de vérification' }).first().click();
  await page.getByLabel('Votre constat').fill('Portes bloquées, affichage éteint');
  await btn(page, 'Enregistrer le constat').click();
  await expect(council(page)).toContainText('Constat du président du CS : Portes bloquées');
  // La section reste ouverte après l'enregistrement
  await btn(page, 'Demander une vérification au gardien').click();
  await tab(page, 'guardian');
  await expect(page.locator('#guardian-cases')).toContainText('Le président du conseil syndical demande une vérification');
  await page.getByLabel('Constat du gardien').fill('Confirmé, ascensoriste attendu');
  await btn(page, 'Constat effectué').click();
  await tab(page, 'resident');
  const article = page.locator('#resident-cases article').first();
  await expect(article).toContainText('Constat du président du CS : Portes bloquées');
  await expect(article).toContainText('Gardien : constat effectué à la demande du président');
});
