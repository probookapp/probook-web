# Le guide sur téléphone

Quatre chapitres courts, filmés en portrait 390×844 — la forme qu'un prospect
regarde sur WhatsApp ou Instagram, et la largeur que la barrière responsive
(`e2e/responsive-audit.spec.ts`) tient déjà.

Ce ne sont pas les chapitres du bureau rejoués en petit : à cette largeur les
tableaux deviennent des cartes et la barre latérale se replie derrière un
bouton. Rejouer les mêmes gestes filmerait une fiction. Ceux-ci montrent ce
qu'on fait vraiment depuis un téléphone — sur un chantier, dans une camionnette,
au comptoir.

| Chapitre | Sujet |
|---|---|
| `01-devis-terrain` | Chiffrer chez le client, en vue dense, remise comprise |
| `02-encaisser` | Retrouver une facture et enregistrer un règlement |
| `03-comptoir` | Vendre à la caisse en liste compacte |
| `04-pilotage` | Suivre l'activité et saisir une dépense sur le pouce |

## Prérequis

Les chapitres reprennent le **même compte** que le guide bureau
(`e2e-guide/.session.json`, écrit par son chapitre 01). C'est voulu : le guide
téléphone montre une entreprise déjà en activité qui passe sur son mobile, pas
un compte vide. Lancer le guide bureau d'abord.

## Commandes

```bash
# Vérification, sans vidéo
npm run guide:mobile:check

# Tournage, puis export MP4
npm run guide:mobile:record && npm run guide:build -- --mobile
```
