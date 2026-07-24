/* =============================================================================
   sneaker3d.js — Manège 3D (Three.js) : TOUTES les cartes visibles du carousel
   sont rendues simultanément dans UNE seule scène.
   -----------------------------------------------------------------------------
   PÉRIMÈTRE STRICT : ne s'occupe QUE du rendu 3D des chaussures du hero.
   La mécanique du carousel (swipe / molette / snapping / pagination / autoplay)
   reste 100% dans carousel.js ; ce module se contente de LIRE sa position
   continue (getPosition) pour placer chaque modèle comme le manège, et
   d'OBSERVER la souris / le drag pour le mouvement premium. Il ne pilote rien.

   MODÈLES (convention, voir hero-data.js) :
   - seulement DEUX fichiers .glb sources (`product.model`, un par `modelKey`).
   - chaque carte = un CLONE de son modèle source, teinté avec `product.tint`
     (même principe que collection3d.js pour la section "Toute la collection").
   Un seul renderer / une seule scène / deux chargements réseau au total.

   MOUVEMENT (identique au comportement validé, appliqué surtout à la paire
   centrée, atténué pour les voisines) :
   - oscillation/tilt idle, - rotation qui suit le drag, - parallaxe souris.

   ROBUSTESSE : détection WebGL (sinon 2D conservé), perte/restauration de
   contexte, qualité réduite sur mobile.
   ========================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const gsap = window.gsap;
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ORIENTATION PAR MODÈLE SOURCE — chaque .glb peut être exporté dans un sens
   différent. But : pointe du pied vers la DROITE, chaussure debout (les modèles
   sont en Y-up, donc c'est un problème de YAW seulement).
   Clé = modelKey (cf. hero-data.js) ; valeurs en radians (yaw = rotation
   gauche/droite). ⭐ AJUSTE ICI si une paire pointe dans le mauvais sens :
   ajoute/retire Math.PI pour retourner la pointe. (pitch/roll dispo si besoin.) */
const ORIENT = {
  jordan: { yaw: 0 }, // miles_morales_shoes.glb — axe long déjà X
  airmax: { yaw: Math.PI / 2 }, // air_max_90.glb — axe long Z → +90° pour l'horizontale
};
function orientOf(modelKey) {
  const o = ORIENT[modelKey] || {};
  return { yaw: o.yaw || 0, pitch: o.pitch || 0, roll: o.roll || 0 };
}

/* Paramètres du manège 3D. La taille de la paire active est calculée en unités
   RELATIVES AU VIEWPORT (fraction de la largeur/hauteur visible de la caméra),
   PAS un multiplicateur fixe → rendu cohérent desktop / tablette / mobile, et
   aucun débordement horizontal (on borne par la dimension contraignante). */
const FIT = 2.2; // normalisation : ramène chaque modèle à une taille comparable
const DEPTH = 0.6; // léger recul Z des voisines (indice de profondeur)
const VISIBLE_AD = 2.2; // au-delà, la paire est masquée

/* ÉCHELLE — la paire active est mise en valeur (~3.8x les voisines) sans envahir
   l'écran. active = ACTIVE_COVER de la dimension contraignante du viewport ;
   inactive = active * restFrac(ad) (dégressif, mais jamais nulle → reste visible
   et identifiable). Valeurs à garder IDENTIQUES côté 2D (carousel.js). */
const ACTIVE_COVER = 0.56; // part du viewport occupée par la paire active
const INACTIVE_RATIO = 3.8; // active ≈ 3.8x les inactives
const REST_FALLOFF = 0.78; // les voisines rétrécissent avec la distance
const REST_MIN_FRAC = 0.08; // plancher (restent bien visibles)
const EDGE_FRAC = 0.4; // position X des voisines (relatif à la largeur visible)
function restFrac(ad) {
  return Math.max(REST_MIN_FRAC, (1 / INACTIVE_RATIO) * Math.pow(REST_FALLOFF, Math.max(0, ad - 1)));
}

// ZOOM (clic sur une paire, cf. main.js § "Focus / zoom hero") : la paire
// cliquée occupe ZOOM_COVER de la dimension contraignante du viewport (même
// principe/formule que ACTIVE_COVER, juste une part bien plus grande) —
// unité relative au viewport, comme partout ailleurs dans ce fichier.
// Valeur volontairement < 0.92 (essayé précédemment) : à cette marge réduite,
// le rognage en bas persistait malgré le recentrage caméra ci-dessous — plus
// de marge totale ici, en plus du décalage vertical (ZOOM_VOFFSET).
const ZOOM_COVER = 0.78; // part du viewport occupée par la paire zoomée
// Décalage vertical SUPPLÉMENTAIRE (fraction de visH) appliqué à la paire
// zoomée, en plus du recentrage sur l'axe optique de la caméra (camera.y) :
// laisse délibérément plus de marge en BAS qu'en haut (silhouette de
// chaussure = base large, permet une marge confortable sous la semelle).
const ZOOM_VOFFSET = 0.045;

/** Détection WebGL basique. */
export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (_) {
    return false;
  }
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.mount      - conteneur du canvas (couvre le viewport)
 * @param {HTMLElement} opts.pointerEl  - élément dont on observe drag/hover
 * @param {Array}       opts.products   - HERO_LOOKS (js/hero-data.js)
 * @param {Function}    opts.getPosition- () => position continue du carousel
 * @param {Function}   [opts.onReady]   - appelé quand le manège 3D est visible
 * @param {Function}   [opts.onShoeClick] - (index) => void, clic (≠ drag) sur
 *                      N'IMPORTE QUELLE paire visible, identifiée par raycaster
 * @returns API | null (null si WebGL indisponible → le 2D reste affiché)
 */
export function initSneaker3D({ mount, pointerEl, products, getPosition, onReady, onShoeClick }) {
  if (!mount || !webglAvailable()) return null;

  const N = products.length;
  const isMobile =
    window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720;

  // ---- Renderer (canvas transparent) ----
  const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  mount.appendChild(renderer.domElement);
  renderer.domElement.style.pointerEvents = "none"; // interactions => carousel

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.15, 6.6);

  // Éclairage réactif au thème clair/sombre (cf. point 7 de la demande) : une
  // pièce claire renvoie davantage de lumière ambiante (rebond) qu'une pièce
  // sombre — seule l'intensité ambiante varie, les lumières directionnelles/
  // rim (mise en scène "studio") restent identiques dans les deux thèmes.
  const initialTheme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  const lights = addLights(scene, isMobile, initialTheme);
  // AJOUT pur : réagit aux changements de thème EN DIRECT (bouton du header,
  // cf. main.js) sans recharger la page — ne touche à aucun autre réglage.
  function onThemeChange(e) {
    const light = !!(e && e.detail && e.detail.theme === "light");
    const base = isMobile ? 0.55 : 0.35;
    lights.ambient.intensity = base * (light ? 1.5 : 1);
  }
  window.addEventListener("adopte:theme-change", onThemeChange);
  let pmrem = null;
  if (!isMobile) {
    pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  }

  // ---- Un "slot" par produit : holder (position/échelle manège) > wrapper (modèle centré) ----
  const slots = products.map((p, i) => {
    const holder = new THREE.Group();
    scene.add(holder);
    // focus : 0 (inactive) → 1 (active), animé par GSAP pour l'échelle
    return { product: p, index: i, holder, wrapper: null, materials: [], loadedFile: null, focus: 0 };
  });
  let activeFocusIndex = -1;
  function setActiveFocus(a) {
    activeFocusIndex = a;
    slots.forEach((s) => {
      const to = s.index === a ? 1 : 0;
      if (gsap && !prefersReduced) gsap.to(s, { focus: to, duration: 0.5, ease: "power2.out", overwrite: true });
      else s.focus = to;
    });
  }

  // ---- Loader + cache ----
  const loader = new GLTFLoader();
  const gltfCache = new Map(); // url -> Promise<GLTF>
  function loadGLTF(url) {
    if (!gltfCache.has(url)) gltfCache.set(url, new Promise((res, rej) => loader.load(url, res, undefined, rej)));
    return gltfCache.get(url);
  }

  // ---- État interaction (partagé, pondéré par la proximité du centre) ----
  const target = { y: 0, x: 0 }; // parallaxe souris
  let dragOffsetY = 0;
  let dragging = false;
  let lastPointerX = 0;
  let interactive = true;
  const clock = new THREE.Clock();

  // ---- Zoom (paire cliquée, N'IMPORTE LAQUELLE parmi celles visibles) : ----
  // 0 → normal, 1 → agrandissement "héros" + recentrage, quelle que soit sa
  // position/taille de départ dans le manège (cf. tick()).
  const zoomState = { t: 0 };
  let zoomedIndex = -1;
  function setZoomed(active, index) {
    if (active) {
      zoomedIndex = index;
      if (gsap && !prefersReduced) gsap.to(zoomState, { t: 1, duration: 0.55, ease: "power3.out", overwrite: true });
      else zoomState.t = 1;
    } else if (gsap && !prefersReduced) {
      // IMPORTANT : on ne réinitialise zoomedIndex qu'à la fin du tween (onComplete),
      // sinon tick() perdrait la cible de zoom AVANT la fin de l'animation de
      // fermeture → la paire "sauterait" instantanément à sa taille normale au
      // lieu de rétrécir en douceur (régression déjà vue une fois, à éviter).
      gsap.to(zoomState, { t: 0, duration: 0.55, ease: "power3.out", overwrite: true, onComplete: () => { zoomedIndex = -1; } });
    } else {
      zoomState.t = 0;
      zoomedIndex = -1;
    }
  }

  /** Rayon écran (px CSS, relatif à `mount`) qu'occupe la paire ACTUELLEMENT
   *  zoomée une fois pleinement agrandie (ZOOM_COVER). Sert à main.js pour
   *  dimensionner le "trou" du voile flouté exactement à la taille réelle de
   *  la chaussure rendue (peu importe le modèle/son ratio l/h). 0 si aucune
   *  paire n'est zoomée. */
  function getHeroRadiusPx() {
    if (zoomedIndex === -1) return 0;
    const slot = slots[zoomedIndex];
    if (!slot || !slot.wrapper) return 0;
    const visH = 2 * Math.tan(((camera.fov * Math.PI) / 180) / 2) * camera.position.z;
    const visW = visH * camera.aspect;
    const nsw = slot.wrapper.userData.nsw || FIT;
    const nsh = slot.wrapper.userData.nsh || FIT;
    const heroScale = Math.min((ZOOM_COVER * visW) / nsw, (ZOOM_COVER * visH) / nsh);
    const wPx = nsw * heroScale * (mount.clientWidth / visW);
    const hPx = nsh * heroScale * (mount.clientHeight / visH);
    return Math.max(wPx, hPx) / 2;
  }

  /* ------------------------------------------------------------------------
     Détection clic (≠ drag de navigation) + raycaster : identifie QUELLE
     paire (parmi TOUTES celles visibles, pas seulement l'active) a été
     cliquée. AJOUT PUR : listeners supplémentaires sur le même élément que
     ceux déjà utilisés pour le parallax/drag ci-dessus — aucun listener
     existant n'est retiré ni modifié, la mécanique carousel.js n'est pas
     touchée. ---------------------------------------------------------------- */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function ndcFromClient(clientX, clientY) {
    const rect = mount.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    return ndc;
  }
  function slotIndexFromObject(obj) {
    let o = obj;
    while (o) {
      if (o.userData && o.userData.slotIndex !== undefined) return o.userData.slotIndex;
      o = o.parent;
    }
    return -1;
  }
  let clickStart = null;
  const CLICK_MAX_DIST = 8; // px — au-delà, on considère que c'est un drag de navigation
  const CLICK_MAX_MS = 500; // ms
  function onClickPointerDown(e) {
    clickStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  }
  function onClickPointerUp(e) {
    if (!clickStart || zoomedIndex !== -1) { clickStart = null; return; } // une paire est déjà zoomée : on n'interfère pas
    const dx = e.clientX - clickStart.x;
    const dy = e.clientY - clickStart.y;
    const dt = performance.now() - clickStart.t;
    const dist = Math.hypot(dx, dy);
    clickStart = null;
    if (dist > CLICK_MAX_DIST || dt > CLICK_MAX_MS) return; // mouvement/durée trop grands → drag, pas un clic

    raycaster.setFromCamera(ndcFromClient(e.clientX, e.clientY), camera);
    const candidates = slots.filter((s) => s.holder.visible && s.wrapper).map((s) => s.wrapper);
    const hits = raycaster.intersectObjects(candidates, true);
    if (!hits.length) return;
    const index = slotIndexFromObject(hits[0].object);
    if (index >= 0) onShoeClick && onShoeClick(index);
  }

  /* ---------------------------------------------------------------------- */
  /* Chargement : les DEUX modèles sources (un par modelKey présent dans      */
  /* `products`), en parallèle. Une fois les deux prêts, chaque carte clone  */
  /* son modèle source et le teinte avec sa propre couleur (product.tint).   */
  /* ---------------------------------------------------------------------- */
  async function boot() {
    const modelKeys = [...new Set(products.map((p) => p.modelKey))];
    const gltfByKey = new Map();
    await Promise.all(
      modelKeys.map(async (key) => {
        const url = products.find((p) => p.modelKey === key).model;
        try {
          gltfByKey.set(key, await loadGLTF(url));
        } catch (e) {
          console.warn(`[sneaker3d] modèle introuvable pour "${key}" (${url}) :`, e);
        }
      })
    );

    slots.forEach((s) => {
      const gltf = gltfByKey.get(s.product.modelKey);
      if (gltf) setSlotModel(s, gltf);
    });
    onReady && onReady(); // 2D masqué une fois les modèles disponibles
    printLog();
  }

  function setSlotModel(slot, gltf) {
    const wrapper = buildModel(gltf, slot.product.tint, slot.product.modelKey);
    wrapper.userData.slotIndex = slot.index; // identifie la carte au raycaster (clic)
    if (slot.wrapper) {
      slot.holder.remove(slot.wrapper);
      disposeObject(slot.wrapper);
    }
    slot.holder.add(wrapper);
    slot.wrapper = wrapper;
    slot.materials = collectMaterials(wrapper);
  }

  function printLog() {
    console.groupCollapsed("%c[sneaker3d] cartes du carousel hero", "color:#c86; font-weight:bold");
    slots.forEach((s) => {
      const ok = !!s.wrapper;
      console.log(`slide ${s.index} · ${s.product.name} — ${s.product.colorway} (${s.product.modelKey}) ${ok ? "✓" : "✗ (modèle manquant)"}`);
    });
    console.groupEnd();
  }

  /* ---------------------------------------------------------------------- */
  /* Construit un modèle centré + normalisé (dans un wrapper qu'on tourne)    */
  /* ---------------------------------------------------------------------- */
  function buildModel(gltf, tintHex, modelKey) {
    const inner = gltf.scene.clone(true);
    inner.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        if (tintHex && c.color) c.color = new THREE.Color(tintHex);
        if ("envMapIntensity" in c) c.envMapIntensity = isMobile ? 0.5 : 0.9;
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });

    // --- Retrait du SOCLE/SOL : on filtre à l'AFFICHAGE (le .glb reste intact).
    // Heuristique géométrique : un mesh PLAT (faible hauteur Y) et LARGE (emprise
    // XZ proche de celle du modèle entier) = un plan de sol/socle → on le retire.
    // On se base sur la géométrie, pas sur le nom (les deux modèles sources n'ont
    // aucun mesh nommé explicitement ; un mesh épais n'est jamais retiré, même
    // large, donc les vraies pièces de la chaussure sont toujours conservées).
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
      const flat = s.y < 0.12 * foot;
      const large = foot > 0.6 * wholeFoot;
      if (flat && large) socles.push(o);
    });
    socles.forEach((m) => m.parent && m.parent.remove(m)); // filtrage affichage
    if (socles.length) console.info(`[sneaker3d] socle retiré sur "${modelKey}" (${socles.length} mesh)`);

    // recentre à l'origine du wrapper (sur la chaussure SEULE, socle exclu)
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    inner.position.sub(center);

    const { yaw, pitch, roll } = orientOf(modelKey);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fit = FIT / maxDim;
    const wrapper = new THREE.Group();
    wrapper.add(inner);
    wrapper.scale.setScalar(fit);
    wrapper.rotation.z = roll; // roll statique (la boucle ne touche que x/y)
    wrapper.userData.yaw = yaw;
    wrapper.userData.pitch = pitch;
    // dimensions normalisées (post-FIT) : servent au cadrage relatif au viewport
    // (max(x,z) = emprise horizontale, invariante au yaw ; y = hauteur)
    wrapper.userData.nsw = Math.max(size.x, size.z) * fit;
    wrapper.userData.nsh = size.y * fit;
    return wrapper;
  }

  /* ---------------------------------------------------------------------- */
  /* Interaction (observe, ne pilote pas)                                    */
  /* ---------------------------------------------------------------------- */
  function onMouseMove(e) {
    if (!interactive || prefersReduced) return;
    // amplitude réduite : la paire active est quasi plein écran → petit parallax
    target.y = ((e.clientX / window.innerWidth) * 2 - 1) * 0.14;
    target.x = ((e.clientY / window.innerHeight) * 2 - 1) * 0.08;
  }
  function onPointerDown(e) { if (interactive) { dragging = true; lastPointerX = e.clientX; } }
  function onPointerMove(e) {
    if (!dragging) return;
    dragOffsetY += (e.clientX - lastPointerX) * 0.006;
    lastPointerX = e.clientX;
  }
  function onPointerUp() { dragging = false; }

  window.addEventListener("mousemove", onMouseMove, { passive: true });
  const pel = pointerEl || mount;
  pel.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp, { passive: true });

  // ---- clic (≠ drag) sur une paire → raycaster (AJOUT, en plus des listeners ----
  // ci-dessus ; ne remplace ni ne modifie aucun d'entre eux) ----
  pel.addEventListener("pointerdown", onClickPointerDown, { passive: true });
  pel.addEventListener("pointerup", onClickPointerUp, { passive: true });

  // ---- helpers d'index (boucle infinie, comme carousel.js) ----
  function wrappedDelta(i, pos) {
    let d = i - pos;
    d = ((d % N) + N) % N;
    if (d > N / 2) d -= N;
    return d;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const deg2rad = (d) => (d * Math.PI) / 180;

  /* ---------------------------------------------------------------------- */
  /* Boucle de rendu : place chaque slot comme le manège + mouvement premium */
  /* ---------------------------------------------------------------------- */
  let rafId = null;
  let running = true;
  function tick() {
    const t = clock.getElapsedTime();
    const pos = getPosition ? getPosition() : 0;

    const idleY = prefersReduced ? 0 : Math.sin(t * 0.6) * 0.08;
    const idleX = prefersReduced ? 0 : Math.sin(t * 0.9 + 1.0) * 0.035;
    if (!dragging) dragOffsetY += (0 - dragOffsetY) * 0.06;

    // paire active → déclenche le tween GSAP d'échelle (mise en avant)
    const a = ((Math.round(pos) % N) + N) % N;
    if (a !== activeFocusIndex) setActiveFocus(a);

    // dimensions visibles du viewport à hauteur du manège (relatif à la caméra)
    const visH = 2 * Math.tan(((camera.fov * Math.PI) / 180) / 2) * camera.position.z;
    const visW = visH * camera.aspect;

    for (const s of slots) {
      const d = wrappedDelta(s.index, pos);
      const ad = Math.abs(d);
      const holder = s.holder;
      const visible = ad <= VISIBLE_AD;
      holder.visible = visible && !!s.wrapper;
      if (!holder.visible) continue;

      const w = s.wrapper;
      // ÉCHELLE relative au viewport : la paire active occupe ACTIVE_COVER de la
      // dimension contraignante (jamais de débordement H) ; inactives = *restFrac.
      const nsw = w.userData.nsw || FIT;
      const nsh = w.userData.nsh || FIT;
      const activeScale = Math.min((ACTIVE_COVER * visW) / nsw, (ACTIVE_COVER * visH) / nsh);
      const frac = restFrac(ad);
      const baseScale = activeScale * (frac + (1 - frac) * s.focus); // lerp(rest, active, focus) — taille normale, inchangée

      // zoom : N'IMPORTE QUELLE paire (identifiée par raycaster, cf. onClickPointerUp)
      // peut être zoomée, pas seulement l'active. À taille/position "héros" identique
      // quel que soit son point de départ (lerp depuis sa taille/position ACTUELLES).
      const isZoomed = s.index === zoomedIndex;
      const zoomT = isZoomed ? zoomState.t : 0;
      const heroScale = Math.min((ZOOM_COVER * visW) / nsw, (ZOOM_COVER * visH) / nsh);
      const scale = baseScale + (heroScale - baseScale) * zoomT;
      const baseX = d * visW * EDGE_FRAC;
      const baseZ = -ad * DEPTH;
      // POSITION : voisines poussées vers les bords du viewport (relatif à visW) ;
      // la paire zoomée est ramenée au centre au fil du zoom. Le Y converge vers
      // camera.position.y (et non 0) : la caméra ne fait AUCUN lookAt, donc son
      // axe optique réel est à sa propre hauteur (0.15), pas à y=0 — un écart
      // imperceptible en cadrage normal (ACTIVE_COVER=0.56, large marge), mais
      // qui rognait le bas de la chaussure une fois la marge réduite à
      // ZOOM_COVER. On ajoute en plus ZOOM_VOFFSET*visH pour laisser
      // délibérément plus de marge en bas qu'en haut. Ne s'applique qu'à la
      // carte zoomée (zoomT=0 partout ailleurs) : le manège normal n'est donc
      // pas affecté.
      const heroY = camera.position.y + ZOOM_VOFFSET * visH;
      holder.position.set(baseX * (1 - zoomT), heroY * zoomT, baseZ * (1 - zoomT));
      holder.scale.setScalar(scale);

      // rotation : base manège + orientation + idle/parallax/drag (pondérés par le centre)
      const distFocus = clamp(1 - ad, 0, 1); // 1 au centre, 0 pour les lointaines
      const manegeRotY = deg2rad(clamp(-d * 32, -60, 60));
      w.rotation.y =
        (w.userData.yaw || 0) + manegeRotY +
        idleY * (0.35 + 0.65 * distFocus) +
        (target.y + dragOffsetY) * distFocus;
      w.rotation.x = (w.userData.pitch || 0) + idleX * (0.35 + 0.65 * distFocus) + target.x * distFocus;

      // fondu des voisines ; pendant un zoom, tout ce qui n'est PAS la paire
      // zoomée s'efface progressivement (évite un chevauchement visuel avec
      // l'ancienne paire active si une paire différente a été zoomée). Les DEUX
      // branches utilisent un lerp continu (pas de ternaire figé à 1/0) pour que
      // l'ouverture ET la fermeture restent fluides, sans saut résiduel.
      const baseOp = clamp(1 - ad * 0.16, 0, 1);
      const othersFade = zoomedIndex !== -1 ? zoomState.t : 0;
      const op = isZoomed ? baseOp + (1 - baseOp) * zoomT : baseOp * (1 - othersFade);
      if (s.materials.length) {
        for (const m of s.materials) {
          if (op < 0.999) { m.transparent = true; m.opacity = op; }
          else if (m.transparent) { m.opacity = 1; m.transparent = false; }
        }
      }
    }

    renderer.render(scene, camera);
    if (running) rafId = requestAnimationFrame(tick);
  }

  /* ---- resize ---- */
  function resize() {
    const w = mount.clientWidth || 1;
    const h = mount.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(mount);
  resize();

  /* ---- perte / restauration de contexte WebGL ---- */
  const sceneEl = mount.closest(".carousel-scene");
  function onContextLost(e) {
    e.preventDefault();
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    mount.classList.add("ctx-lost");
    if (sceneEl) sceneEl.classList.remove("all-3d"); // ré-affiche le 2D
  }
  function onContextRestored() {
    mount.classList.remove("ctx-lost");
    if (pmrem) { pmrem.dispose(); pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; }
    if (sceneEl) sceneEl.classList.add("all-3d");
    resize();
    running = true;
    tick();
  }
  renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);
  renderer.domElement.addEventListener("webglcontextrestored", onContextRestored, false);

  // démarrage
  boot();
  tick();

  return {
    setInteractive(v) { interactive = v; },
    setZoomed,
    getHeroRadiusPx,
    resize,
    destroy() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
      pel.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      pel.removeEventListener("pointerdown", onClickPointerDown);
      pel.removeEventListener("pointerup", onClickPointerUp);
      window.removeEventListener("adopte:theme-change", onThemeChange);
      slots.forEach((s) => s.wrapper && disposeObject(s.wrapper));
      if (pmrem) pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/* --------------------------- helpers de scène ---------------------------- */
function addLights(scene, isMobile, theme) {
  const base = isMobile ? 0.55 : 0.35;
  const ambient = new THREE.AmbientLight(0xffffff, base * (theme === "light" ? 1.5 : 1));
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, isMobile ? 1.8 : 2.2);
  key.position.set(3, 4, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.8);
  fill.position.set(-4, 1, 2);
  scene.add(fill);
  let rim = null;
  if (!isMobile) {
    rim = new THREE.SpotLight(0xffffff, 3.0, 20, Math.PI / 6, 0.5);
    rim.position.set(-2, 5, -4);
    scene.add(rim);
  }
  return { ambient, key, fill, rim };
}

function collectMaterials(root) {
  const out = [];
  root.traverse((o) => {
    if (!o.material) return;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => out.push(m));
  });
  return out;
}

function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
        m.dispose();
      });
    }
  });
}
