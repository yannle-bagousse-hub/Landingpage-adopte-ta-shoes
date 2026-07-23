/* =============================================================================
   sneaker3d.js — Manège 3D (Three.js) : TOUTES les paires visibles du carousel
   sont de vrais modèles 3D distincts, rendus simultanément dans UNE seule scène.
   -----------------------------------------------------------------------------
   PÉRIMÈTRE STRICT : ne s'occupe QUE du rendu 3D des chaussures du hero.
   La mécanique du carousel (swipe / molette / snapping / pagination / autoplay)
   reste 100% dans carousel.js ; ce module se contente de LIRE sa position
   continue (getPosition) pour placer chaque modèle comme le manège, et
   d'OBSERVER la souris / le drag pour le mouvement premium. Il ne pilote rien.

   MODÈLES (convention, voir data.js) :
   - chaque paire charge "assets/models/adopte-<id>.glb" (modèle distinct),
   - sinon fallback propre sur "assets/models/_base.glb" TEINTÉ avec `primary`.
   Un seul renderer / une seule scène : chaque paire = sa propre géométrie +
   sa propre texture, mais pas 8 contextes WebGL (ce serait le vrai bug perf).

   MOUVEMENT (identique au comportement validé, appliqué surtout à la paire
   centrée, atténué pour les voisines) :
   - oscillation/tilt idle, - rotation qui suit le drag, - parallaxe souris.

   ROBUSTESSE : détection WebGL (sinon 2D conservé), perte/restauration de
   contexte, qualité réduite sur mobile.
   ========================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MODEL_DIR = "assets/models/";
const BASE_MODEL = MODEL_DIR + "_base.glb";
const gsap = window.gsap;
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ORIENTATION PAR MODÈLE — chaque .glb source peut être exporté dans un sens
   différent. But : pointe du pied vers la DROITE, chaussure debout (les modèles
   sont en Y-up, donc c'est un problème de YAW seulement).
   Clé = id produit ; valeurs en radians (yaw = rotation gauche/droite).
   ⭐ AJUSTE ICI si une paire pointe dans le mauvais sens : ajoute/retire Math.PI
      pour retourner la pointe (gauche ↔ droite). (pitch/roll dispo si besoin.) */
const ORIENT = {
  creme: { yaw: 0 }, // miles (fallback) — axe long déjà X
  nude: { yaw: 0 }, // miles (fallback)
  anthracite: { yaw: 0 }, // miles
  argent: { yaw: 0 }, // nike p-6000 — axe long X
  camel: { yaw: 0 }, // new balance — axe long X
  marine: { yaw: 0 }, // nike jordan 1985 — axe long X
  kaki: { yaw: Math.PI / 2 }, // nike air max 90 — axe long Z → +90° pour l'horizontale
  terracotta: { yaw: Math.PI / 2 }, // samba — axe long Z → +90° pour l'horizontale
};
function orientOf(id) {
  const o = ORIENT[id] || {};
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
 * @param {Array}       opts.products   - PRODUCTS
 * @param {Function}    opts.getPosition- () => position continue du carousel
 * @param {Function}   [opts.onReady]   - appelé quand le manège 3D est visible
 * @returns API | null (null si WebGL indisponible → le 2D reste affiché)
 */
export function initSneaker3D({ mount, pointerEl, products, getPosition, onReady }) {
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

  addLights(scene, isMobile);
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

  /* ---------------------------------------------------------------------- */
  /* Chargement : base d'abord (manège visible tout de suite), puis chaque   */
  /* vrai modèle en séquence (on accepte la charge réseau — choix utilisateur)*/
  /* ---------------------------------------------------------------------- */
  const log = []; // pour le récap console
  async function boot() {
    // 1) base tintée → tous les slots sont 3D immédiatement
    let base = null;
    try {
      base = await loadGLTF(BASE_MODEL);
    } catch (e) {
      console.warn("[sneaker3d] _base.glb introuvable :", e);
    }
    if (base) {
      slots.forEach((s) => setSlotModel(s, base, s.product.primary, BASE_MODEL, /*placeholder*/ true));
      onReady && onReady(); // 2D masqué SEULEMENT si le manège 3D a de quoi s'afficher
    }

    // 2) vrais modèles distincts, en séquence (évite de saturer le réseau)
    for (const s of slots) {
      const url = `${MODEL_DIR}adopte-${s.product.id}.glb`;
      try {
        const gltf = await loadGLTF(url);
        setSlotModel(s, gltf, null, url, false); // vrai modèle → couleurs réelles, pas de teinte
      } catch (_) {
        // pas de modèle dédié → on garde la base tintée (déjà en place)
        s.loadedFile = base ? "_base.glb (fallback)" : "AUCUN";
      }
    }
    printLog();
  }

  function setSlotModel(slot, gltf, tintHex, file, placeholder) {
    const wrapper = buildModel(gltf, tintHex, slot.product.id);
    // retire l'ancien (placeholder base) proprement
    if (slot.wrapper) {
      slot.holder.remove(slot.wrapper);
      disposeObject(slot.wrapper);
    }
    slot.holder.add(wrapper);
    slot.wrapper = wrapper;
    slot.materials = collectMaterials(wrapper);
    slot.loadedFile = placeholder ? "_base.glb (en attente)" : file.split("/").pop();
    if (!placeholder) slot.real = true;
  }

  function printLog() {
    console.groupCollapsed("%c[sneaker3d] modèles chargés par slide", "color:#c86; font-weight:bold");
    slots.forEach((s) => {
      const tag = s.real ? "✓ 3D distinct" : "↩ fallback";
      console.log(`slide ${s.index} · ${s.product.id} (${s.product.name}) → ${s.loadedFile}  [${tag}]`);
    });
    console.groupEnd();
  }

  /* ---------------------------------------------------------------------- */
  /* Construit un modèle centré + normalisé (dans un wrapper qu'on tourne)    */
  /* ---------------------------------------------------------------------- */
  function buildModel(gltf, tintHex, id) {
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
    // (On se base sur la géométrie, pas sur le nom : ex. le mesh "Plane" du
    //  modèle Jordan est épais → conservé, ce n'est pas un socle.)
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
    if (socles.length) console.info(`[sneaker3d] socle retiré sur "${id}" (${socles.length} mesh)`);

    // recentre à l'origine du wrapper (sur la chaussure SEULE, socle exclu)
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    inner.position.sub(center);

    const { yaw, pitch, roll } = orientOf(id);
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
      const scale = activeScale * (frac + (1 - frac) * s.focus); // lerp(rest, active, focus)
      // POSITION : voisines poussées vers les bords du viewport (relatif à visW)
      holder.position.set(d * visW * EDGE_FRAC, 0, -ad * DEPTH);
      holder.scale.setScalar(scale);

      // rotation : base manège + orientation + idle/parallax/drag (pondérés par le centre)
      const distFocus = clamp(1 - ad, 0, 1); // 1 au centre, 0 pour les lointaines
      const manegeRotY = deg2rad(clamp(-d * 32, -60, 60));
      w.rotation.y =
        (w.userData.yaw || 0) + manegeRotY +
        idleY * (0.35 + 0.65 * distFocus) +
        (target.y + dragOffsetY) * distFocus;
      w.rotation.x = (w.userData.pitch || 0) + idleX * (0.35 + 0.65 * distFocus) + target.x * distFocus;

      // fondu des voisines
      const op = clamp(1 - ad * 0.16, 0, 1);
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
    resize,
    destroy() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("mousemove", onMouseMove);
      pel.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      slots.forEach((s) => s.wrapper && disposeObject(s.wrapper));
      if (pmrem) pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/* --------------------------- helpers de scène ---------------------------- */
function addLights(scene, isMobile) {
  scene.add(new THREE.AmbientLight(0xffffff, isMobile ? 0.55 : 0.35));
  const key = new THREE.DirectionalLight(0xffffff, isMobile ? 1.8 : 2.2);
  key.position.set(3, 4, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.8);
  fill.position.set(-4, 1, 2);
  scene.add(fill);
  if (!isMobile) {
    const rim = new THREE.SpotLight(0xffffff, 3.0, 20, Math.PI / 6, 0.5);
    rim.position.set(-2, 5, -4);
    scene.add(rim);
  }
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
