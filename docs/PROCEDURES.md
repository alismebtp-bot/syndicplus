# Moteur de parcours P1–P6

Code : `src/procedures/` · Tests : `tests/unit/procedures.test.ts`, `tests/api/procedures.test.ts`
Statut : **fonctionnel côté serveur (calcul)**, sans envoi réel, sans écriture en base. Il propose un circuit ; il n'engage rien.

## Principe

Chaque problème est dirigé vers la bonne personne, au bon moment, sans passage inutile par le gestionnaire.
Le parcours dépend de trois choses, dans cet ordre :

1. **Le danger** : tout signal de danger fait passer en **P5**, quel que soit le type.
2. **Le type d'incident** : 36 scénarios de référence + « autre » (`catalog.ts`), chacun avec un parcours par défaut.
3. **La fiche de l'immeuble** (`config.ts`) : gardien et horaires, remplaçant, contrats, préautorisations vérifiées, président du CS et délégations, astreinte.

| Parcours | Premier destinataire | Gestionnaire | Président du CS |
|---|---|---|---|
| P1 Petit entretien | Gardien en service et autorisé (ou remplaçant). Sinon contrat préautorisé, sinon gestionnaire | Aucun rôle si le gardien résout | — |
| P2 Maintenance sous contrat | Prestataire du contrat si préautorisation **vérifiée** ; sinon affectation préparée | Informé, ou décide si pas de préautorisation | Informé si impact collectif |
| P3 Diagnostic et devis | Gestionnaire (décision) ; constat du gardien possible | Décide | Consulté : demandes de devis, comparaison, avis selon délégations |
| P4 Sinistre | Gestionnaire (assurance) | Décide | Informé si parties communes |
| P5 Urgence | Mise en sécurité immédiate + astreinte | **Prévenu en parallèle** | **Prévenu en parallèle** (gardien aussi s'il est en service) |
| P6 Travaux importants | Gestionnaire / procédure projet | Décide selon AG et délégations | Consulté |

## Règles de sécurité du moteur

- **Pas d'information fiable ou d'autorisation ⇒ pas d'engagement automatique.** Une préautorisation sans référence n'est jamais « vérifiée » ; un montant inconnu ne permet pas d'utiliser un plafond.
- **P5 n'attend personne** : les alertes sont parallèles, sans accusé de réception préalable.
- **Le président du CS** peut déclarer, constater, demander une vérification, solliciter des devis, comparer, donner un avis, confirmer la bonne exécution apparente et émettre des réserves **selon sa fiche**. Il ne passe jamais de commande ; il n'autorise une dépense qu'avec une délégation vérifiée et dans son plafond.
- **Vérification de bonne exécution** : gardien (P1/P2) ou président (P3/P6) désignés, sinon gestionnaire. Ce n'est pas une réception juridique.
- Chaque décision renvoie ses **raisons**, les **informations manquantes**, la **prochaine action**, un **délai** et un **repli**.

## API (sans état)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/procedures/catalog` | Parcours et types d'incidents |
| GET | `/api/procedures/demo-config` | Fiche de démonstration |
| POST | `/api/procedures/route` | `{typeId, reportedBy, dangerSignals?, config?, now?}` → décision |
| POST | `/api/procedures/after-guardian` | `{typeId, estimateHT?, dangerSignals?, config?}` → contrat préautorisé ou gestionnaire |
| POST | `/api/procedures/president-permission` | `{action, amountHT?, config?}` → autorisé ou non, avec la raison |
| POST | `/api/procedures/compare-quotes` | `{quotes:[…]}` → comparaison indicative, sans attributaire |

## Reprise des travaux antérieurs

- PR #21 : table des 36 scénarios et règles P1–P6 (reprise, vérifiée par test).
- PR #14 : garde-fous (gardien en service vs présent, remplaçant, astreinte) intégrés.
- PR #17 / #20 : « gardien d'abord » et plafond de préautorisation, désormais issus du moteur et non d'exceptions par type.

La documentation et le moteur ne valent ni contrôle juridique d'un mandat ni décision de travaux.
