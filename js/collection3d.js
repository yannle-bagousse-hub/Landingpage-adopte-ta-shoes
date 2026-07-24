/* =============================================================================
   collection3d.js — Rendu 3D des cartes de la section "Toute la collection".
   -----------------------------------------------------------------------------
   PÉRIMÈTRE STRICT : remplace UNIQUEMENT le visuel interne de chaque carte
   (image → canvas 3D). Ne touche ni au carousel hero, ni au scroll (Lenis), ni
   au reste. Ce module est INDÉPENDANT de sneaker3d.js (aucun état partagé,
   aucun import croisé) — il reçoit ses données en paramètre (products, cf.
   js/collection-data.js, propre à cette section) plutôt que de dépendre du
   catalogue du carousel héro.

   PRINCIPE (perf) :
   - Les DEUX .glb sources (un par modelKey présent dans les données) sont
     chargés UNE SEULE FOIS chacun, puis leur scène est CLONÉE pour chaque
     carte (géométrie partagée, matériaux clonés).
   - UN SEUL contexte WebGL (un renderer partagé, hors-écran) : on rend la scène
     de chaque carte VISIBLE puis on recopie l'image dans le <canvas> de la carte
     (drawImage). Pas de multiplication des contextes WebGL.
   - IntersectionObserver : seules les cartes visibles sont rendues/animées ;
     hors écran → aucun rendu (boucle en pause si plus rien n'est visible).
   - Rendu léger : légère rotation idle (désactivée si prefers-reduced-motion),
     accentuée au survol de la carte (cf. renderCard).
   ========================================================================== */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Orientation par modèle source — mêmes valeurs que celles utilisées par le
   carousel héro pour ces deux mêmes fichiers .glb, mais DUPLIQUÉES ici
   volontairement (utilitaire géométrique sans état partagé, aucun import
   croisé avec le code du hero) : ce module reste modifiable indépendamment. */
const ORIENT_YAW = {
  jordan: 0,
  airmax: Math.PI / 2,
};
const CARD_ANGLE = -0.5; // angle 3/4 "vitrine", appliqué par-dessus la correction d'axe ci-dessus

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
 * @param {object} opts
 * @param {Array}  opts.products - cartes à rendre (cf. js/collection-data.js) :
 *                  { modelKey, model, tint, ... } par entrée.
 * @returns {{ register:Function, start:Function } | null} null si WebGL indispo
 *          (l'appelant retombe alors sur le visuel 2D).
 */
export function createCollection3D({ products } = {}) {
  if (!webglAvailable() || !products || !products.length) return null;

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

  // Éclairage réactif au thème clair/sombre (même principe que sneaker3d.js,
  // dupliqué ici) : lu une première fois, puis mis à jour EN DIRECT sur
  // chaque scène de carte via l'évènement "adopte:theme-change" (bouton du
  // header, cf. main.js).
  let theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  window.addEventListener("adopte:theme-change", (e) => {
    theme = e && e.detail && e.detail.theme === "light" ? "light" : "dark";
    for (const c of cards) {
      if (c.ambientLight) c.ambientLight.intensity = theme === "light" ? 0.6 : 0.4;
    }
    schedule(); // force un re-rendu immédiat même si la carte est actuellement en pause
  });

  // --- chargement des modèles sources : une fois par modelKey, partagé ---
  const loader = new GLTFLoader();
  const gltfCache = new Map(); // url -> Promise<GLTF>
  function loadGLTF(url) {
    if (!gltfCache.has(url)) gltfCache.set(url, new Promise((res, rej) => loader.load(url, res, undefined, rej)));
    return gltfCache.get(url);
  }

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

  function register(canvas, index) {
    const look = products[index];
    const card = {
      canvas,
      ctx: canvas.getContext("2d"),
      idx: cards.length,
      look,
      scene: null,
      model: null,
      ambientLight: null,
      ready: false,
      visible: false,
      hovered: false,
    };
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${look.name} — ${look.colorway}`);
    // survol : légère accentuation de la rotation (cf. renderCard) — posé sur
    // le canvas lui-même (couvre toute la zone média de la carte).
    canvas.addEventListener("pointerenter", () => { card.hovered = true; });
    canvas.addEventListener("pointerleave", () => { card.hovered = false; });
    cards.push(card);
    io.observe(canvas);

    loadGLTF(look.model)
      .then((gltf) => { buildCard(card, gltf); schedule(); })
      .catch((err) => console.warn(`[collection3d] chargement du modèle échoué (${look.model}) :`, err));

    return card;
  }

  function buildCard(card, gltf) {
    const look = card.look;
    const scene = new THREE.Scene();
    scene.environment = envMap;
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(2.5, 3, 4);
    scene.add(dir);
    const amb = new THREE.AmbientLight(0xffffff, theme === "light" ? 0.6 : 0.4);
    scene.add(amb);
    card.ambientLight = amb;

    // CLONE de la scène (géométrie partagée) + matériaux clonés puis TEINTÉS
    const inner = gltf.scene.clone(true);
    inner.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        if (look.tint && c.color) c.color = new THREE.Color(look.tint); // variante de coloris
        if ("envMapIntensity" in c) c.envMapIntensity = 0.85;
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });

    // Retrait heuristique du socle/sol éventuel : mesh plat + large par
    // rapport à l'ensemble (même principe géométrique que le carousel héro,
    // dupliqué ici, utilitaire sans état partagé).
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
    // angle 3/4 "vitrine" + correction d'axe propre au modèle source (jordan/airmax)
    wrapper.rotation.y = (ORIENT_YAW[look.modelKey] || 0) + CARD_ANGLE;
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
      // idle discret ; accentué (amplitude + vitesse) tant que la carte est
      // survolée — "légère rotation subtile de la chaussure" demandée, sans
      // rien changer à la mécanique de scroll horizontal de la section.
      const amp = card.hovered ? 0.55 : 0.28;
      const speed = card.hovered ? 0.9 : 0.4;
      card.model.rotation.y = (ORIENT_YAW[card.look.modelKey] || 0) + CARD_ANGLE + Math.sin(t * speed + card.idx * 1.3) * amp;
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
