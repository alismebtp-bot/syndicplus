# Sécurité et RGPD

## 1. État actuel (prototype v0.3) — à lire avant toute démonstration

| Sujet | État |
|---|---|
| Authentification | **Aucune.** Toute personne qui connaît l'adresse peut lire tous les dossiers, en créer et changer leur statut. |
| Données | **Fictives uniquement.** Ne saisir aucune donnée réelle de résident. |
| Injection SQL | Protégé : requêtes paramétrées, références validées (`^D-\d+$`). Testé. |
| XSS | Protégé : échappement systématique à l'affichage (`esc()`). Testé en e2e (aucune exécution d'un `<img onerror>`). |
| Validation serveur | Types et statuts en liste fermée, longueurs bornées, corps ≤ 10 ko. Testé. |
| En-têtes API | `no-store`, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`. |
| Limitation de débit | **Aucune.** Risque de remplissage de la base par un robot. |
| Journal d'audit | Partiel : historique par dossier, sans identité de l'auteur. |
| Secrets | Aucun dans le dépôt ; contrôle gitleaks en CI. |
| Sauvegardes | D1 Time Travel (restauration à un instant des 30 derniers jours). |
| Localisation | D1 créée avec indication « Europe de l'Ouest » (pas de juridiction UE garantie). |

## 2. Exigences pour la version professionnelle

1. **Authentification** par lien magique (résidents) ; e-mail + second facteur pour gestionnaires et responsables (à terme).
2. **Sessions** en cookie `HttpOnly; Secure; SameSite=Lax`, rotation, expiration, révocation.
3. **Rôles et périmètres** vérifiés côté serveur à chaque requête (rôle + cabinet + copropriété).
4. **Isolation stricte des cabinets** : `cabinet_id` obligatoire, issu de la session ; tests automatiques qui tentent l'accès croisé.
5. **Documents privés** dans R2, URL signées de courte durée, contrôle des types et tailles.
6. **Journal d'audit** en ajout seul pour toute écriture et toute consultation de document sensible.
7. **Limitation de débit** sur la création de signalements, la connexion et les appels IA.
8. **Protection contre l'injection de prompt** : voir `AI_AGENTS.md`.
9. **CSP** stricte dès que l'interface n'utilise plus de gestionnaires d'événements en ligne.
10. **Dépendances** : mises à jour suivies (Dependabot), `npm audit` en CI.

## 3. RGPD

- **Responsable de traitement** : le cabinet de syndic ; SyndicPlus agit comme **sous-traitant** (contrat article 28 à prévoir).
- **Minimisation** : nom, lot, coordonnées de contact, contenu du signalement ; pas de données sensibles demandées.
- **Hébergement UE** : base de production à recréer en juridiction UE (D1 `jurisdiction: eu`) ; sous-traitants IA avec engagement de non-entraînement et clauses de transfert si hors UE.
- **Durées de conservation** à définir avec les cabinets (ex. dossiers clos : 5 ans ; photos : durée du dossier + 1 an).
- **Droits des personnes** : export et suppression par résident, procédure documentée.
- **Registre des traitements** et **analyse d'impact** à préparer avant le pilote (Sprint 5).

## 4. Signaler une vulnérabilité

Écrire au propriétaire du dépôt (alismebtp@gmail.com) sans publier de détail dans une issue publique.
