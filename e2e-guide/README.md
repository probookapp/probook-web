# Guide d'utilisation — tournage automatisé

Onze chapitres qui pilotent la vraie application, en français, sur la base de
test locale. Chaque chapitre est **à la fois** un test d'interface et une prise
de vue : ce qui est filmé est donc, par construction, ce qui a été vérifié.

## Le déroulé

```bash
# 1. vérifier — mêmes clics, mêmes assertions, sans ralenti ni vidéo (~3 min)
npm run guide:check

# 2. filmer — 1920×1080, curseur visible, légendes incrustées (~35 min)
npm run guide:record

# 3. exporter — un MP4 par chapitre + la vidéo complète A→Z
npm run guide:build
```

Les fichiers arrivent dans `guide-output/` :

```
guide-output/
  chapitres/                        un MP4 par chapitre
  probook-guide-complet.mp4         le montage continu
  raw/                              les .webm bruts de Playwright
```

**Toujours passer par l'étape 1 avant de filmer.** Un chapitre qui échoue en
mode vérification donnera une vidéo inutilisable (bouton manqué, écran vide),
et les chapitres suivants s'appuient sur les données créés par les précédents.

## Comment c'est construit

- `lib/tour.ts` — le harnais de tournage : bandeau de légende, curseur de
  synthèse avec onde au clic, frappe caractère par caractère, carton-titre de
  chapitre. `GUIDE_FAST=1` neutralise tout le rythme narratif et ne garde que
  les interactions : c'est le mode vérification.
- `lib/i18n.ts` — les libellés viennent des fichiers de traduction de
  l'application. Les sélecteurs suivent donc l'UI au lieu de figer du texte
  français qui se périmerait au premier renommage.
- `lib/session.ts` — le chapitre 01 crée un vrai compte et sauvegarde ses
  cookies ; les chapitres suivants le reprennent. Le compte se remplit au fil
  des chapitres, comme celui d'un vrai commerçant.
- `lib/data.ts` — le commerce fictif filmé (Électro Souk, Alger). Le produit
  créé au chapitre 3 est celui vendu en caisse au chapitre 6 et recommandé au
  chapitre 7.

## Réglages

| Variable | Défaut | Effet |
|---|---|---|
| `GUIDE_FAST` | — | `1` : mode vérification, sans vidéo ni ralenti |
| `GUIDE_HEADED` | — | `1` : navigateur visible pendant le tournage |
| `GUIDE_SLOWMO` | `220` | Pause entre chaque action, en ms |
| `GUIDE_WIDTH` / `GUIDE_HEIGHT` | `1920` / `1080` | Définition d'enregistrement |

## Refilmer un seul chapitre

```bash
npx playwright test --config=playwright.guide.config.ts e2e-guide/06-caisse.spec.ts
npm run guide:build
```

Le chapitre réutilise la session existante (`.session.json`). Pour repartir
d'un compte vierge, supprimer ce fichier et refilmer depuis le chapitre 01.
