/* =============================================================================
   data.js — Source unique de vérité de la gamme "Adopte ta shoes"
   -----------------------------------------------------------------------------
   Pour AJOUTER un modèle : ajoute un objet à la fin du tableau PRODUCTS.
   Tout le reste (carousel, couleurs de fond, pagination, textes) se met à jour
   automatiquement à partir de ces données.

   Champs :
   - id         : identifiant court unique (slug)
   - name       : nom du modèle (ligne 1 du titre)
   - colorway   : nom du coloris (ligne 2 / sous-titre)
   - primary    : couleur CSS principale (corps de la chaussure + fond)
   - secondary  : couleur CSS secondaire (semelle / accents + fond)
   - text       : "light" ou "dark" — couleur de texte lisible sur cette paire
   - description: texte complice (2-3 phrases), utilisé dans la section Profil
   - price      : prix placeholder (string)
   - badge      : "Nouveauté" | "Édition limitée" | "Meilleure vente" | null
   - image      : chemin d'une vraie photo détourée (PNG transparent) OU null.
                  Si null → le module sneaker-renderer.js dessine un PLACEHOLDER
                  SVG coloré. Remplace par "images/adopte-<id>.png" quand tu as
                  les vraies photos, sans rien changer d'autre.

   MODÈLE 3D (carousel hero uniquement) — convention, PAS de champ à ajouter :
   - Le module js/sneaker3d.js charge "assets/models/adopte-<id>.glb".
   - Tant que ce fichier n'existe pas, il retombe proprement sur le modèle
     générique partagé "assets/models/_base.glb", TEINTÉ avec `primary` pour
     obtenir une variante de couleur par paire (aucun crash, fallback propre).
   - Pour livrer le vrai modèle d'une paire : dépose simplement
     "assets/models/adopte-<id>.glb" (ex: adopte-creme.glb). Il sera chargé tel
     quel, sans teinte, sans toucher au carousel, à l'éclairage ni au reste.
   - La grille "Toute la collection" reste en 2D (image ci-dessus).
   ========================================================================== */

export const PRODUCTS = [
  {
    id: "creme",
    name: "Atlas",
    colorway: "Blanc Cassé / Crème",
    primary: "#ece5d6",
    secondary: "#cabfa6",
    text: "dark",
    description:
      "L'essentiel, mais vraiment bien fait. Une silhouette minimaliste en cuir souple qui va avec absolument tout. Adopte-la, tu ne la quitteras plus.",
    price: "139 €",
    badge: "Meilleure vente",
    image: "assets/sneakers/adopte-creme.png",
  },
  {
    id: "anthracite",
    name: "Onyx",
    colorway: "Noir Mat / Anthracite",
    primary: "#2c2c30",
    secondary: "#54545c",
    text: "light",
    description:
      "La passe-partout ultime. Du bureau au dernier verre, elle encaisse tout sans jamais faire tache. Discrète, fidèle, indispensable.",
    price: "129 €",
    badge: null,
    image: "assets/sneakers/adopte-anthracite.png",
  },
  {
    id: "camel",
    name: "Dune",
    colorway: "Beige Sable / Camel",
    primary: "#c7a074",
    secondary: "#9a7048",
    text: "dark",
    description:
      "Un petit air de running vintage et un confort qui tient toute la journée. Pour celles et ceux qui marchent beaucoup, et bien.",
    price: "149 €",
    badge: "Nouveauté",
    image: "assets/sneakers/adopte-camel.png",
  },
  {
    id: "marine",
    name: "Comète",
    colorway: "Bleu Nuit / Marine",
    primary: "#26365f",
    secondary: "#41598f",
    text: "light",
    description:
      "La touche sportswear qui réveille un look. Mesh technique, semelle réactive : elle a de l'énergie à revendre.",
    price: "159 €",
    badge: null,
    image: "assets/sneakers/adopte-marine.png",
  },
  {
    id: "kaki",
    name: "Sentier",
    colorway: "Vert Olive / Kaki",
    primary: "#5c6438",
    secondary: "#828d52",
    text: "light",
    description:
      "Streetwear utilitaire, esprit terrain. Robuste, franche, prête à tout. Elle n'a peur de rien, et ça se voit.",
    price: "145 €",
    badge: null,
    image: "assets/sneakers/adopte-kaki.png",
  },
  {
    id: "terracotta",
    name: "Brasier",
    colorway: "Rouge Brique / Terracotta",
    primary: "#a8452f",
    secondary: "#cb6d4f",
    text: "light",
    description:
      "Édition limitée, matière suédée qui appelle la caresse. Un coloris chaud et rare pour celles et ceux qui aiment sortir du lot.",
    price: "179 €",
    badge: "Édition limitée",
    image: "assets/sneakers/adopte-terracotta.png",
  },
  {
    id: "nude",
    name: "Pétale",
    colorway: "Rose Poudré / Nude",
    primary: "#e5b8b3",
    secondary: "#c88f8a",
    text: "dark",
    description:
      "Douce, lifestyle et totalement assumée. Une silhouette tout en légèreté qui adoucit n'importe quelle tenue.",
    price: "135 €",
    badge: null,
    image: "assets/sneakers/adopte-nude.png",
  },
  {
    id: "argent",
    name: "Nébuleuse",
    colorway: "Gris Perle / Argent",
    primary: "#c4c7cc",
    secondary: "#989ea6",
    text: "dark",
    description:
      "Finition technique et semelle épaisse dad-shoes. Le confort d'un nuage, l'allure d'un vaisseau. Ose.",
    price: "169 €",
    badge: null,
    image: "assets/sneakers/adopte-argent.png",
  },
];
