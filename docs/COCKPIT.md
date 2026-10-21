# Cockpit du responsable de cabinet

Adresse : `/cabinet/`. Disponible en **préproduction et en local uniquement**, avec des personnes et des données **fictives**.
En production, l'identité de démonstration est désactivée (`DEMO_IDENTITY = "disabled"`) : l'API répond `401` et la page indique que le cockpit n'est pas encore ouvert.

## Principes

- **Superviser sans décider à la place des instances habilitées.** Le responsable demande un point, réaffecte un suivi, désigne un remplaçant, signale une priorité, demande une vérification, programme une revue, prépare une décision. Il n'approuve aucun devis, n'autorise aucune dépense et ne clôture aucun dossier depuis le cockpit.
- **Périmètre.** Le cabinet et les copropriétés viennent de la session, jamais du client. Un responsable peut avoir tout le cabinet (`scope_all`) ou une liste de copropriétés (`director_scopes`). Aucun accès à un autre cabinet.
- **Aucun chiffre inventé.** Tous les indicateurs sont calculés sur les lignes enregistrées. Une donnée absente est affichée « non renseignée ». Les signaux sont comptés, pas pondérés : aucun classement de personnes ni de copropriétés.
- **Prestataires.** Indicateurs factuels (délai de réponse médian, ponctualité renseignée, interventions sans résolution, réserves), avec avertissement sur la taille de l'échantillon. Le mot « défaillant » n'est jamais utilisé (test automatique).
- **Finances.** Une ligne par pièce et par étape : devis, dépense autorisée, commande, facture, paiement. Les étapes ne sont jamais déduites l'une de l'autre ; les écarts (facture supérieure à la commande, facture sans commande…) sont signalés.
- **Qualité.** Une clôture administrative n'est pas une satisfaction. La satisfaction n'est mesurée que sur les réponses reçues ; les commentaires ne sont affichés qu'avec consentement.
- **Assistant.** Moteur de **règles déterministes**, présenté comme tel (« pas d'IA générative »). Chaque réponse donne une synthèse, des faits avec leur source, un niveau de confiance justifié, des recommandations et une prochaine action — exécutée seulement sur clic.

## Pages

| Page | Contenu | Actions réelles |
|---|---|---|
| Vue globale | 8 indicateurs cliquables (liste filtrée), « Nécessite votre attention » : justification, dossiers liés, responsable, dernière mise à jour, sources | Action proposée sur chaque point |
| Portefeuille | Recherche, filtres, tri ; fiche copropriété (personnes, budget, payé sur 12 mois, contrats, dossiers, dépenses) | Programmer une revue |
| Équipe | Charge indicative, absences, remplacements, dossiers par gestionnaire | Désigner / changer un remplaçant |
| Centre incidents | Signaux automatiques : urgent, en retard, sans prochaine action, non affecté, responsable absent, intervention échouée, réserves non levées, récurrent, sans mise à jour, contesté, prioritaire ; fiche dossier avec historique, interventions, réserves, pièces, décisions | Demander un point, réaffecter, signaler prioritaire, demander une vérification, programmer une revue, préparer une décision |
| Finances & contrats | Totaux par étape, chaînes de pièces, décisions, contrats (préavis) | Consulter les pièces, programmer une revue |
| Prestataires | Indicateurs contextualisés, observations | Programmer une revue |
| Qualité | Taux de réponse, note moyenne, retours défavorables, rouverts, clôturés sans retour | Demander une vérification |
| Assistant | 9 questions | Prochaine action proposée |
| Journal & décisions | Journal d'audit (ajout seul), historique des décisions, revues | Exporter le rapport CSV |

## Garanties techniques

- Session de démonstration : cookie `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS, signé HMAC-SHA256 (`DEMO_SECRET`, secret Cloudflare), 8 h. Compte et cabinet doivent être marqués « démo ».
- Écritures : JSON obligatoire (protection inter-sites), validation serveur (`src/cockpit/actions.ts`), confirmation explicite pour réaffecter, désigner un remplaçant et préparer une décision, politique d'accès (`src/cockpit/policy.ts`).
- Chaque action écrit : historique interne du dossier (non visible du résident), `audit_log` (déclencheurs SQL : ni modification ni suppression, sauf régénération des cabinets de démonstration), notification **interne** aux personnes concernées. Aucun e-mail ni SMS.
- Les dossiers des cabinets sont exclus de l'API publique du prototype (`cabinet_id IS NULL`).
- Export CSV protégé contre l'injection de formules.

## Données de démonstration

Générées par `src/cockpit/seed.ts`, relativement à la date du jour (au premier login ou via « Régénérer » dans le Journal) :
Cabinet Horizon (Léa Fontaine, tout le cabinet ; Marc Roux, Les Tilleuls et Le Parc ; gestionnaires Claire, Hugo, Nadia — absente sans remplaçant), 5 copropriétés (dont une au nombre de lots non renseigné), 17 dossiers couvrant urgence en retard, dossier non affecté, interventions échouées, réserves anciennes, panne récurrente, dépassement de facture, contrats en préavis, retour défavorable ; Cabinet Exemple (Paul Martin) pour vérifier l'isolation.

## Mise en place sur un environnement

```bash
npx wrangler d1 migrations apply syndicplus-db-staging --env staging --remote   # migration 0002
openssl rand -hex 32 | npx wrangler secret put DEMO_SECRET --env staging
npm run deploy:staging
```

Ne jamais activer `DEMO_IDENTITY` en production. L'authentification réelle (Sprint 1) remplacera l'adaptateur `src/cockpit/identity.ts` sans changer la politique ni l'API.
