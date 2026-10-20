# SyndicPlus — prototype partagé (Cloudflare Workers + D1)

- `public/index.html` : interface résident / syndic
- `src/index.js` : API (`GET/POST /api/dossiers`, `POST /api/dossiers/D-xxxx/updates`)
- Base D1 `syndicplus-db` déjà créée et initialisée sur le compte Cloudflare.

## Mettre en ligne
    npm install
    npx wrangler login      # une seule fois
    npx wrangler deploy

## Tester en local
    npx wrangler d1 migrations apply syndicplus-db --local
    npx wrangler dev
