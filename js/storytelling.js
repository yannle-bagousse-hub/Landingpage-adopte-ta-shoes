/* =============================================================================
   storytelling.js — Section "storytelling" scroll-driven (chaussure géante
   qui pivote pendant que des paragraphes défilent autour d'elle).
   -----------------------------------------------------------------------------
   PÉRIMÈTRE STRICT, 100% ADDITIF ET INDÉPENDANT : scène/caméra/renderer/loader
   Three.js DÉDIÉS à cette section — AUCUN état, listener, cache ou import
   partagé avec js/sneaker3d.js (carousel héro) ni js/collection3d.js. Même
   principe d'isolation que js/intro.js (qui duplique déjà, volontairement,
   son propre retrait de socle plutôt que d'importer celui du carousel).

   Contrairement à js/intro.js (séquence qui se joue UNE fois puis se retire
   du DOM), cette section est PERMANENTE : elle reste en place dans la page,
   pinnée/scrubée à chaque passage de l'utilisateur (montée ET descente du
   scroll), comme les autres animations scroll-driven du site.

   TEXTE — NOTE IMPORTANTE : le GSAP SplitText demandé est un plugin PAYANT
   (cf. js/split-text.js, déjà en tête de fichier : "SplitText de GSAP est un
   plugin payant. On fait un split maison") — le site ne l'utilise nulle part.
   Ce module réutilise donc splitChars/splitLines, l'équivalent maison DÉJÀ
   utilisé ailleurs sur le site (hero, profil, newsletter...), qui donne
   exactement le même résultat (un <span> par mot-clé/ligne à animer) sans
   dépendance payante.

   ⭐ CONFIGURATION RAPIDE (modèle de la chaussure géante) ⭐
   Pas de teinte ici volontairement : cette section affiche le matériau
   D'ORIGINE du .glb (couleur de base), contrairement au carousel héro / à la
   collection qui appliquent des variantes de couleur.
   ========================================================================== */
const STORY_MODEL_URL = "assets/models/miles_morales_shoes.glb";

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { STORY_STEPS } from "./storytelling-data.js";
import { splitChars, splitLines } from "./split-text.js";

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (_) {
    return false;
  }
}

/* Orientation de départ : le modèle (axe long déjà X, pointe vers +X au
   repos — même convention que sneaker3d.js/ORIENT) est basculé une fois pour
   toutes de +90° autour de Z pour se retrouver VERTICAL, pointe vers le haut
   de l'écran. Appliquée directement sur `inner` (au chargement, cf. plus
   bas) — PAS sur le groupe `model` — pour que la rotation Y animée ci-dessous
   reste un tour propre autour de l'axe vertical du MONDE (turntable), sans
   qu'un tilt combiné sur le même objet ne fasse "précessionner" cet axe. */
const BASE_TILT_Z = Math.PI / 2;
// Nombre de tours complets effectués sur toute la longueur de la séquence.
const SPIN_TURNS = 1.75;

/* Séquence d'échelle en 3 temps (cf. demande) : taille modeste au départ →
   zoom dramatique (vers le 1er/2e paragraphe) → stabilisation sur une taille
   intermédiaire (plus zoomée qu'au départ) tenue jusqu'à la fin. Valeurs en
   "cover" (part de la dimension contraignante du viewport, même principe que
   sneaker3d.js/intro.js), interpolées avec un easing doux (smoothstep) entre
   points-clés consécutifs — jamais de saut de taille. */
const SCALE_KEYFRAMES = [
  { t: 0, cover: 0.42 }, // départ : taille normale/modeste
  { t: 0.3, cover: 1.05 }, // zoom fort (moment fort de la séquence)
  { t: 0.5, cover: 0.68 }, // stabilisation : taille intermédiaire, zoomée
  { t: 1, cover: 0.68 }, // tenue jusqu'à la fin (le reste des paragraphes)
];
const MOBILE_SCALE = 0.82; // toute la courbe ci-dessus, réduite sur mobile

/* Jeu de lumière dramatique (cf. demande, point 3) : UNE lumière dynamique
   supplémentaire (spot), en plus de l'éclairage de base (ambient/key/fill,
   statiques). Intensité + couleur suivent les MÊMES points-clés temporels
   que le zoom (pic au même moment, t=0.3) pour que la lumière renforce le
   moment fort de la séquence ; sa position balaie doucement la scène. */
const LIGHT_KEYFRAMES = [
  { t: 0, intensity: 0.6, color: 0xffffff },
  { t: 0.3, intensity: 5.5, color: 0xffdcae }, // pic chaud, synchro avec le zoom fort
  { t: 0.5, intensity: 1.8, color: 0xffffff },
  { t: 1, intensity: 1.8, color: 0xffffff },
];

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { return t * t * (3 - 2 * t); }
/** Easing marqué (accélère fort puis ralentit sec) pour les reveals de texte. */
function easeOutExpo(t) { return t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }

/** Part de viewport ("cover") occupée par la chaussure pour une progression 0→1. */
function coverAt(progress) {
  const p = clamp(progress, 0, 1);
  for (let i = 0; i < SCALE_KEYFRAMES.length - 1; i++) {
    const a = SCALE_KEYFRAMES[i];
    const b = SCALE_KEYFRAMES[i + 1];
    if (p >= a.t && p <= b.t) {
      const local = (p - a.t) / (b.t - a.t || 1);
      return lerp(a.cover, b.cover, smoothstep(local));
    }
  }
  return SCALE_KEYFRAMES[SCALE_KEYFRAMES.length - 1].cover;
}

/** Intensité + couleur (THREE.Color) de la lumière dramatique pour une
 *  progression 0→1 — mêmes points-clés temporels que coverAt (synchronisé). */
const _lightColorCache = LIGHT_KEYFRAMES.map((k) => new THREE.Color(k.color));
function lightStateAt(progress, outColor) {
  const p = clamp(progress, 0, 1);
  for (let i = 0; i < LIGHT_KEYFRAMES.length - 1; i++) {
    const a = LIGHT_KEYFRAMES[i];
    const b = LIGHT_KEYFRAMES[i + 1];
    if (p >= a.t && p <= b.t) {
      const local = smoothstep((p - a.t) / (b.t - a.t || 1));
      outColor.copy(_lightColorCache[i]).lerp(_lightColorCache[i + 1], local);
      return lerp(a.intensity, b.intensity, local);
    }
  }
  const last = LIGHT_KEYFRAMES.length - 1;
  outColor.copy(_lightColorCache[last]);
  return LIGHT_KEYFRAMES[last].intensity;
}

/** Fenêtre de fondu d'ENTRÉE d'une étape i (sur n) — factorisé pour être
 *  réutilisé par la visibilité globale de l'étape ET par le stagger des
 *  lignes/mots à l'intérieur (cf. revealInners). */
function stepFadeInWindow(i, n) {
  const seg = 1 / n;
  const start = i * seg;
  const fade = seg * 0.28;
  // cf. note plus bas : la 1ère étape ne peut pas avoir une fenêtre à moitié
  // hors de [0,1] (progress ne descend jamais sous 0), sinon elle
  // apparaîtrait déjà à moitié visible dès le tout début de la séquence.
  return i === 0 ? { start: 0, end: fade } : { start: start - fade, end: start + fade };
}

/** Visibilité globale (0→1) d'une étape : fondu d'entrée (cf. ci-dessus),
 *  plateau, fondu de sortie — sauf la DERNIÈRE étape qui reste visible
 *  jusqu'à la fin (pas de fondu de sortie). */
function stepVisibility(progress, i, n) {
  const seg = 1 / n;
  const end = (i + 1) * seg;
  const fade = seg * 0.28;
  const { start: fadeInStart, end: fadeInEnd } = stepFadeInWindow(i, n);
  let v;
  if (progress < fadeInStart) v = 0;
  else if (progress < fadeInEnd) v = (progress - fadeInStart) / (fadeInEnd - fadeInStart);
  else if (i === n - 1 || progress < end - fade) v = 1;
  else if (progress < end + fade) v = 1 - (progress - (end - fade)) / (2 * fade);
  else v = 0;
  return clamp(v, 0, 1);
}

/**
 * Anime un jeu de spans (.split-inner, cf. splitChars/splitLines) avec un
 * stagger : chaque span a sa PROPRE fenêtre d'entrée, légèrement décalée par
 * rapport au précédent, à l'intérieur de la fenêtre de fondu de l'étape —
 * "reveal mot par mot / ligne par ligne" plutôt qu'un fondu global d'un seul
 * bloc (cf. demande). Easing marqué (easeOutExpo) + légère distorsion
 * (translateY + skew + flou qui se dissipe) pour donner du caractère.
 * `stepV` (visibilité globale de l'étape) plafonne la sortie : dès que
 * l'étape entame son fondu de SORTIE, tous les spans suivent ensemble
 * (seule l'ENTRÉE est décalée par span).
 */
function revealInners(inners, progress, fadeWindow, stepV, withDistortion) {
  const n = inners.length || 1;
  const width = fadeWindow.end - fadeWindow.start;
  const stagger = width * 0.55; // étalement total du décalage entre 1er et dernier span
  inners.forEach((inner, idx) => {
    const start = fadeWindow.start + (idx * stagger) / n;
    const end = start + width;
    let t = 0;
    if (progress >= end) t = 1;
    else if (progress > start) t = (progress - start) / (end - start);
    const eased = easeOutExpo(clamp(t, 0, 1));
    const visible = Math.min(eased, stepV);
    inner.style.opacity = String(visible);
    if (prefersReduced || !withDistortion) {
      inner.style.transform = withDistortion ? `translateY(${(1 - eased) * 14}px)` : "none";
    } else {
      const y = (1 - eased) * 22;
      const skew = (1 - eased) * 6;
      inner.style.transform = `translateY(${y}px) skewY(${skew}deg)`;
      inner.style.filter = `blur(${(1 - eased) * 5}px)`;
    }
  });
}

/**
 * Initialise la section storytelling. Sans effet si le DOM attendu (cf.
 * index.html) est absent, ou si WebGL/GSAP/ScrollTrigger sont indisponibles —
 * dans ce cas les textes restent simplement affichés statiquement (pas de
 * 3D, pas de scrub), le reste du site n'en dépend pas.
 */
export function initStorytelling() {
  const section = document.getElementById("storytelling");
  const canvasMount = section && section.querySelector(".storytelling-canvas");
  const copyWrap = section && section.querySelector(".storytelling-copy");
  if (!section || !canvasMount || !copyWrap) return;

  // Construit les blocs de texte à partir de STORY_STEPS (cf.
  // storytelling-data.js) — simple LECTURE de données, modifie ce fichier
  // pour ajuster les textes sans toucher au HTML ni à ce module. Le split en
  // mots/lignes (splitChars pour le kicker, splitLines pour le paragraphe)
  // se fait APRÈS attachement au DOM : splitLines mesure les vrais retours à
  // la ligne, qui dépendent du CSS (max-width) déjà en place sur .story-step.
  copyWrap.innerHTML = "";
  const steps = STORY_STEPS.map((step, i) => {
    const el = document.createElement("article");
    el.className = `story-step story-step--${step.align === "right" ? "right" : "left"}`;
    el.dataset.step = String(i);
    const kickerEl = document.createElement("p");
    kickerEl.className = "story-kicker";
    kickerEl.textContent = step.kicker;
    const textEl = document.createElement("p");
    textEl.className = "story-text";
    textEl.textContent = step.text;
    el.appendChild(kickerEl);
    el.appendChild(textEl);
    copyWrap.appendChild(el);

    const kickerInners = splitChars(kickerEl);
    const textInners = splitLines(textEl);
    return { el, kickerInners, textInners };
  });

  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;

  if (!webglAvailable() || !gsap || !ScrollTrigger) {
    // repli "guardé" : textes visibles statiquement, pas de 3D ni de scrub.
    steps.forEach(({ kickerInners, textInners }) => {
      [...kickerInners, ...textInners].forEach((inner) => {
        inner.style.opacity = "1";
        inner.style.transform = "none";
        inner.style.filter = "none";
      });
    });
    return;
  }

  const isMobile = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720;

  // ---- Scène / caméra / renderer DÉDIÉS (aucun lien avec sneaker3d.js) ----
  const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.pointerEvents = "none";
  canvasMount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 6.6);

  // Éclairage réactif au thème clair/sombre (même principe que sneaker3d.js/
  // collection3d.js, dupliqué ici volontairement — aucun import croisé).
  let theme = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  const ambient = new THREE.AmbientLight(0xffffff, theme === "light" ? 0.75 : 0.5);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(3, 4, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe6ff, 0.9);
  fill.position.set(-4, 1, 2);
  scene.add(fill);
  window.addEventListener("adopte:theme-change", (e) => {
    theme = e && e.detail && e.detail.theme === "light" ? "light" : "dark";
    ambient.intensity = theme === "light" ? 0.75 : 0.5;
  });

  // Lumière dramatique DYNAMIQUE (unique — cf. LIGHT_KEYFRAMES) : une seule
  // lumière animée en plus de l'éclairage statique ci-dessus, pour rester
  // performant ("1 à 2 lumières animées suffisent", cf. demande). Sa cible
  // reste fixée à l'origine (la chaussure y est toujours centrée, quelle que
  // soit sa rotation/échelle) — pas besoin de la mettre à jour par frame.
  const dramaLight = new THREE.SpotLight(0xffffff, 0.6, 30, Math.PI / 5, 0.45, 1.1);
  dramaLight.position.set(0, 3, 5);
  scene.add(dramaLight);
  const dramaTarget = new THREE.Object3D();
  scene.add(dramaTarget);
  dramaLight.target = dramaTarget;

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

  // ---- Modèle : chargement unique, matériau D'ORIGINE (pas de teinte) ----
  let model = null;
  let maxDim = 1;
  const loader = new GLTFLoader();
  loader.load(
    STORY_MODEL_URL,
    (gltf) => {
      const inner = gltf.scene.clone(true);
      inner.traverse((o) => {
        if (!o.isMesh) return;
        // clone du matériau SANS changer sa couleur : uniquement pour ne
        // jamais partager d'instance de matériau avec un futur autre usage
        // de ce même .glb (même précaution que sneaker3d.js/collection3d.js),
        // et pour ajuster envMapIntensity sans affecter la couleur d'origine.
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const cloned = mats.map((m) => {
          const c = m.clone();
          if ("envMapIntensity" in c) c.envMapIntensity = isMobile ? 0.5 : 0.9;
          return c;
        });
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
      });

      // Retrait heuristique du socle/sol éventuel : même principe géométrique
      // que sneaker3d.js/intro.js/collection3d.js, dupliqué ici (utilitaire
      // sans état partagé, aucun import croisé).
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
      // bascule FIXE (jamais animée) : rend la chaussure verticale, pointe
      // vers le haut — cf. commentaire de BASE_TILT_Z plus haut.
      inner.rotation.z = BASE_TILT_Z;
      maxDim = Math.max(size.x, size.y, size.z) || 1;

      model = new THREE.Group();
      model.add(inner);
      scene.add(model);
    },
    undefined,
    (err) => console.warn("[storytelling] modèle introuvable :", err)
  );

  // ---- Progression pilotée par ScrollTrigger (scrub) + lissage local -------
  let progress = 0; // cible brute, pilotée par le scroll (0 → 1)
  let shown = 0; // valeur lissée (rotation/échelle/lumière), même principe que js/intro.js

  function applyStepVisibility(p) {
    steps.forEach(({ el, kickerInners, textInners }, i) => {
      const v = stepVisibility(p, i, steps.length);
      el.style.pointerEvents = v > 0.5 ? "auto" : "none";
      const win = stepFadeInWindow(i, steps.length);
      revealInners(kickerInners, p, win, v, false);
      revealInners(textInners, p, win, v, true);
    });
  }
  applyStepVisibility(0);

  const _dramaColor = new THREE.Color();
  let rafId = null;
  function tick() {
    shown += (progress - shown) * (prefersReduced ? 1 : 0.09);

    if (model) {
      const visH = 2 * Math.tan(((camera.fov * Math.PI) / 180) / 2) * camera.position.z;
      const visW = visH * camera.aspect;
      const cover = coverAt(shown) * (isMobile ? MOBILE_SCALE : 1);
      const size = Math.min(cover * visW, cover * visH);
      model.scale.setScalar(size / maxDim);
      // rotation SIMPLE, un seul axe (vertical du monde) : la bascule fixe
      // vit sur `inner` (posée une fois au chargement) — `model` ne fait que
      // tourner sur lui-même, comme un plateau tournant, piloté par le scroll.
      model.rotation.y = shown * Math.PI * 2 * SPIN_TURNS;
    }

    // jeu de lumière : intensité/couleur synchronisées avec le zoom (mêmes
    // points-clés temporels), position en léger balayage latéral + vertical.
    const sweep = -Math.PI * 0.35 + shown * Math.PI * 0.7;
    dramaLight.position.set(Math.sin(sweep) * 5, 3 + Math.sin(shown * Math.PI) * 1.2, Math.cos(sweep) * 5);
    dramaLight.intensity = lightStateAt(shown, _dramaColor);
    dramaLight.color.copy(_dramaColor);

    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  }
  tick();

  // ---- Scroll (pin + scrub) : section PERMANENTE, réversible dans les deux
  // sens (pas de "joué une fois" contrairement à l'intro) -------------------
  ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: () => "+=" + Math.round(window.innerHeight * (STORY_STEPS.length * 0.9)),
    scrub: 0.6,
    pin: true,
    onUpdate: (self) => {
      progress = self.progress;
      applyStepVisibility(progress);
    },
  });
}
