/**
 * Président du conseil syndical : ce qu'il peut faire selon les délégations de la fiche,
 * et comparaison des devis. Séparation stricte : avis ≠ consultation ≠ décision habilitée.
 */
import type { BuildingConfig } from './config';

export type CouncilAction =
  | 'declare_problem'
  | 'record_observation'
  | 'request_verification'
  | 'request_quote'
  | 'compare_and_advise'
  | 'confirm_apparent_completion'
  | 'issue_reserves'
  | 'authorize_expenditure'
  | 'issue_purchase_order';

export interface Permission {
  allowed: boolean;
  reason: string;
}

export function presidentCan(action: CouncilAction, config: BuildingConfig, amountHT?: number): Permission {
  const p = config.councilPresident;
  if (!p) return { allowed: false, reason: 'Aucun président du conseil syndical renseigné pour cet immeuble.' };
  const d = p.delegations;
  switch (action) {
    case 'declare_problem':
    case 'record_observation':
    case 'request_verification':
      return { allowed: true, reason: 'Ouvert à tout membre autorisé de la copropriété.' };
    case 'request_quote':
      return d.requestQuotes
        ? { allowed: true, reason: 'Demande de proposition autorisée : elle n’engage pas la copropriété.' }
        : { allowed: false, reason: 'La fiche de l’immeuble ne prévoit pas de demande de devis par le président.' };
    case 'compare_and_advise':
      return d.compareAndAdvise
        ? { allowed: true, reason: 'Avis consultatif : il ne vaut pas attribution du marché.' }
        : { allowed: false, reason: 'Avis non prévu par la fiche de l’immeuble.' };
    case 'confirm_apparent_completion':
    case 'issue_reserves':
      return d.confirmCompletion
        ? { allowed: true, reason: 'Constat de bonne exécution apparente, distinct de la réception juridique.' }
        : { allowed: false, reason: 'Le président n’est pas désigné pour la vérification des travaux.' };
    case 'authorize_expenditure': {
      const a = d.authorizeExpenditure;
      if (!a) return { allowed: false, reason: 'Aucune délégation de dépense vérifiée : la décision revient au gestionnaire ou à l’assemblée.' };
      if (amountHT === undefined || !Number.isFinite(amountHT) || amountHT < 0) return { allowed: false, reason: 'Montant inconnu : impossible de vérifier le plafond de délégation.' };
      if (amountHT > a.ceilingHT) return { allowed: false, reason: `Montant au-delà du plafond délégué (${a.ceilingHT} € HT).` };
      return { allowed: true, reason: `Dans la délégation vérifiée (${a.verifiedReference}, plafond ${a.ceilingHT} € HT).` };
    }
    case 'issue_purchase_order':
      return { allowed: false, reason: 'La commande relève du syndic ou d’un mandataire habilité, pas du président.' };
  }
}

export interface Quote {
  company: string;
  amountHT: number;
  vatRate: number;
  delayDays: number | null;
  scope: string;
  warranty: string;
}

export interface QuoteRow extends Quote {
  amountTTC: number;
  lowestPrice: boolean;
  shortestDelay: boolean;
  missing: string[];
}

export interface QuoteComparison {
  rows: QuoteRow[];
  spreadHT: number;
  notes: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Compare des devis sans jamais désigner d'attributaire. */
export function compareQuotes(quotes: Quote[]): QuoteComparison {
  const valid = quotes.filter((q) => q.company.trim() && Number.isFinite(q.amountHT) && q.amountHT >= 0).slice(0, 10);
  const minHT = Math.min(...valid.map((q) => q.amountHT));
  const delays = valid.map((q) => q.delayDays).filter((x): x is number => typeof x === 'number');
  const minDelay = delays.length ? Math.min(...delays) : null;
  const rows = valid
    .map((q) => {
      const missing: string[] = [];
      if (!q.scope.trim()) missing.push('périmètre des travaux');
      if (q.delayDays === null) missing.push('délai');
      if (!q.warranty.trim()) missing.push('garanties');
      return {
        ...q,
        amountTTC: round2(q.amountHT * (1 + q.vatRate / 100)),
        lowestPrice: valid.length > 1 && q.amountHT === minHT,
        shortestDelay: valid.length > 1 && minDelay !== null && q.delayDays === minDelay,
        missing,
      };
    })
    .sort((a, b) => a.amountHT - b.amountHT);
  const notes: string[] = [];
  if (valid.length < 2) notes.push('Au moins deux devis sont recommandés pour comparer.');
  if (rows.some((r) => r.missing.length)) notes.push('Certains devis sont incomplets : comparer à périmètre équivalent.');
  notes.push('Comparaison indicative : elle ne vaut ni avis du conseil syndical ni décision d’attribution.');
  return { rows, spreadHT: valid.length ? round2(Math.max(...valid.map((q) => q.amountHT)) - minHT) : 0, notes };
}
