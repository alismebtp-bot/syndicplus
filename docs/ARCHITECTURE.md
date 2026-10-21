# Architecture

## 1. Architecture actuelle (v0.3)

```
Navigateur (résident / syndic)
   │  HTML + JS (public/index.html), rafraîchissement toutes les 10 s
   ▼
Cloudflare Worker « syndicplus » (src/index.ts)
   ├─ /api/*  → domain.ts (validation) → repository.ts (SQL paramétré)
   └─ /*      → binding ASSETS (fichiers statiques de public/)
   ▼
Cloudflare D1 « syndicplus-db » (région Europe de l'Ouest)
   tables : dossiers, history
```

### API

| Méthode | Route | Rôle | Réponses |
|---|---|---|---|
| GET | `/api/dossiers` | Liste (500 max) avec historique | 200 |
| POST | `/api/dossiers` | Créer `{type, place, description}` | 201 `{id}`, 400 |
| POST | `/api/dossiers/D-{n}/updates` | `{status, note}` : change le statut et/ou ajoute une note | 200, 400, 404 |

Corps limités à 10 ko ; textes tronqués (lieu 100, description et note 1 000 caractères) ; types et statuts en liste fermée.

### Schéma (migrations/0001_init.sql)

- `dossiers(num PK autoincrement, type, description, place, status, created_at)`
- `history(id PK, dossier_num → dossiers.num, text, created_at)`

### Choix assumés du prototype

- Pas de framework d'interface : un seul fichier, facile à relire. Il sera remplacé au Sprint 1 (voir §3).
- Pas de dépôt multi-paquets : un seul paquet suffit tant qu'il y a un seul Worker. La structure `apps/` + `packages/` ne sera introduite que si un second déployable apparaît (ex. application prestataire séparée).

## 2. Environnements

| | Production | Préproduction | Local |
|---|---|---|---|
| Worker | `syndicplus` | `syndicplus-staging` | `wrangler dev` |
| D1 | `syndicplus-db` | `syndicplus-db-staging` | `.wrangler/state` |
| Déploiement | Manuel, **après accord écrit du propriétaire** | `npm run deploy:staging` | — |

La CI ne déploie pas (aucun secret Cloudflare dans GitHub à ce stade). Un déploiement automatique de la préproduction pourra être ajouté avec un token limité au Worker `syndicplus-staging`.

## 3. Architecture cible (proposée, à valider au Sprint 1)

```
                       ┌──────────── Cloudflare ────────────────────────────────────┐
Résident / Gestionnaire│ Worker « app » (TypeScript, Hono)                           │
Prestataire / CS ──────┼─▶ /api  : auth → contexte cabinet → services métier         │
(web responsive, PWA)  │    /*   : interface React + Vite (assets statiques)          │
QR code ───────────────┤                                                            │
E-mail entrant ────────┼─▶ Email Worker → normalisation → dossier central            │
                       │                                                            │
                       │ D1 (juridiction UE)   R2 privé          Queues   Cron       │
                       │ données + audit       photos, PDF       IA, e-mails relances │
                       └─────────────┬──────────────────────────────────────────────┘
                                     ▼
                         Fournisseurs IA interchangeables (Anthropic, OpenAI, Workers AI)
```

| Besoin | Choix proposé | Raison |
|---|---|---|
| Langage | TypeScript strict partout | Exigence, typage partagé API ↔ interface |
| API | Worker + **Hono** | Routage léger, middlewares (auth, cabinet, validation) |
| Validation | **Zod** (schémas partagés client/serveur) | Une seule définition des règles |
| Interface | **React + Vite**, servie par le même Worker | 5 interfaces par rôle : composants réutilisables ; reprise fidèle de la maquette hybride |
| Base | **D1**, nouvelle base créée en **juridiction UE** | Persistant, SQL, sauvegardes intégrées (Time Travel 30 j) |
| Isolation | `cabinet_id` sur chaque table + contexte imposé par la session + tests d'isolation | Isolation stricte entre cabinets |
| Fichiers | **R2** privé, accès par URL signée courte durée | Documents privés (R2 à activer sur le compte) |
| Authentification | Lien magique par e-mail + sessions en cookie HttpOnly (bibliothèque à trancher : Better Auth sur D1, ou implémentation maison) | Résidents sans mot de passe ; gestionnaires avec 2FA plus tard |
| Rôles | `resident`, `gestionnaire`, `prestataire`, `responsable_cabinet`, `conseil_syndical`, `admin` | Contrôle d'accès par rôle et par copropriété |
| Tâches longues | **Queues** (analyse IA, e-mails), **Cron Triggers** (relances, dossiers bloqués) | Ne pas bloquer les requêtes |
| IA | Interface `AIProvider` + adaptateurs | Indépendance fournisseur |
| Audit | Table `audit_log` en ajout seul (acteur, cabinet, entité, action, avant/après, horodatage) | Traçabilité |
| Sauvegardes | D1 Time Travel + export hebdomadaire chiffré vers R2 | Reprise après incident |

### Modèle de données cible (extrait)

`cabinets` → `coproprietes` → `lots` · `users` (+ `memberships(user, cabinet, role, copropriete?)`) · `dossiers` (copropriété, localisation, catégorie, statut, priorité, échéance) · `signalements` (canal, auteur, rattachés à un dossier) · `messages` · `pieces_jointes` (R2) · `prestataires` · `missions` · `devis` · `decisions` (validateur, montant, habilitation) · `propositions_ia` (contenu, sources, statut accepté/refusé, validateur) · `audit_log`.

## 4. Décisions à prendre au Sprint 1

1. Bibliothèque d'authentification (Better Auth vs maison) et fournisseur d'e-mails transactionnels.
2. Création de la base de production définitive en juridiction UE et stratégie de migration des données de démonstration.
3. Activation de R2 sur le compte Cloudflare.
4. Nom de domaine définitif (ex. `app.syndicplus.fr`).
