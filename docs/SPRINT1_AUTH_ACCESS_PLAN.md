# Sprint 1 — Contrat de sécurité avant implémentation

Statut : proposition pour revue, **aucun code d'authentification déployé**.

## Constat vérifié

Le Worker `src/index.ts` expose actuellement les routes `GET /api/dossiers`, `POST /api/dossiers` et `POST /api/dossiers/:ref/updates` sans authentification ni autorisation. L'interface affiche les mêmes données indépendamment du rôle. **Ne pas y saisir de données réelles.**

## Décisions à prendre avant les migrations

1. Choisir un service d'identité compatible Workers et le mode de vérification des e-mails ; ne pas coder une authentification maison précipitamment.
2. Définir les relations `cabinet` ↔ `copropriete` ↔ `resident` ↔ `gestionnaire`, avec plusieurs cabinets possibles pour les prestataires.
3. Définir la transition de la base de démonstration D1 vers une base de production distincte en juridiction UE et vérifier le suivi des migrations.
4. Préserver le site public de démonstration ; aucun déploiement de production dans ce sprint sans validation explicite.

## Contrat d'accès minimal

| Action | Résident | Gestionnaire | Responsable cabinet | Prestataire |
| --- | --- | --- | --- | --- |
| Créer un signalement | Uniquement dans sa copropriété | Dans son portefeuille | Dans son cabinet | Non |
| Lire un signalement | Seulement les siens, plus annonces publiques autorisées | Portefeuille affecté | Cabinet | Uniquement missions affectées |
| Modifier le statut | Non | Dossier autorisé | Cabinet | Seulement état de mission, via endpoint distinct |
| Lire historique et pièces | Portée autorisée, pièces filtrées | Portefeuille affecté | Cabinet | Seulement pièces nécessaires à sa mission |

Toutes les décisions d'accès sont prises **côté serveur** à partir d'une session vérifiée, jamais d'un `cabinet_id` fourni par le navigateur. Le défaut est le refus.

## Tests d'acceptation requis avant activation

- Une requête non authentifiée vers les données privées renvoie 401, y compris une référence de dossier valide.
- Un résident A ne peut pas lire le dossier privé d'un résident B (403 ou 404 sans fuite d'existence).
- Un utilisateur du cabinet A ne peut ni lire ni modifier le moindre dossier du cabinet B.
- Un gestionnaire ne peut pas traiter un immeuble hors portefeuille sauf droit explicite.
- Une invitation prestataire expirée ou révoquée ne donne plus accès.
- Une modification permise produit un événement d'audit lié à un utilisateur et à une organisation.
- Les tests couvrent à la fois la couche API, les requêtes SQL et le parcours navigateur sur deux comptes.
- Les anciens endpoints publics sont supprimés ou déplacés vers une démonstration isolée ne contenant que des données fictives.

## Séquence d'implémentation suggérée

1. Modèles et migration multi-cabinets, avec données de test.
2. Session et middleware d'authentification.
3. Contrôles d'autorisation et filtrage à la requête SQL (pas après récupération).
4. Tests négatifs d'accès croisé et d'absence de session.
5. Interface de connexion et espaces résident/gestionnaire.
6. Vérification en préproduction séparée avec deux appareils.

**Critère de fin :** aucun accès public non autorisé aux dossiers de production ; vérification CI et démonstration du parcours sous deux identités. La création de cette note n'implémente pas ce critère.
