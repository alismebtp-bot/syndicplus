# Inventaire des fonctionnalités

Légende : **Fonctionnel** = implémenté côté serveur, persistant et testé · **Simulé** = visible à l'écran mais contenu fixe ou sans effet réel · **Prévu** = pas encore développé.

> Règle : une fonctionnalité n'est « Fonctionnelle » que si elle passe par l'API, est enregistrée en base et est couverte par un test.

_Dernière mise à jour : Sprint 0 (v0.3)._

## Dossiers (cœur)

| Fonctionnalité | Statut | Détail / preuve |
|---|---|---|
| Créer un signalement (type, lieu, description) | **Fonctionnel** | `POST /api/dossiers`, validation serveur, tests API + e2e |
| Lister les dossiers et leur historique | **Fonctionnel** | `GET /api/dossiers` (500 derniers) |
| Changer le statut et ajouter une note | **Fonctionnel** | `POST /api/dossiers/D-xxxx/updates`, historisé |
| Synchronisation entre appareils | **Fonctionnel** | Base D1 partagée, rafraîchissement toutes les 10 s (pas de temps réel) |
| Statuts : À qualifier, En cours, En attente prestataire, Résolu | **Fonctionnel** | Liste fermée validée côté serveur |
| Question « Danger immédiat ? » | **Fonctionnel (local)** | Affiche les consignes (112), n'enregistre rien et n'alerte personne |
| Références `D-1000`… | **Fonctionnel** | Numérotation séquentielle D1 |
| Photos, documents, devis, échéances, prestataires, décisions | **Prévu** | Sprints 2 à 4 |
| Regroupement des signalements en double | **Prévu** | Sprint 3 (proposition IA, validation humaine) |
| Clôture vérifiée avec rapport | **Prévu** | Sprint 2–3 |

## Interface résident

| Élément | Statut | Détail |
|---|---|---|
| Accueil hybride (bandeau, 2 actions, dernière demande, autres informations) | **Fonctionnel** pour la dernière demande · **Simulé** pour le reste | Bandeau et « Autres informations » sont des textes fixes |
| Signaler un problème | **Fonctionnel** | |
| Suivre mes demandes + historique | **Fonctionnel** — mais affiche **toutes** les demandes | Pas d'identité : chaque visiteur voit tout |
| Ma résidence, Mes documents, Annonces, Contacts utiles | **Simulé** | Contenus fictifs codés dans `public/index.html` |
| Cloche de notifications (badge « 2 ») | **Simulé** | Nombre fixe, ouvre les annonces |
| « Besoin d'aide ? » | **Simulé** | Menu de navigation, **aucune IA** |
| Profil « Jean Dupont · Appartement 3B » | **Simulé** | Pas de compte |

## Interface syndic

| Élément | Statut | Détail |
|---|---|---|
| Compteurs (à qualifier, actifs, en attente) | **Fonctionnel** | Calculés sur les vrais dossiers |
| Liste « À traiter et suivre » + dossier sélectionné | **Fonctionnel** | |
| Tous les dossiers + filtres par statut | **Fonctionnel** | Filtrage côté navigateur |
| « Votre journée » orientée urgences / décisions / blocages | **Prévu** | Sprint 1–3 |
| Profil « Claire Moreau » | **Simulé** | |
| Assistant IA | **Simulé** | Aucun modèle connecté |

## Transverse

| Élément | Statut |
|---|---|
| Authentification, rôles, cabinets | **Prévu** (Sprint 1) — aujourd'hui **tout visiteur peut lire et modifier** |
| Bascule Résident / Syndic | **Simulé** — simple sélecteur de démonstration |
| Prestataire, responsable de cabinet, conseil syndical | **Prévu** |
| Notifications e-mail / SMS | **Prévu** (Sprint 4) |
| Imports CSV / Excel / PDF | **Prévu** (Sprint 5) |
| Bilan annuel PDF | **Prévu** |
| Préproduction séparée | **Fonctionnel** (Sprint 0) |
| CI : typage, tests API, e2e, secrets | **Fonctionnel** (Sprint 0) |
