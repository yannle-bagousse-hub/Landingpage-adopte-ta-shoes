/* =============================================================================
   collection-data.js — Source de vérité de la section "Toute la collection"
   (scroll horizontal, cf. js/main.js § initCollectionGrid + js/collection3d.js)
   UNIQUEMENT.
   -----------------------------------------------------------------------------
   ISOLATION VOLONTAIRE : ce fichier DUPLIQUE (ne réimporte pas) les noms/
   coloris déjà utilisés par le carousel héro (js/hero-data.js), pour que les
   noms de modèles affichés ici restent cohérents avec le reste du site
   ("Jordan", "Nike Air Max" + variantes), SANS créer de dépendance vers le
   code du carousel héro — cette section peut donc être modifiée librement
   sans jamais risquer de casser le hero (et inversement).

   Champs par carte :
   - id, modelKey ("jordan" | "airmax"), model (chemin du .glb), tint (teinte
     du matériau, cf. js/collection3d.js)
   - name, colorway : nom affiché (cohérent avec le carousel héro)
   - primary, secondary, text : couleurs d'accent de la carte (fond, badge,
     bouton, sélecteur de taille) + "light"/"dark" pour le texte lisible
   - price : prix d'exemple
   - tagline : accroche courte (1 ligne, fiche produit)
   - sizes : tailles disponibles (pastilles cliquables, sélection visuelle
     uniquement — pas de panier réel pour l'instant)
   - badge : "Nouveauté" | "Édition limitée" | "Meilleure vente" | null
   ========================================================================== */

const MODELS = {
  jordan: "assets/models/miles_morales_shoes.glb",
  airmax: "assets/models/air_max_90.glb",
};

const SIZES = [39, 40, 41, 42, 43, 44, 45];

export const COLLECTION_LOOKS = [
  {
    id: "jordan-rouge-noir",
    modelKey: "jordan",
    name: "Jordan",
    colorway: "Rouge / Noir",
    tint: "#c8321f",
    primary: "#c8321f",
    secondary: "#1a1a1a",
    text: "light",
    price: "179 €",
    tagline: "Le classique qui ne quitte jamais le game.",
    badge: "Meilleure vente",
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
    price: "169 €",
    tagline: "Une touche royale sous les lumières de la ville.",
    badge: null,
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
    price: "159 €",
    tagline: "Sobre et précise, elle se glisse partout.",
    badge: null,
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
    price: "189 €",
    tagline: "Le vestiaire du soir, liseré doré.",
    badge: "Édition limitée",
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
    price: "149 €",
    tagline: "L'indémodable revisité, silhouette 90's.",
    badge: "Nouveauté",
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
    price: "155 €",
    tagline: "Furtive et polyvalente, jamais repérée.",
    badge: null,
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
    price: "149 €",
    tagline: "Un bleu profond façon nuit d'entrepôt.",
    badge: null,
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
    price: "165 €",
    tagline: "Le rouge qui claque sur l'asphalte.",
    badge: null,
  },
].map((look) => ({ ...look, model: MODELS[look.modelKey], sizes: SIZES }));
