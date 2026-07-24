/* =============================================================================
   storytelling-data.js — Textes de la section "storytelling" scroll-driven
   (chaussure géante, cf. js/storytelling.js) UNIQUEMENT.
   -----------------------------------------------------------------------------
   ISOLATION VOLONTAIRE, même principe que js/collection-data.js : ce fichier
   ne dépend d'aucune autre donnée du site (ni HERO_LOOKS, ni COLLECTION_LOOKS)
   pour rester une section 100% additive, sans risque d'impact sur le
   carousel héro ou la collection.

   Champs par étape :
   - id     : identifiant court (utile pour le débogage / data-step)
   - align  : "left" | "right" — côté d'apparition du texte (alterne pour ne
              jamais chevaucher la chaussure géante centrée)
   - kicker : courte accroche/étiquette (petite typo, au-dessus du texte)
   - text   : paragraphe (1-3 phrases) — contenu d'exemple à ajuster librement.
   ========================================================================== */

export const STORY_STEPS = [
  {
    id: "origine",
    align: "left",
    kicker: "L'histoire",
    text: "Née dans la rue, portée sur les parquets. Chaque silhouette qu'on adopte a d'abord dû faire ses preuves ailleurs, avant de devenir un classique du quotidien.",
  },
  {
    id: "semelle",
    align: "right",
    kicker: "Le savoir-faire",
    text: "Sous la semelle, des années d'ingénierie : amorti réactif, accroche qui tient la distance. Le confort ne se voit pas, il se sent à chaque pas.",
  },
  {
    id: "matiere",
    align: "left",
    kicker: "Les matières",
    text: "Cuir pleine fleur, mesh technique respirant, surpiqûres qui ne bougent pas. On choisit des matières qui vieillissent bien, parce qu'une paire adoptée doit durer.",
  },
  {
    id: "signature",
    align: "right",
    kicker: "La signature",
    text: "Un profil qu'on reconnaît entre mille. Ce sont ces détails-là qu'Adopte ta shoes va chercher, saison après saison, pour toi.",
  },
];
