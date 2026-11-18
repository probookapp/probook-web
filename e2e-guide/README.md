# Guide d'utilisation — généré par les tests

Douze chapitres qui pilotent la vraie application sur la base de test locale
(et quatre sur téléphone, dans `e2e-guide-mobile/`). Chaque chapitre est **à la
fois** un test d'interface et la source d'une page du guide public `/guide` :

- chaque `tour.say("…")` est une étape du guide — sa phrase est le texte de la
  page, traduit en anglais et en arabe dans `captions/` ;
- avec `GUIDE_SHOTS=1`, l'écran tel que l'étape le laisse est capturé et
  affiché sous la phrase.

Ce que le guide montre est donc, par construction, ce que le test vient de
vérifier.

## Mettre le guide à jour

```bash
# 1. vérifier — les mêmes chapitres, sans rien écrire (~5 min)
npm run guide:check

# 2. capturer — par langue, bureau puis téléphone
npm run guide:shots            # guide:shots:en, guide:shots:ar
npm run guide:mobile:shots     # guide:mobile:shots:en, …:ar

# 3. convertir — WebP nommés par leur contenu + src/content/guide/screens.json
npm run guide:images

# 4. publier les images sur R2 (files.probookapp.net/guide/), puis committer
#    screens.json : le site affiche les nouvelles captures au déploiement
npm run guide:upload
```

Si la narration d'un chapitre change, lancer aussi `npm run guide:content`
(le texte des pages) avant l'étape 3 : chaque capture est rattachée à sa
phrase par le texte, et `guide:images` refuse un chapitre qui a dit une phrase
absente de son texte. Une étape sautée (une caisse déjà ouverte) reste
simplement sans image.

Les fichiers de travail restent dans `guide-output/` (non versionné) :

```
guide-output/
  shots/<langue>/<desktop|mobile>/<chapitre>/NN.png   les captures brutes
  guide-images/<hash>.webp                            les images publiées
  test-results/                                       traces des échecs
```

## Comment c'est construit

- `lib/tour.ts` — le harnais : actions (`click`, `type`, `pick`…), étapes
  (`say`) et captures. Une fenêtre ouverte est capturée seule ; sinon la zone
  de contenu, sans la barre latérale. On attend que les roues de chargement
  aient disparu avant de capturer.
- `lib/inspector.ts` — un chapitre échoue si l'application a signalé une
  erreur pendant qu'il tournait, même sans assertion dessus.
- `lib/i18n.ts` — les libellés viennent des fichiers de traduction de
  l'application : les sélecteurs suivent l'interface.
- `lib/session.ts` — le chapitre 01 crée un vrai compte et sauvegarde ses
  cookies ; les suivants le reprennent. Le compte se remplit au fil des
  chapitres, comme celui d'un vrai commerçant.
- `lib/data.ts` — le commerce fictif (Électro Souk, Alger).
- `feature-inventory.ts` — chaque page de l'application doit appartenir à un
  chapitre ; le bouton « ? » d'une page ouvre ce chapitre.

## Réglages

| Variable | Défaut | Effet |
|---|---|---|
| `GUIDE_SHOTS` | — | `1` : capturer les étapes |
| `GUIDE_LOCALE` | `fr` | Langue de l'interface et du guide |
| `GUIDE_HEADED` | — | `1` : navigateur visible |
| `GUIDE_WIDTH` / `GUIDE_HEIGHT` | `1440` / `900` | Taille de la fenêtre (captures à densité ×2) |

`.env.test` doit contenir `STORAGE_DRIVER=inline` : il n'y a pas de bucket en
test, et sans ce réglage l'envoi du logo échoue au chapitre 11.

`npm run guide:upload` lit les accès R2 de production dans `.env`
(`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
`R2_PUBLIC_URL`). Il n'envoie que les images absentes du bucket et n'en
supprime aucune.

## Rejouer un seul chapitre

```bash
npx dotenv -e .env.test -v GUIDE_SHOTS=1 -- npx playwright test --config=playwright.guide.config.ts e2e-guide/06-caisse.spec.ts
npm run guide:images -- fr
```

Le chapitre réutilise la session existante (`.session.json`). Pour repartir
d'un compte vierge, supprimer ce fichier et rejouer depuis le chapitre 01.
