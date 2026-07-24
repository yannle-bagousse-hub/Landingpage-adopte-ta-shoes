/* =============================================================================
   site-intro.js — Page d'intro (chaussures géantes, une fois par session +
   rejouable depuis le logo du header).
   -----------------------------------------------------------------------------
   COMPOSANT 100% À PART. Contrairement aux deux tentatives précédentes, ce
   module :
     - N'EST IMPORTÉ PAR AUCUN FICHIER DU SITE (ni main.js, ni aucun autre) —
       chargé par son propre <script type="module"> dans index.html.
     - N'IMPORTE AUCUN FICHIER DU SITE — ni sneaker3d.js, ni hero-data.js, ni
       carousel.js, ni storytelling.js : uniquement Three.js (CDN, comme les
       autres modules 3D) et le GSAP global déjà chargé par le site (lecture
       seule de window.gsap, comme sneaker3d.js/storytelling.js le font déjà).
     - CONSTRUIT SON PROPRE DOM ET SON PROPRE CSS (site-intro.css) : rien dans
       index.html/styles.css n'est dédié à ce module au-delà des lignes qui le
       chargent (un <link>, un <script>) et de l'attribut onclick posé sur le
       logo du header (cf. index.html) qui appelle window.replayIntro().
     - NE TOUCHE JAMAIS aux éléments existants du site (header, carrousel,
       storytelling, etc.) : il se contente de les RECOUVRIR visuellement
       (position:fixed, z-index très élevé, fond opaque), qui continuent de se
       charger/exister EXACTEMENT comme si cette page n'existait pas.
     - GÈRE SON PROPRE SCROLL : bloque le scroll réel de la page (overflow
       hidden + interception événementielle), pilote son animation via ses
       propres écouteurs wheel/touch/clavier — AUCUN ScrollTrigger, AUCUNE
       interaction avec Lenis ou les ScrollTrigger déjà créés ailleurs.
     - Se retire ENTIÈREMENT du DOM une fois terminé, force la page réelle
       tout en haut (window.scrollTo(0,0)), débloque le scroll, retire tous
       ses propres écouteurs — rien ne peut donc intercepter un clic/scroll
       par la suite, et l'utilisateur atterrit toujours au même endroit.
     - EXPOSE window.replayIntro() : rejouable à volonté (bouton logo du
       header), pas seulement au premier chargement — toute la séquence
       (construction DOM, scène 3D, écouteurs) est reconstruite à neuf à
       chaque appel puis entièrement détruite à la fin, sans résidu.
   ========================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const SESSION_KEY = "adopte-site-intro-played";

/* ⭐ CONFIGURATION RAPIDE (modèles/teintes/mouvements des chaussures géantes) ⭐
   Seulement DEUX fichiers .glb réellement distincts existent dans le projet
   (les autres .glb du dossier assets/models/ sont des exports plus lourds du
   même modèle de base, jusqu'à ~90 Mo — les charger tous pour un simple écran
   d'intro pénaliserait fortement le temps de chargement). Pour obtenir 4
   chaussures visuellement distinctes sans multiplier les téléchargements, les
   DEUX modèles sont chacun chargés UNE SEULE FOIS (cache par URL, cf.
   loadGLTF) puis CLONÉS et teintés différemment — même principe que
   sneaker3d.js/collection3d.js. Chaque entrée a ses PROPRES paramètres de
   mouvement (rayon d'orbite, vitesse, sens, oscillation verticale, phase) —
   volontairement variés pour un rendu organique plutôt que mécanique. */
const JORDAN = "assets/models/miles_morales_shoes.glb";
const AIRMAX = "assets/models/air_max_90.glb";
const SHOES = [
  { url: JORDAN, tint: "#c8321f", yaw: 0, angle: 0.0, orbitRadius: 0.26, orbitSpeed: 0.8, orbitDir: 1, spin: 2.1, spinDir: 1, bobAmp: 0.05, bobSpeed: 0.55, phase: 0.0, sizeMul: 1.05 },
  { url: AIRMAX, tint: "#ece5d6", yaw: Math.PI / 2, angle: Math.PI * 0.5, orbitRadius: 0.36, orbitSpeed: 0.5, orbitDir: -1, spin: 1.6, spinDir: -1, bobAmp: 0.08, bobSpeed: 0.4, phase: 1.4, sizeMul: 0.9 },
  { url: JORDAN, tint: "#1d3f8f", yaw: 0, angle: Math.PI, orbitRadius: 0.3, orbitSpeed: 0.65, orbitDir: 1, spin: 2.6, spinDir: -1, bobAmp: 0.04, bobSpeed: 0.75, phase: 2.6, sizeMul: 0.98 },
  { url: AIRMAX, tint: "#1c1c1e", yaw: Math.PI / 2, angle: Math.PI * 1.5, orbitRadius: 0.2, orbitSpeed: 1.0, orbitDir: -1, spin: 1.9, spinDir: 1, bobAmp: 0.07, bobSpeed: 0.48, phase: 3.9, sizeMul: 1.1 },
];

const ARRIVAL_COVER = 1.75; // taille d'arrivée : déborde volontairement du cadre (effet immersif)
const STEADY_COVER = 0.85; // taille "de croisière" une fois l'entrée stabilisée
const MOBILE_SCALE = 0.72; // toute la courbe de taille, réduite sur mobile
const ORBIT_TURNS_BASE = 0.85; // tours d'orbite (base, multipliée par orbitSpeed propre à chaque paire)
const SPIN_TURNS_BASE = 2.0; // tours sur elle-même (base, multipliée par spin propre à chaque paire)
const SCROLL_TO_PROGRESS = 1 / 2600; // sensibilité molette (px de deltaY cumulés → 0..1)
const TOUCH_TO_PROGRESS = 1 / 900; // sensibilité tactile (px de swipe cumulés → 0..1)

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (_) {
    return false;
  }
}

let isPlaying = false; // ré-entrance : un 2e appel pendant que l'intro tourne déjà est ignoré

/**
 * Joue la séquence d'intro en entier (construction → logo → chaussures →
 * scroll → sortie → destruction complète). Rejouable à volonté (cf.
 * window.replayIntro plus bas) : reconstruit tout à neuf à chaque appel.
 * @returns {boolean} true si l'intro démarre réellement, false si elle a été
 *          ignorée (déjà en cours, WebGL/GSAP indisponible, reduced-motion).
 */
function playIntro() {
  if (isPlaying) return false;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gsap = window.gsap;
  if (prefersReduced || !webglAvailable() || !gsap) {
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (_) {}
    return false;
  }
  isPlaying = true;

  // ---- DOM : construit entièrement ici, inséré tout en haut de <body> ----
  const root = document.createElement("div");
  root.id = "site-intro";
  root.innerHTML = `
    <div class="site-intro-canvas"></div>
    <div class="site-intro-logo">Adopte<span class="site-intro-dot">.</span></div>
    <div class="site-intro-hint">Scrolle pour continuer</div>
  `;
  document.body.prepend(root);

  const canvasMount = root.querySelector(".site-intro-canvas");
  const logoEl = root.querySelector(".site-intro-logo");
  const hintEl = root.querySelector(".site-intro-hint");

  // ---- Bloque le scroll RÉEL de la page (indépendant de Lenis/ScrollTrigger) ----
  const savedHtmlOverflow = document.documentElement.style.overflow;
  const savedBodyOverflow = document.body.style.overflow;
  document.documentElement.style.overflow = "hidden";
  document.body.style.overflow = "hidden";

  // ---- Scène / caméra / renderer DÉDIÉS (aucun lien avec le reste du site) ----
  const isMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720;
  const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.pointerEvents = "none";
  canvasMount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(3, 4, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.9);
  fill.position.set(-4, 1, 2);
  scene.add(fill);

  // groupe uniquement utilitaire : sert de point d'accroche pour l'explosion
  // de sortie (scale global) — le mouvement de CHAQUE chaussure (orbite,
  // spin, oscillation) est calculé individuellement dans tick(), pas via la
  // rotation de ce groupe (pour des trajectoires réellement indépendantes).
  const rig = new THREE.Group();
  scene.add(rig);

  function resize() {
    const w = canvasMount.clientWidth || 1;
    const h = canvasMount.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvasMount);
  resize();

  // ---- Modèles : chaque URL chargée UNE SEULE FOIS (cache), puis CLONÉE et
  // teintée pour chaque slot qui la référence (cf. commentaire SHOES). ------
  const loader = new GLTFLoader();
  const gltfCache = new Map();
  function loadGLTF(url) {
    if (!gltfCache.has(url)) gltfCache.set(url, new Promise((res, rej) => loader.load(url, res, undefined, rej)));
    return gltfCache.get(url);
  }

  const slots = SHOES.map((cfg) => ({ cfg, wrapper: null, maxDim: 1 }));
  slots.forEach((slot) => {
    loadGLTF(slot.cfg.url)
      .then((gltf) => {
        const inner = gltf.scene.clone(true);
        inner.traverse((o) => {
          if (!o.isMesh) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const cloned = mats.map((m) => {
            const c = m.clone();
            if (slot.cfg.tint && c.color) c.color = new THREE.Color(slot.cfg.tint);
            if ("envMapIntensity" in c) c.envMapIntensity = isMobile ? 0.5 : 0.9;
            return c;
          });
          o.material = Array.isArray(o.material) ? cloned : cloned[0];
        });

        // Retrait heuristique du socle/sol éventuel : même principe
        // géométrique que le reste du site (sneaker3d.js/storytelling.js),
        // dupliqué ici volontairement (utilitaire sans état partagé, aucun
        // import croisé avec le code existant).
        const whole = new THREE.Box3().setFromObject(inner);
        const ws = new THREE.Vector3();
        whole.getSize(ws);
        const wholeFoot = Math.max(ws.x, ws.z) || 1;
        const socles = [];
        inner.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const b = new THREE.Box3().setFromObject(o);
          const s = new THREE.Vector3();
          b.getSize(s);
          const foot = Math.max(s.x, s.z);
          if (s.y < 0.12 * foot && foot > 0.6 * wholeFoot) socles.push(o);
        });
        socles.forEach((m) => m.parent && m.parent.remove(m));

        const box = new THREE.Box3().setFromObject(inner);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        inner.position.sub(center);

        const wrapper = new THREE.Group();
        wrapper.add(inner);
        slot.maxDim = Math.max(size.x, size.y, size.z) || 1;
        slot.wrapper = wrapper;
        rig.add(wrapper);
      })
      .catch((err) => console.warn(`[site-intro] modèle introuvable (${slot.cfg.url}) :`, err));
  });

  // ---- Séquence : logo → chaussures → scroll (orbite/spin) → sortie -------
  let stage = "logo"; // "logo" -> "scroll" -> "exiting" -> "done"
  let rawProgress = 0; // accumulé via wheel/touch/clavier, 0 → 1
  let shown = 0; // valeur lissée (spin/orbite)
  const sizeState = { t: 0 }; // 0 = taille d'arrivée (ARRIVAL_COVER, déborde), 1 = taille de croisière (STEADY_COVER)
  const clock = new THREE.Clock();

  // ---- Blocage du scroll réel : ÉVÉNEMENTIEL (preventDefault), actif DÈS LE
  // DÉBUT de l'intro (pas seulement une fois l'entrée terminée) et jusqu'à
  // finish() UNIQUEMENT. IMPORTANT : ne pas se reposer sur le seul
  // overflow:hidden posé plus haut — le loader EXISTANT du site (main.js,
  // initLoader) manipule aussi document.body.style.overflow (hidden puis ""
  // après ~2.5s, indépendamment de cette intro) ; s'appuyer UNIQUEMENT sur le
  // CSS créerait une fenêtre où la vraie page redeviendrait scrollable sous
  // l'overlay encore actif. Ces écouteurs, eux, bloquent quoi qu'il arrive à
  // la propriété CSS par ailleurs, tant qu'ils sont attachés. -----------------
  let touchStartY = 0;
  function addProgress(delta) {
    if (stage !== "scroll") return; // no-op pendant "logo"/"exiting"/"done", mais l'event est déjà bloqué (preventDefault) dans tous les cas
    rawProgress = clamp(rawProgress + delta, 0, 1);
    if (rawProgress >= 1) startExit();
  }
  // IMPORTANT : stopImmediatePropagation() en plus de preventDefault(). Le
  // site utilise Lenis (smooth scroll, cf. main.js § initSmoothScroll) qui
  // pose SES PROPRES écouteurs wheel/touch globaux pour piloter sa position
  // de scroll virtuelle — sans stopImmediatePropagation(), Lenis continuerait
  // de recevoir et d'accumuler ces évènements pendant l'intro, et pourrait
  // "rattraper" ce retard d'un coup en sautant une fois l'intro terminée.
  // Ces écouteurs sont attachés en phase de CAPTURE sur window (le point le
  // plus en amont possible) : ils s'exécutent avant tout autre écouteur.
  function onWheel(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    addProgress(e.deltaY * SCROLL_TO_PROGRESS);
  }
  function onTouchStart(e) {
    e.stopImmediatePropagation();
    touchStartY = e.touches && e.touches[0] ? e.touches[0].clientY : 0;
  }
  function onTouchMove(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    const y = e.touches && e.touches[0] ? e.touches[0].clientY : touchStartY;
    const delta = touchStartY - y;
    touchStartY = y;
    addProgress(delta * TOUCH_TO_PROGRESS);
  }
  const SCROLL_KEYS = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " ", "Spacebar"];
  function onKeydown(e) {
    if (!SCROLL_KEYS.includes(e.key)) return;
    e.preventDefault(); // empêche aussi le navigateur de scroller la vraie page au clavier
    e.stopImmediatePropagation();
    if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " " || e.key === "Spacebar") addProgress(0.06);
  }
  window.addEventListener("wheel", onWheel, { passive: false, capture: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
  window.addEventListener("keydown", onKeydown, { capture: true });
  function removeScrollListeners() {
    // { capture: true } DOIT être répété ici : addEventListener/
    // removeEventListener ne considèrent la même inscription que si la phase
    // de capture correspond — sans ce rappel, ces écouteurs resteraient
    // attachés indéfiniment après finish().
    window.removeEventListener("wheel", onWheel, { capture: true });
    window.removeEventListener("touchstart", onTouchStart, { capture: true });
    window.removeEventListener("touchmove", onTouchMove, { capture: true });
    window.removeEventListener("keydown", onKeydown, { capture: true });
  }

  const tl = gsap.timeline({
    onComplete: () => {
      stage = "scroll";
      hintEl.classList.add("is-visible");
    },
  });
  tl.to(logoEl, { opacity: 1, scale: 1, duration: 0.9, ease: "expo.out" })
    .to(logoEl, { opacity: 1, duration: 0.5 }) // tenue courte, lisible
    .call(() => canvasMount.classList.add("is-visible")) // démarre le fondu CSS du canvas (0.8s, cf. site-intro.css)
    .to(sizeState, { t: 1, duration: 1.6, ease: "power2.out" }, "<") // arrivée géante → taille de croisière, en même temps que le fondu
    .to(logoEl, { opacity: 0, scale: 1.05, duration: 0.6, ease: "power2.in" }, "-=0.2");

  function startExit() {
    if (stage === "exiting" || stage === "done") return;
    stage = "exiting";
    // les écouteurs restent attachés (blocage scroll toujours nécessaire
    // jusqu'à finish()) ; addProgress() devient un no-op car stage !== "scroll".
    hintEl.classList.remove("is-visible");
    gsap
      .timeline({ onComplete: finish })
      .to(rig.scale, { x: 2.4, y: 2.4, z: 2.4, duration: 0.7, ease: "power2.in" }, 0)
      .to(canvasMount, { opacity: 0, duration: 0.6, ease: "power1.in" }, 0.1)
      .to(root, { opacity: 0, duration: 0.5, ease: "power1.in" }, 0.2);
  }

  let done = false;
  function finish() {
    if (done) return;
    done = true;
    stage = "done";
    removeScrollListeners();
    // Corrige le bug de scroll résiduel : quelle que soit la quantité de
    // scroll "virtuel" accumulée pendant l'intro, la vraie page atterrit
    // TOUJOURS tout en haut. Fait AVANT de redonner la main au scroll normal
    // (overflow restauré juste après), pour qu'aucun frame intermédiaire ne
    // puisse laisser voir une position différente de 0.
    window.scrollTo(0, 0);
    document.documentElement.style.overflow = savedHtmlOverflow;
    document.body.style.overflow = savedBodyOverflow;
    if (rafId) cancelAnimationFrame(rafId);
    ro.disconnect();
    slots.forEach((s) => {
      if (!s.wrapper) return;
      s.wrapper.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
            m.dispose();
          });
        }
      });
    });
    renderer.dispose();
    renderer.domElement.remove();
    root.remove();
    try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (_) {}
    isPlaying = false;
  }

  let rafId = null;
  function tick() {
    const t = clock.getElapsedTime();
    shown += (rawProgress - shown) * (stage === "exiting" ? 1 : 0.12);

    const visH = 2 * Math.tan(((camera.fov * Math.PI) / 180) / 2) * camera.position.z;
    const visW = visH * camera.aspect;
    const baseCover = lerp(ARRIVAL_COVER, STEADY_COVER, sizeState.t) * (isMobile ? MOBILE_SCALE : 1);

    slots.forEach((s) => {
      if (!s.wrapper) return;
      const cfg = s.cfg;
      const cover = baseCover * cfg.sizeMul;
      const size = Math.min(cover * visW, cover * visH);
      s.wrapper.scale.setScalar(size / s.maxDim);

      // trajectoire INDIVIDUELLE (rayon/vitesse/sens/phase propres à chaque
      // paire, cf. SHOES) : pas une orbite circulaire identique pour toutes —
      // rendu plus organique, moins mécanique/répétitif entre chaussures.
      const orbitAngle = cfg.angle + cfg.orbitDir * (t * 0.05 + shown * Math.PI * 2 * ORBIT_TURNS_BASE) * cfg.orbitSpeed;
      const radius = cfg.orbitRadius * visW;
      const bobY = Math.sin(t * cfg.bobSpeed + cfg.phase) * cfg.bobAmp * visH;
      s.wrapper.position.set(Math.cos(orbitAngle) * radius, bobY, Math.sin(orbitAngle) * radius);

      s.wrapper.rotation.y = cfg.yaw + cfg.spinDir * (t * 0.1 + shown * Math.PI * 2 * SPIN_TURNS_BASE) * cfg.spin;
    });

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  tick();

  return true;
}

// Expose la fonction de relecture (cf. onclick posé sur le logo du header,
// index.html) — SEUL point de contact avec le reste du site, en LECTURE
// (le header appelle cette fonction, ce module ne connaît rien du header).
window.replayIntro = playIntro;

// Lecture automatique au premier chargement (une fois par session).
let playedAlready = false;
try { playedAlready = !!sessionStorage.getItem(SESSION_KEY); } catch (_) {}
if (!playedAlready) playIntro();
