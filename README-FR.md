# PDF Kiosk iPad — version GitHub Pages (sans Cloudflare)
#######################################################

Cette version fonctionne uniquement avec **GitHub Pages**.

## 1. Mettre ton PDF

Remplace le fichier `deck.pdf` par ton vrai PDF.
Le nom doit rester exactement :

`deck.pdf`

Le fichier doit être à la racine, au même niveau que `index.html`.

## 2. Envoyer sur GitHub

Dans ton dépôt GitHub :

- supprime l'ancien contenu si nécessaire ;
- upload tout le contenu de ce dossier ;
- vérifie que `index.html` et `deck.pdf` sont directement à la racine ;
- Commit changes.

Exemple :

```
index.html
app.js
styles.css
sw.js
manifest.webmanifest
icon.svg
deck.pdf
.nojekyll
vendor/
  pdf.min.mjs
  pdf.worker.min.mjs
```

## 3. Activer GitHub Pages

GitHub :

Settings -> Pages -> Build and deployment

- Source : Deploy from a branch
- Branch : main
- Folder : /(root)
- Save

Ton adresse sera normalement :

`https://TON-UTILISATEUR.github.io/NOM-DU-DEPOT/`

## 4. Installer sur l'iPad

1. Connecte l'iPad au Wi-Fi.
2. Ouvre l'adresse GitHub Pages dans Safari.
3. Attends que le PDF soit complètement chargé.
4. Safari -> Partager -> Ajouter à l'écran d'accueil (`Zum Home-Bildschirm`).
5. Ferme Safari.
6. Ouvre l'icône **PDF Kiosk** depuis l'écran d'accueil.
7. Laisse le PDF se charger une fois.
8. Coupe le Wi-Fi et teste : le PDF doit encore fonctionner.

## 5. Verrouiller l'iPad

Active ensuite :

Einstellungen -> Bedienungshilfen -> Geführter Zugriff

Puis ouvre PDF Kiosk et appuie 3 fois sur le bouton supérieur.

## Fonctionnement

- swipe gauche/droite : page suivante/précédente ;
- tap sur une zone vide : aucun menu ;
- liens internes du PDF : cliquables ;
- liens Internet externes : désactivés par sécurité ;
- après le premier chargement : utilisation hors ligne.

## Important

Avec un dépôt GitHub **public**, `deck.pdf` est lui aussi publiquement accessible pendant qu'il est hébergé sur GitHub Pages. N'utilise pas cette méthode pour un document confidentiel.

Quand tu remplaces `deck.pdf`, ouvre le kiosque une fois avec Internet pour que la nouvelle version soit remise en cache.
