/* =============================================================================
   audio.js — Hooks son / SFX (placeholders)
   -----------------------------------------------------------------------------
   Aucune génération de son ici. On expose une petite API play(name) et un
   toggle mute. Les fichiers sont des PLACEHOLDERS : dépose tes propres sons
   libres de droits dans /audio et garde les mêmes noms de fichiers, ou change
   la table SOUNDS ci-dessous.

   Événements prévus par le brief :
   - play('change')   → changement de sneaker dans le carousel
   - play('enter')    → entrée dans une section (scroll storytelling)
   - play('benefits') → arrivée sur les sections "Pourquoi adopter"
   - play('click')    → clic sur une paire / bouton
   ========================================================================== */

const SOUNDS = {
  change: "audio/change.mp3", // PLACEHOLDER — remplace par ton SFX
  enter: "audio/enter.mp3", // PLACEHOLDER
  benefits: "audio/benefits.mp3", // PLACEHOLDER
  click: "audio/click.mp3", // PLACEHOLDER
};

let muted = true; // on démarre en muet (bonne pratique : pas de son auto)
const cache = {};

function getAudio(name) {
  if (!SOUNDS[name]) return null;
  if (!cache[name]) {
    const a = new Audio(SOUNDS[name]);
    a.preload = "none"; // on ne charge pas tant que les fichiers n'existent pas
    a.volume = 0.4;
    cache[name] = a;
  }
  return cache[name];
}

export const audio = {
  isMuted: () => muted,

  toggleMute() {
    muted = !muted;
    return muted;
  },

  setMuted(value) {
    muted = value;
  },

  /**
   * Joue un SFX si non-muet. Silencieusement no-op si le fichier n'existe pas
   * encore (les placeholders 404 ne cassent rien).
   */
  play(name) {
    if (muted) return;
    const a = getAudio(name);
    if (!a) return;
    try {
      a.currentTime = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {
      /* placeholder manquant → on ignore */
    }
  },
};
