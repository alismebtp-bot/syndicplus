# Assistants IA

> **État actuel : aucun modèle d'IA n'est connecté.** Des **automatisations déterministes** sont en place (`src/procedures/automation.ts`) : doublons, dossiers bloqués, relances préparées, résumé de dossier, pannes récurrentes, analyse guidée par règles. Elles proposent toujours ; rien n'est fusionné, envoyé ou décidé sans validation humaine. Le modèle d'IA viendra les compléter (compréhension du texte libre, résumés d'échanges, pièces jointes) via l'interface `AIProvider`, le moteur P1–P6 restant seul juge des autorisations.

## 1. Quatre capacités autour du même dossier

| Assistant | Rôle | Exemples de sorties |
|---|---|---|
| **Résident** | Comprendre la demande, poser les questions manquantes, informer, recueillir la satisfaction | « Depuis quand ? Un seul radiateur ou tout l'appartement ? » |
| **Gestionnaire** | Analyser, résumer documents et échanges, détecter les blocages, préparer décisions et relances | Résumé en 5 lignes avec sources ; brouillon de relance |
| **Copropriété** | Historique des équipements, pannes récurrentes, préparation des analyses économiques | « 4ᵉ panne d'ascenseur en 6 mois — voir D-1012, D-1040… » |
| **Coordination** | Suivre les échéances, préparer les communications, faire avancer les dossiers | Liste des dossiers sans action depuis 7 jours |

Toutes les sorties sont rattachées à un dossier et enregistrées dans `propositions_ia` avec : contenu, sources, modèle utilisé, date, statut (proposée / acceptée / refusée / modifiée) et personne qui a validé.

## 2. Niveaux d'autonomie

| Niveau | Principe | V1 |
|---|---|---|
| 1 — Assistance | L'IA propose, le gestionnaire valide | **Oui** |
| 2 — Coordination | L'IA envoie les informations de suivi et les relances administratives **explicitement autorisées** par une règle activée par le cabinet | **Oui** (Sprint 4) |
| 3 — Actions préautorisées | Petites interventions déclenchées selon des règles contractuelles et financières approuvées | **Non** |

**Interdits absolus, quel que soit le niveau** : engager une dépense, approuver un devis, prendre ou communiquer une décision juridique, clôturer un dossier, partager une donnée hors des droits du destinataire.

## 3. Garde-fous techniques

- **Injection de prompt** : signalements, e-mails, PDF et comptes rendus sont des *données*, jamais des instructions. Ils sont passés dans des blocs délimités ; le modèle n'a accès à aucun outil qui écrit ou envoie ; ses sorties sont du JSON validé par schéma (Zod). Toute action proposée passe par la validation humaine ou une règle de niveau 2 vérifiée côté serveur.
- **Sources obligatoires** pour toute recommandation importante (référence du document, du message ou du dossier, date). Une recommandation sans source est affichée comme « non étayée ».
- **Moindre donnée** : seules les informations du dossier et de la copropriété concernés sont envoyées, jamais celles d'un autre cabinet.
- **Indépendance fournisseur** : interface `AIProvider { complete(), extract(), embed() }` avec adaptateurs Anthropic, OpenAI, Workers AI ; choix par configuration.
- **Pas d'entraînement** sur les données clients ; fournisseurs configurés sans conservation pour entraînement ; mention dans les conditions et le registre RGPD.
- **Traçabilité** : chaque appel est journalisé (dossier, finalité, modèle, durée, coût), sans stocker de secret.
- **Économies** : l'IA distingue toujours *démontrées* (factures, relevés) et *estimées* (hypothèses explicites).
- **Évaluation** : jeu de cas de test (signalements réels anonymisés avec l'accord du cabinet) pour mesurer classification et résumés avant chaque changement de modèle.
