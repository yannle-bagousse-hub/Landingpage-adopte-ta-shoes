/* =============================================================================
   hero-data.js — Source de vérité du CAROUSEL HÉRO (Three.js) uniquement.
   -----------------------------------------------------------------------------
   Le hero n'utilise que DEUX modèles .glb sources (voir HERO_MODELS). Chaque
   carte du carousel est une VARIANTE DE COULEUR de l'un de ces deux modèles :
   même géométrie clonée, matériau teinté (cf. sneaker3d.js / buildModel), comme
   déjà fait pour la section "Toute la collection" (collection3d.js).

   Pour AJOUTER une variante : ajoute un objet à HERO_LOOKS avec un `modelKey`
   existant. Pour AJOUTER une ambiance : ajoute une clé à AMBIANCES + la classe
   CSS correspondante dans styles.css (section "6bis. Ambiances hero").

   `releaseDate` + `designer` + `story` : utilisés par le panneau d'info qui
   apparaît au clic sur une paire (zoom, cf. js/main.js § "Focus / zoom hero").
   Distincts de `description` (ton "vente", utilisé par la section Profil) :
   `story` est une mini-histoire/inspiration, plus courte et factuelle —
   textes/valeurs d'exemple à ajuster librement.

   La grille "Toute la collection" (js/data.js → PRODUCTS) est indépendante et
   n'est PAS affectée par ce fichier.
   ========================================================================== */

export const HERO_MODELS = {
  jordan: "assets/models/miles_morales_shoes.glb",
  airmax: "assets/models/air_max_90.glb",
};

/* Libellé + description de chaque ambiance urbaine (une par carte, cf. champ
   `ambiance` ci-dessous). Le rendu visuel (dégradés CSS) vit dans styles.css. */
export const AMBIANCES = {
  ruelle: { label: "Ruelle, graffitis" },
  skyline: { label: "Skyline de nuit, néons" },
  metro: { label: "Station de métro" },
  rooftop: { label: "Rooftop, coucher de soleil" },
  briques: { label: "Mur de briques, éclairage dramatique" },
  parking: { label: "Parking souterrain" },
  warehouse: { label: "Friche industrielle" },
  terrain: { label: "Terrain de basket extérieur" },
};

const RAW_LOOKS = [
  {
    id: "jordan-rouge-noir",
    modelKey: "jordan",
    name: "Jordan",
    colorway: "Rouge / Noir",
    tint: "#c8321f",
    primary: "#c8321f",
    secondary: "#1a1a1a",
    text: "light",
    description:
      "Le classique qui ne quitte jamais le game. Silhouette haute, énergie brute : parfaite pour claquer des portes en sortant du block.",
    price: "179 €",
    badge: "Meilleure vente",
    ambiance: "ruelle",
    releaseDate: "1985",
    designer: "Nike / Jordan Brand — Peter Moore",
    story:
      "Née sur les parquets, adoptée dans la rue. Ce coloris rend hommage aux silhouettes qui ont fait basculer le basket dans la culture urbaine — un classique qui n'a jamais quitté le pavé.",
  },
  {
    id: "jordan-bleu-royal",
    modelKey: "jordan",
    name: "Jordan",
    colorway: "Bleu Royal",
    tint: "#1d3f8f",
    primary: "#1d3f8f",
    secondary: "#0f254f",
    text: "light",
    description:
      "Une touche royale sous les lumières de la ville. Elle capte l'œil à chaque coin de rue, sans jamais forcer le trait.",
    price: "169 €",
    badge: null,
    ambiance: "skyline",
    releaseDate: "1985",
    designer: "Nike / Jordan Brand — Peter Moore",
    story:
      "Le bleu qui a fait basculer les codes : sobre sur le terrain, insolent en dehors. Une variante pensée pour celles et ceux qui préfèrent l'understatement au flash.",
  },
  {
    id: "jordan-gris-blanc",
    modelKey: "jordan",
    name: "Jordan",
    colorway: "Gris Cool / Blanc",
    tint: "#c7cbd1",
    primary: "#c7cbd1",
    secondary: "#8b909a",
    text: "dark",
    description:
      "Sobre et précise, elle se glisse partout sans jamais se fondre dans le décor. Le bon compromis entre discrétion et caractère.",
    price: "159 €",
    badge: null,
    ambiance: "metro",
    releaseDate: "2001",
    designer: "Nike / Jordan Brand — Tinker Hatfield",
    story:
      "Le compromis parfait entre discrétion et présence. Inspirée des silhouettes 'cool grey' portées aussi bien en semaine qu'en soirée, elle ne se démode jamais.",
  },
  {
    id: "jordan-noir-or",
    modelKey: "jordan",
    name: "Jordan",
    colorway: "Noir / Or",
    tint: "#1c1712",
    primary: "#1c1712",
    secondary: "#caa24a",
    text: "light",
    description:
      "Le vestiaire du soir. Noir profond, liseré doré : elle est faite pour les rooftops et les fins de journée qui s'étirent.",
    price: "189 €",
    badge: "Édition limitée",
    ambiance: "rooftop",
    releaseDate: "2011",
    designer: "Nike / Jordan Brand — Tinker Hatfield",
    story:
      "Une édition pensée pour la nuit : noir mat en journée, reflets dorés sous les lumières artificielles. Le genre de paire qu'on garde pour les sorties qui comptent.",
  },
  {
    id: "airmax-blanc-gris",
    modelKey: "airmax",
    name: "Nike Air Max",
    colorway: "Blanc / Gris",
    tint: "#e7e5e0",
    primary: "#e7e5e0",
    secondary: "#a9a9a4",
    text: "dark",
    description:
      "L'indémodable revisité. Coussin d'air, silhouette 90's, propre du premier au dernier lacet.",
    price: "149 €",
    badge: "Nouveauté",
    ambiance: "briques",
    releaseDate: "1990",
    designer: "Nike — Tinker Hatfield",
    story:
      "L'Air Max 90 originale, dans son jus. Chambre à air visible, silhouette culte : le point de départ de toute une culture sneaker qui n'a jamais vraiment cessé.",
  },
  {
    id: "airmax-noir-total",
    modelKey: "airmax",
    name: "Nike Air Max",
    colorway: "Noir Total",
    tint: "#1c1c1e",
    primary: "#1c1c1e",
    secondary: "#3a3a3d",
    text: "light",
    description:
      "Furtive et polyvalente, elle avale le bitume sans un bruit. Le noir total, pour ne jamais être repérée.",
    price: "155 €",
    badge: null,
    ambiance: "parking",
    releaseDate: "1990",
    designer: "Nike — Tinker Hatfield",
    story:
      "Le blackout ultime. Une version qui gomme les détails pour ne garder que la silhouette — furtive le jour, imparable le soir.",
  },
  {
    id: "airmax-bleu-marine",
    modelKey: "airmax",
    name: "Nike Air Max",
    colorway: "Bleu Marine",
    tint: "#243456",
    primary: "#243456",
    secondary: "#425a8f",
    text: "light",
    description:
      "Un bleu profond façon nuit d'entrepôt, entre lumière sodium et silence industriel.",
    price: "149 €",
    badge: null,
    ambiance: "warehouse",
    releaseDate: "1990",
    designer: "Nike — Tinker Hatfield",
    story:
      "Un bleu profond qui rappelle les entrepôts industriels et les nuits de travail. Le genre de coloris qui traverse les saisons sans jamais lasser.",
  },
  {
    id: "airmax-rouge-vif",
    modelKey: "airmax",
    name: "Nike Air Max",
    colorway: "Rouge Vif",
    tint: "#d43920",
    primary: "#d43920",
    secondary: "#7a1d10",
    text: "light",
    description:
      "Le rouge qui claque sur l'asphalte du terrain. Faite pour courir, dribbler, et se faire remarquer.",
    price: "165 €",
    badge: null,
    ambiance: "terrain",
    releaseDate: "1990",
    designer: "Nike — Tinker Hatfield",
    story:
      "Le coloris qui ne passe jamais inaperçu. Pensée pour le terrain autant que pour le bitume, elle réclame le mouvement.",
  },
];

// résout le champ `model` (URL .glb) à partir de `modelKey` → seule source
// de vérité pour le chemin de fichier (HERO_MODELS ci-dessus).
export const HERO_LOOKS = RAW_LOOKS.map((look) => ({
  ...look,
  model: HERO_MODELS[look.modelKey],
}));
