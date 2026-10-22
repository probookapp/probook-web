# Guide d'utilisation — tournage automatisé

Douze chapitres qui pilotent la vraie application, en français, sur la base de
test locale. Chaque chapitre est **à la fois** un test d'interface et une prise
de vue : ce qui est filmé est donc, par construction, ce qui a été vérifié.

## Le déroulé

```bash
# 0. la voix off — une fois, puis seulement les phrases modifiées (cache)
npm run guide:voice              # français ; `-- en ar` pour les autres langues

# 1. vérifier — mêmes clics, mêmes assertions, sans ralenti ni vidéo (~9 min)
npm run guide:check

# 2. filmer — 1920×1080, caméra qui zoome sur l'action, rythme calé sur la voix
npm run guide:record

# 3. monter — voix, musique, sous-titres, miniatures, un MP4 par chapitre
npm run guide:build
```

Les fichiers arrivent dans `guide-output/<langue>/` :

```
guide-output/fr/
  chapitres/
    04-devis.mp4                    le chapitre monté
    04-devis.srt                    ses sous-titres, pour la piste YouTube
    04-devis.png                    sa miniature 1280×720
  probook-guide-complet-fr.mp4      le montage continu
  raw/                              les .webm bruts et leur timeline.json
guide-output/voice/<langue>/        une piste par phrase (cache de la voix)
guide-output/music/bed.wav          le fond musical synthétisé
```

**Toujours passer par l'étape 1 avant de filmer.** Un chapitre qui échoue en
mode vérification donnera une vidéo inutilisable (bouton manqué, écran vide),
et les chapitres suivants s'appuient sur les données créés par les précédents.

## Comment c'est construit

Le navigateur ne filme que l'application et le curseur. Tout le reste — voix,
musique, sous-titres, coupe du chargement — est ajouté au montage, à partir
du `timeline.json` que chaque chapitre écrit à côté de sa vidéo.

- `lib/tour.ts` — le harnais de tournage : curseur de synthèse avec onde au
  clic, frappe caractère par caractère, carton-titre et carton de fin. Chaque
  phrase dure exactement le temps de sa piste de voix, et les clics qu'elle
  décrit se font pendant qu'elle est dite. `GUIDE_FAST=1` neutralise tout le
  rythme et ne garde que les interactions : c'est le mode vérification.
- `lib/camera.ts` — la caméra : le zoom « pinch » de Chrome lui-même, filmé
  en direct, donc net (un zoom au montage agrandirait des pixels 1080p). Une
  fenêtre est cadrée entière, un champ de formulaire avec son voisinage ;
  la caméra recule avant d'aller ailleurs.
- `scripts/guide-voice.mjs` — la voix off : Azure Neural TTS (voix `ar-DZ`
  pour l'arabe), mise en cache par phrase. Les prononciations corrigées
  (« Probook », « NIF »…) sont dans `PRONUNCIATIONS`.
- `scripts/guide-edit.mjs` — le montage d'une prise : synchronisation sur le
  carton-titre, coupe, voix, musique qui s'efface sous la voix, son normalisé
  à −14 LUFS (le niveau de YouTube), sous-titres incrustés et `.srt`.
- `scripts/guide-thumbnails.mjs` — les miniatures, rendues par Chromium.
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
| `GUIDE_VOICE` | `azure` si une clé est présente, sinon `off` | `azure`, `sapi` (voix Windows, pour travailler sans clé) ou `off` |
| `GUIDE_VOICE_GENDER` | `female` | `male` pour les voix masculines |
| `GUIDE_VOICE_RATE` | `+0%` | Débit de la voix (`+8%`, `-5%`…) |
| `GUIDE_CAPTIONS` | — | `page` : l'ancien bandeau dessiné dans la page, au lieu des sous-titres du montage |
| `GUIDE_CAMERA` | — | `0` : pas de zoom |
| `GUIDE_HEADED` | — | `1` : navigateur visible pendant le tournage |
| `GUIDE_SLOWMO` | `80` | Pause entre chaque action, en ms |
| `GUIDE_WIDTH` / `GUIDE_HEIGHT` | `1920` / `1080` | Définition d'enregistrement |

`.env.test` porte les réglages de l'environnement de test :

- `AZURE_SPEECH_KEY` et `AZURE_SPEECH_REGION` — la ressource « Speech » Azure
  (niveau gratuit F0 : 500 000 caractères par mois, il en faut ~55 000 pour
  les trois langues) ;
- `STORAGE_DRIVER=inline` — le Supabase de test est fictif, et sans ce réglage
  l'envoi du logo échoue au chapitre 11 (le logo est alors stocké dans la
  base, en `data:` URL — jamais en production).

**La musique** : un morceau choisi à la main (bibliothèque audio de YouTube
Studio, « attribution non requise ») déposé en `e2e-guide/assets/music.mp3`
remplace le fond synthétisé par `node scripts/make-guide-music.mjs`.

## Refilmer un seul chapitre

```bash
npx playwright test --config=playwright.guide.config.ts e2e-guide/06-caisse.spec.ts
npm run guide:build
```

Le chapitre réutilise la session existante (`.session.json`). Pour repartir
d'un compte vierge, supprimer ce fichier et refilmer depuis le chapitre 01.
