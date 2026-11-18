# Le guide sur téléphone

Quatre chapitres courts, en portrait 390×844 — la largeur que la barrière
responsive (`e2e/responsive-audit.spec.ts`) tient déjà. Comme ceux du bureau,
ils vérifient le parcours et fournissent ses captures au guide `/guide`.

Ce ne sont pas les chapitres du bureau rejoués en petit : à cette largeur les
tableaux deviennent des cartes et la barre latérale se replie derrière un
bouton. Rejouer les mêmes gestes montrerait une fiction. Ceux-ci montrent ce
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
# Vérification
npm run guide:mobile:check

# Vérification + captures pour le guide, puis images
npm run guide:mobile:shots && npm run guide:images
```
