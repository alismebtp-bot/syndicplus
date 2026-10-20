# Parcours utilisateurs

## 1. Parcours actuel (prototype v0.3, testé par `tests/e2e/parcours-dossier.spec.ts`)

```
Résident (appareil A)              API + D1                     Syndic (appareil B)
─────────────────────              ────────                     ───────────────────
Signaler un problème ──POST──▶ dossier « À qualifier »
                                  + historique ──── 10 s ────▶ Apparaît dans « À traiter »
                                                               Choisit un statut + note
                               ◀──POST updates─────────────── « Enregistrer et partager »
Suivre mes demandes ◀── 10 s ── statut + historique mis à jour
```

Limites : pas d'identité (tout le monde voit tout), pas de prestataire, pas d'IA, pas de notification.

## 2. Parcours prioritaire cible (V1)

| # | Étape | Acteur | Statut du dossier | Sprint |
|---|---|---|---|---|
| 1 | Signale un problème (web ou QR code) | Résident authentifié | `nouveau` | 1 |
| 2 | Dossier créé en base, rattaché à la copropriété et au cabinet | Système | `nouveau` | 1 |
| 3 | Reçoit la demande dans « Votre journée » | Gestionnaire | `a_qualifier` | 1 |
| 4 | Analyse, résume, propose catégorie / priorité / doublons, **avec sources** | IA (niveau 1) | `a_qualifier` | 3 |
| 5 | Valide le traitement (accepte ou corrige la proposition) | Gestionnaire | `qualifie` | 1 (manuel) → 3 (avec IA) |
| 6 | Reçoit une mission | Prestataire | `mission_envoyee` | 2 |
| 7 | Accepte, confirme le rendez-vous, envoie photos et rapport, ou signale un blocage | Prestataire | `planifie` → `en_intervention` → `intervention_terminee` / `bloque` | 2 |
| 8 | Reçoit les informations autorisées (rendez-vous, avancement, fin) | Résident | — | 2 (écran) → 4 (e-mail) |
| 9 | Prépare le rapport de clôture | IA (niveau 1) | `a_verifier` | 3 |
| 10 | Vérifie et clôture ; satisfaction demandée au résident | Gestionnaire | `clos` | 2 (manuel) → 3 |

Chaque transition est historisée (acteur, date, ancien et nouveau statut) et contrôlée côté serveur par rôle : un résident ne peut pas clôturer, un prestataire ne voit que ses missions, l'IA ne fait jamais une transition qui engage une dépense ou une décision.

## 3. Écrans par rôle (cible)

- **Résident** : accueil hybride validé (information importante, « Signaler un problème », « Suivre mes demandes », dernière demande, « Besoin d'aide ? »).
- **Gestionnaire — « Votre journée »** : urgences nécessitant un humain · décisions à valider · dossiers bloqués · résumé discret des dossiers suivis automatiquement. Assistant IA en panneau latéral repliable.
- **Prestataire (mobile)** : missions du jour · accepter / refuser · confirmer le créneau · photos · signaler un blocage · déposer le rapport.
- **Responsable de cabinet** : copropriétés, charge par gestionnaire, délais, dossiers bloqués.
- **Conseil syndical** : travaux collectifs, informations autorisées, budgets validés, rapports de performance — lecture seule.
