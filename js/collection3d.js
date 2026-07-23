/* =============================================================================
   collection3d.js — Rendu 3D des cartes de la section "Toute la collection".
   -----------------------------------------------------------------------------
   PÉRIMÈTRE STRICT : remplace UNIQUEMENT le visuel interne de chaque carte
   (image → canvas 3D). Ne touche ni au carousel hero, ni au scroll (Lenis), ni
   au reste. Ce module est indépendant de sneaker3d.js.

   PRINCIPE (perf) :
   - Le .glb Miles Morales est chargé UNE SEULE FOIS (GLTFLoader), puis sa scène
     est CLONÉE pour chaque carte (géométrie partagée, matériaux clonés).
   - UN SEUL contexte WebGL (un renderer partagé, hors-écran) : on rend la scène
     de chaque carte VISIBLE puis on recopie l'image dans le <canvas> de la carte
     (drawImage). Pas de multiplication des contextes WebGL.
   - IntersectionObserver : seules les cartes visibles sont rendues/animées ;
     hors écran → aucun rendu (boucle en pause si plus rien n'est visible).
   - Rendu léger : légère rotation idle (désactivée si prefers-reduced-motion).
   ========================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const MILES_MODEL = "assets/models/miles_morales_shoes.glb";
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* =============================================================================
   PALETTE DE VARIANTES — ⭐ MODIFIE / AJOUTE TES COLORIS ICI ⭐
   -----------------------------------------------------------------------------
   Chaque carte reçoit une variante (par index, en boucle si plus de cartes que
   de variantes). `color` teinte le matériau du modèle ; `name` sert de libellé
   (aria-label du canvas). Cohérent avec l'identité "Adopte ta shoes".
   ========================================================================== */
export const MILES_VARIANTS = [
  { name: "Miles Morales — Rouge Signature", color: "#c8321f" },
  { name: "Miles Morales — Noir Mat", color: "#2c2c30" },
  { name: "Miles Morales — Blanc Cassé", color: "#ece5d6" },
  { name: "Miles Morales — Camel", color: "#c7a074" },
  { name: "Miles Morales — Bleu Nuit", color: "#26365f" },
  { name: "Miles Morales — Vert Kaki", color: "#5c6438" },
  { name: "Miles Morales — Terracotta", color: "#a8452f" },
  { name: "Miles Morales — Gris Argent", color: "#c4c7cc" },
];

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (_) {
    return false;
  }
}

/**
 * Crée le moteur 3D partagé de la collection.
 * @returns {{ register:Function, start:Function } | null} null si WebGL indispo
 *          (l'appelant retombe alors sur le visuel 2D).
 */
export function createCollection3D() {
  if (!webglAvailable()) return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // --- Renderer partagé (hors-écran) : un seul contexte WebGL ---
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1); // on gère la taille en pixels réels via setSize
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const glCanvas = renderer.domElement; // jamais attaché au DOM

  const camera = new THREE.PerspectiveCamera(32, 1.6, 0.1, 100);
  camera.position.set(0, 0.1, 5.2);

  // environnement (reflets PBR) partagé par toutes les scènes de cartes
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // chargement du modèle : UNE SEULE FOIS
  const loader = new GLTFLoader();
  const gltfPromise = new Promise((res, rej) => loader.load(MILES_MODEL, res, undefined, rej));

  const cards = [];
  let curW = 0, curH = 0;
  let running = false, rafId = null;
  const clock = new THREE.Clock();

  // --- visibilité : seules les cartes à l'écran sont rendues ---
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const card = cards.find((c) => c.canvas === e.target);
        if (card) card.visible = e.isIntersecting;
      }
      schedule();
    },
    { root: null, rootMargin: "140px 0px", threshold: 0.01 }
  );

  function register(canvas, variantIndex) {
    const variant = MILES_VARIANTS[variantIndex % MILES_VARIANTS.length];
    const card = {
      canvas,
      ctx: canvas.getContext("2d"),
      idx: cards.length,
      variant,
      scene: null,
      model: null,
      ready: false,
      visible: false,
    };
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", variant.name);
    cards.push(card);
    io.observe(canvas);
    return card;
  }

  gltfPromise
    .then((gltf) => {
      for (const card of cards) buildCard(card, gltf);
      schedule();
    })
    .catch((err) => console.warn("[collection3d] chargement du .glb échoué :", err));

  function buildCard(card, gltf) {
    const scene = new THREE.Scene();
    scene.environment = envMap;
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(2.5, 3, 4);
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    // CLONE de la scène (géométrie partagée) + matériaux clonés puis TEINTÉS
    const inner = gltf.scene.clone(true);
    inner.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        if (c.color) c.color = new THREE.Color(card.variant.color); // variante de coloris
        if ("envMapIntensity" in c) c.envMapIntensity = 0.85;
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });

    // recentre + met à l'échelle pour tenir dans le cadre
    const box = new THREE.Box3().setFromObject(inner);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    inner.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const wrapper = new THREE.Group();
    wrapper.add(inner);
    wrapper.scale.setScalar(2.2 / maxDim);
    wrapper.rotation.y = -0.5; // angle 3/4 par défaut
    scene.add(wrapper);

    card.scene = scene;
    card.model = wrapper;
    card.ready = true;
  }

  // taille de rendu = taille d'affichage d'une carte (uniforme) × dpr
  function ensureSize() {
    const sample = cards.find((c) => c.visible && c.ready) || cards.find((c) => c.ready);
    if (!sample) return;
    const w = Math.max(1, Math.round(sample.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(sample.canvas.clientHeight * dpr));
    if (w === curW && h === curH) return;
    curW = w; curH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const c of cards) { c.canvas.width = w; c.canvas.height = h; }
  }

  function renderCard(card, t) {
    if (card.model && !prefersReduced) {
      // légère rotation idle, déphasée par carte
      card.model.rotation.y = -0.5 + Math.sin(t * 0.4 + card.idx * 1.3) * 0.28;
    }
    renderer.render(card.scene, camera);
    card.ctx.clearRect(0, 0, card.canvas.width, card.canvas.height);
    card.ctx.drawImage(glCanvas, 0, 0, card.canvas.width, card.canvas.height);
  }

  function renderVisibleOnce() {
    ensureSize();
    const t = clock.getElapsedTime();
    for (const c of cards) if (c.visible && c.ready) renderCard(c, t);
  }

  function loop() {
    ensureSize();
    const t = clock.getElapsedTime();
    let any = false;
    for (const c of cards) {
      if (!c.visible || !c.ready) continue;
      any = true;
      renderCard(c, t);
    }
    if (any && running) rafId = requestAnimationFrame(loop);
    else { running = false; rafId = null; }
  }

  // lance ou met en pause selon qu'il y a des cartes visibles
  function schedule() {
    const any = cards.some((c) => c.visible && c.ready);
    if (prefersReduced) { if (any) renderVisibleOnce(); return; }
    if (any && !running) { running = true; rafId = requestAnimationFrame(loop); }
  }

  return { register, start: schedule };
}
