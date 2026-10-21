# Feuille de route

Un sprint = du code testé, documenté et vérifiable. On ne construit pas tout en même temps.

| Sprint | Objectif | Livrable vérifiable |
|---|---|---|
| **0** ✅ | Récupération, audit, GitHub, TypeScript, tests, CI, préproduction, documentation | Dépôt privé, CI verte, préproduction séparée, prod intacte |
| **1** | Authentification, base multi-cabinets, rôles, premier dossier partagé résident ↔ gestionnaire | Deux utilisateurs réels sur deux appareils ; un résident ne voit que ses demandes ; test d'isolation entre cabinets |
| **2** | Prestataires, missions, historique complet, photos, suivi, clôture manuelle | Parcours étapes 1-3, 5-8, 10 de bout en bout |
| **3** | IA réelle : classification, résumés, doublons, rapport de clôture, avec sources | Propositions IA validées / refusées par le gestionnaire, tracées |
| **4** | E-mails (entrants et sortants), relances niveau 2, notifications, PDF | Signalement par e-mail ⇒ dossier ; relance automatique autorisée |
| **5** | Imports CSV / Excel / PDF, doublons, stabilisation, sécurité, RGPD, préparation du pilote | Reprise d'un portefeuille test sans ressaisie ; audit de sécurité |

## Sprint 1 — backlog proposé

**Objectif** : le parcours actuel fonctionne avec de vrais comptes et des droits, sans régression de l'interface validée.

1. **Régulariser la base** : créer la base de production définitive en juridiction UE ; mettre en place le suivi des migrations ; garder `syndicplus-db` comme démo.
2. **Schéma multi-cabinets** (migration `0002`) : `cabinets`, `coproprietes`, `users`, `memberships`, `sessions`, `audit_log` ; `cabinet_id` et `copropriete_id` sur `dossiers`.
3. **Authentification** par lien magique (e-mail) ; sessions cookie ; déconnexion.
4. **Contrôle d'accès** : middleware qui charge l'utilisateur, son rôle et son périmètre ; toutes les requêtes filtrées par cabinet.
5. **Résident** : ne voit que ses propres demandes ; profil réel (nom, lot) à la place de « Jean Dupont ».
6. **Gestionnaire** : ne voit que les copropriétés de son portefeuille ; écran « Votre journée » v1 (urgences, à qualifier, sans action depuis 7 jours).
7. **Audit** : chaque création et mise à jour écrit `audit_log` (acteur, action, avant/après).
8. **Interface** : passage à React + Vite + TypeScript en reprenant la maquette hybride à l'identique ; suppression du sélecteur Résident/Syndic de démonstration.
9. **Tests** : isolation entre cabinets, droits par rôle, parcours e2e avec deux comptes.
10. **Limitation de débit** sur la connexion et la création de signalements.

**Première fonctionnalité à développer** : l'authentification avec rôles et isolation par cabinet (points 2 à 4). Tout le reste en dépend.

**Décisions attendues du propriétaire avant de démarrer** : bibliothèque d'authentification, fournisseur d'e-mails, activation de R2, nom de domaine.
