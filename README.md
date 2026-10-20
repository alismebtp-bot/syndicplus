# SyndicPlus

**Moins d'administration. Plus d'anticipation. Une gestion qui prouve sa valeur.**

Plateforme de gestion intelligente des incidents, de la maintenance et des travaux en copropriété, conçue pour compléter les logiciels de syndic existants.

> **Statut : prototype v0.3 (Sprint 0).** Données fictives, pas d'authentification. Démo : https://syndicplus.syndicplus.workers.dev

## Démarrer

```bash
npm ci
npm run db:migrate:local   # crée la base D1 locale avec 2 dossiers de démonstration
npm run dev                # http://localhost:8787
```

Vérifier avant toute PR :

```bash
npm run check              # typage + tests unitaires + tests API
npm run test:e2e           # parcours résident ↔ syndic dans Chromium (desktop + mobile)
```

## Stack

- **Cloudflare Workers** (TypeScript) : API + service de l'interface
- **Cloudflare D1** (SQLite) : dossiers et historique
- **Interface** : HTML/CSS/JS sans framework (`public/index.html`), responsive mobile
- **Tests** : Vitest + `@cloudflare/vitest-plugin` (API sur vraie D1 locale), Playwright (navigateur)
- **CI** : GitHub Actions (typage, tests, parcours navigateur, recherche de secrets)

## Documentation

| Fichier | Contenu |
|---|---|
| [AGENTS.md](AGENTS.md) | Règles pour développeurs et assistants IA : commandes, sécurité, conventions, PR |
| [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) | Vision, problèmes résolus, utilisateurs |
| [docs/FEATURES.md](docs/FEATURES.md) | Inventaire : fonctionnel, simulé, prévu |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture actuelle et cible, décisions |
| [docs/USER_FLOWS.md](docs/USER_FLOWS.md) | Parcours utilisateurs actuels et cibles |
| [docs/AI_AGENTS.md](docs/AI_AGENTS.md) | Assistants IA, niveaux d'autonomie, garde-fous |
| [docs/SECURITY.md](docs/SECURITY.md) | État de sécurité, risques connus, RGPD |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Sprints et backlog du Sprint 1 |

## Historique

- `v0.2.0-prototype` : prototype déployé le 20/10/2026, importé sans modification (commit « Import du prototype… »).
- `v0.3.0` (Sprint 0) : passage en TypeScript à comportement identique, tests, CI, préproduction, documentation.
