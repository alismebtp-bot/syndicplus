# Audit de sécurité — 21 octobre 2026

Périmètre : code du dépôt (branche `feature/cockpit-responsable`) et préproduction `syndicplus-staging`. Production non testée et non modifiée.
Méthode : revue des réglages par défaut (secrets de repli, identifiants par défaut, interrupteurs « ouverts », cryptographie, droits d'accès, fuite d'informations de débogage), revue de l'échappement à l'affichage, tests en ligne sur la préproduction, `npm audit`.

## Corrigé dans cette PR

| # | Gravité | Constat | Correction | Preuve |
|---|---|---|---|---|
| 1 | Moyenne | Les pages et fichiers statiques étaient servis **sans aucun en-tête de sécurité** (le binding `ASSETS` n'en ajoute pas). Le cockpit pouvait être affiché dans un cadre sur un autre site (détournement de clic sur « Réaffecter », « Désigner un remplaçant »…). | Fichier `public/_headers` (appliqué par Cloudflare aux fichiers statiques, qui ne passent pas par le Worker) : `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` sur toutes les pages ; **CSP stricte** et `no-store` sur `/cabinet/`. La page d'accueil n'est pas modifiée (ses scripts en ligne restent autorisés). | Parcours navigateur « en-têtes de sécurité » et « texte piégé… sans violation » ; vérifié en ligne |
| 2 | Faible | Requêtes inter-sites : un lien ou une image piégés pouvaient déclencher l'export CSV (écriture au journal) ou la déconnexion, car le cookie `SameSite=Lax` accompagne les navigations de premier niveau. | Refus des requêtes `/api/cockpit/*` et `/api/demo/*` dont `Sec-Fetch-Site` indique un autre site (en plus de l'exigence JSON pour les écritures). | Test API « refuse les requêtes… venant d'un autre site » |

### Deuxième passe : méthodes du pack « Claude Red » (lu, non installé)

Checklists appliquées : IDOR, logique métier, requêtes simultanées, sécurité et abus d'API.

| # | Gravité | Constat | Correction | Preuve |
|---|---|---|---|---|
| 3 | Moyenne | **Logique métier** : sur un dossier clôturé, le serveur acceptait « demander un point », « programmer une revue » et « préparer une décision » (y compris une dépense de 5 000 € HT). Seule l'interface masquait ces boutons. | Le serveur n'autorise plus que la demande de vérification sur un dossier clôturé (409 sinon). | Test API « un dossier clôturé… » |
| 4 | Faible | **Requêtes simultanées** : 10 envois identiques créaient 10 décisions ; deux réaffectations simultanées passaient toutes les deux (historique et notifications en double). | Écritures conditionnelles exécutées en premier (`… WHERE assignee_user_id IS ?`, index unique sur les décisions en attente (migration `0003`), idem priorité et remplaçant) ; la requête perdante reçoit 409. Vérifié en ligne : 10 envois simultanés → 1 décision. | Tests API « dix décisions… », « deux réaffectations… » |

Sans anomalie : variantes de chemin (casse, zéros, `%2F..`, double barre), changement de verbe et en-tête de surcharge, clés JSON en double, champs en trop (`status: approved` ignoré), persona hors liste.

## Vérifié, sans anomalie

- **Secrets** : aucun secret dans le dépôt ; `DEMO_SECRET` est un secret Cloudflare ; secrets de test générés aléatoirement à chaque lancement ; gitleaks en CI.
- **Interrupteur d'identité** : fermé par défaut. Sans `DEMO_IDENTITY=enabled` **et** un secret d'au moins 16 caractères, le cockpit répond 401 (production : `disabled`).
- **Session** : HMAC-SHA256, comparaison en temps constant, expiration 8 h, `HttpOnly`, `Secure`, `SameSite=Lax`. Cookie falsifié ou réattribué à un autre utilisateur → 401 (testé en ligne).
- **Isolation** : dossier hors périmètre → 404 ; réaffectation vers un gestionnaire d'un autre cabinet → refusée (testé en ligne).
- **SQL** : requêtes paramétrées uniquement ; identifiants filtrés par expression régulière avant usage.
- **Échappement** : toutes les données affichées par le cockpit passent par `esc()` ; le laboratoire construit le DOM avec `textContent`. Texte piégé enregistré puis affiché comme texte (test navigateur).
- **Entrées** : JSON obligatoire, taille bornée (4 Ko cockpit, 10 Ko / 64 Ko ailleurs), listes fermées, montants entiers bornés, dates bornées.
- **Erreurs** : message générique « Erreur serveur », détail uniquement dans les journaux Cloudflare.
- **CORS** : aucun en-tête `Access-Control-Allow-*` ; une page d'un autre site ne peut pas lire l'API.
- **Export CSV** : neutralisation des formules (`=`, `+`, `-`, `@`).
- **Dépendances** : `npm audit` — 0 vulnérabilité.

## Risques connus, acceptés pour le prototype (à traiter)

| Risque | Pourquoi c'est accepté aujourd'hui | Action recommandée |
|---|---|---|
| API publique du prototype (`/api/dossiers`) sans authentification : tout visiteur peut créer ou modifier un signalement | Documenté depuis le Sprint 0 ; données fictives | Authentification réelle (Sprint 1) |
| Préproduction : tout visiteur peut choisir une persona et régénérer les données de démonstration | Personnes et données fictives, par conception | Protéger la préproduction par **Cloudflare Access** (action à faire dans le tableau de bord Cloudflare) |
| Pas de limitation de débit (création de signalements, régénération) | Faible trafic, données fictives | Règle de limitation de débit Cloudflare sur `/api/*` |
| Corps de requête lu avant contrôle de taille lorsque `Content-Length` est absent | Plafonné par la plateforme Workers | Lecture en flux avec arrêt au-delà de la limite |
