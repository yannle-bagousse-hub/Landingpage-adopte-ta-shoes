/* =============================================================================
   carousel.js — Carousel 3D "manège" (Option B : CSS 3D / perspective)
   -----------------------------------------------------------------------------
   Responsabilité : positionner en 3D les visuels renvoyés par sneaker-renderer,
   gérer drag / swipe / molette / flèches / clic, l'autoplay (boucle infinie) et
   notifier le reste de l'appli quand la paire active change (onChange).

   Il NE dessine PAS la chaussure lui-même (c'est le rôle de sneaker-renderer),
   ce qui permet de migrer vers Three.js sans toucher à ce fichier.
   ========================================================================== */

import { renderSneaker } from "./sneaker-renderer.js";

const gsap = window.gsap;
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ÉCHELLE (fallback 2D — cohérent avec le manège 3D de sneaker3d.js).
   La paire active DOMINE (~10x les voisines) et sa taille est RELATIVE AU
   VIEWPORT (pas un multiplicateur fixe) : active = ACTIVE_COVER de la dimension
   contraignante du conteneur ; inactive = active * restFrac(ad) (dégressif).
   focus 0→1 animé par GSAP (ease-out ~0.5s). */
const ACTIVE_COVER = 0.56;
const INACTIVE_RATIO = 3.8;
const REST_FALLOFF = 0.78;
const REST_MIN_FRAC = 0.08;
const EDGE_FRAC = 0.4; // position X des voisines (relatif à la largeur du conteneur)
function restFrac(ad) {
  return Math.max(REST_MIN_FRAC, (1 / INACTIVE_RATIO) * Math.pow(REST_FALLOFF, Math.max(0, ad - 1)));
}

export function createCarousel({ mount, products, onChange, onClick }) {
  const N = products.length;

  // état
  let current = 0; // position affichée (float, animée)
  let target = 0; // position visée (float ; snappe sur entier)
  let lastActive = -1; // dernier index entier notifié
  let autoplay = true;
  let autoplayTimer = null;
  const AUTOPLAY_MS = 4500;

  // construit les items
  const items = products.map((product, i) => {
    const el = document.createElement("div");
    el.className = "carousel-item";
    el.dataset.index = i;
    el.appendChild(renderSneaker(product));
    el.addEventListener("click", () => {
      if (draggedSignificantly) return; // ne pas centrer si c'était un drag
      if (Math.round(mod(current)) === i) {
        onClick && onClick(i); // clic sur la paire déjà centrée
      } else {
        goTo(i);
      }
    });
    mount.appendChild(el);
    return el;
  });

  // focus par item : 0 (inactive) → 1 (active), animé par GSAP pour l'échelle
  const focusState = items.map(() => ({ f: 0 }));
  let lastFocusActive = -1;
  function setFocus(a) {
    lastFocusActive = a;
    focusState.forEach((st, i) => {
      const to = i === a ? 1 : 0;
      if (gsap && !prefersReduced) gsap.to(st, { f: to, duration: 0.5, ease: "power2.out", overwrite: true });
      else st.f = to;
    });
  }

  // ---- helpers d'index (boucle infinie) ----
  function mod(v) {
    return ((v % N) + N) % N;
  }
  // plus court écart signé entre l'item i et la position `pos` (wrap sur -N/2..N/2)
  function wrappedDelta(i, pos) {
    let d = i - pos;
    d = ((d % N) + N) % N;
    if (d > N / 2) d -= N;
    return d;
  }

  // ---- rendu (appelé à chaque frame) ----
  function updateRender() {
    // dimensions responsives du conteneur (relatif au viewport)
    const vw = mount.clientWidth || 1;
    const vh = mount.clientHeight || 1;
    const depth = 160;
    // taille de la carte active = ACTIVE_COVER de la dimension contraignante,
    // rapportée à la taille CSS de base de la carte (min(360px,60vw)) → scale.
    const cardBasePx = Math.min(360, (window.innerWidth || vw) * 0.6) || 1;
    const activeScale = (ACTIVE_COVER * Math.min(vw, vh)) / cardBasePx;

    items.forEach((el, i) => {
      const d = wrappedDelta(i, current);
      const ad = Math.abs(d);
      const x = d * vw * EDGE_FRAC; // voisines poussées vers les bords (relatif)
      const z = -ad * depth;
      const rotY = clamp(-d * 32, -60, 60);
      // ÉCHELLE relative au viewport : active DOMINE (~10x), animée via focus (GSAP)
      const frac = restFrac(ad);
      const scale = activeScale * (frac + (1 - frac) * focusState[i].f);
      const visible = ad <= 2.2;
      el.style.transform = `translate3d(calc(-50% + ${x}px), -50%, ${z}px) rotateY(${rotY}deg) scale(${scale})`;
      el.style.opacity = visible ? String(clamp(1 - ad * 0.16, 0, 1)) : "0";
      el.style.zIndex = String(200 - Math.round(ad * 10));
      el.classList.toggle("is-active", ad < 0.5);
      el.style.pointerEvents = visible ? "auto" : "none";
    });
  }

  // ---- boucle d'animation (lerp de current vers target) ----
  let rafId = null;
  let draggedSignificantly = false;
  function tick() {
    current += (target - current) * 0.12;
    if (Math.abs(target - current) < 0.0005) current = target;
    updateRender();

    // notifie le changement de paire active
    const active = mod(Math.round(current));
    if (active !== lastActive) {
      lastActive = active;
      onChange && onChange(active);
    }
    // met à jour le focus d'échelle (tween GSAP) quand la paire active change
    if (active !== lastFocusActive) setFocus(active);
    rafId = requestAnimationFrame(tick);
  }

  // ---- navigation ----
  function goTo(index, { silent = false } = {}) {
    // choisit le chemin le plus court vers l'item `index`
    const d = wrappedDelta(mod(index), current);
    target = current + d;
    if (!silent) restartAutoplay();
  }
  function next() {
    target += 1;
    restartAutoplay();
  }
  function prev() {
    target -= 1;
    restartAutoplay();
  }

  // ---- autoplay (manège) ----
  function startAutoplay() {
    if (autoplayTimer) return;
    autoplayTimer = setInterval(() => {
      if (autoplay) target += 1;
    }, AUTOPLAY_MS);
  }
  function restartAutoplay() {
    if (autoplayTimer) clearInterval(autoplayTimer);
    autoplayTimer = null;
    if (autoplay) startAutoplay();
  }
  function pauseAutoplay() {
    autoplay = false;
  }
  function resumeAutoplay() {
    autoplay = true;
    restartAutoplay();
  }

  // ---- drag / swipe (souris + tactile via Pointer Events) ----
  let dragging = false;
  let dragStartX = 0;
  let dragStartTarget = 0;
  function onPointerDown(e) {
    dragging = true;
    draggedSignificantly = false;
    dragStartX = e.clientX;
    dragStartTarget = target;
    pauseAutoplay();
    mount.setPointerCapture && mount.setPointerCapture(e.pointerId);
    mount.classList.add("is-grabbing");
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 6) draggedSignificantly = true;
    const spacing = Math.min(320, mount.clientWidth * 0.34);
    target = dragStartTarget - dx / spacing;
  }
  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    target = Math.round(target); // snap
    mount.classList.remove("is-grabbing");
    resumeAutoplay();
  }

  // ---- molette : fait défiler le carousel (hijack local) ----
  let wheelAccum = 0;
  function onWheel(e) {
    // on ne hijacke que l'horizontal-ish / molette quand on survole le carousel
    e.preventDefault();
    wheelAccum += e.deltaY;
    const THRESH = 70;
    if (wheelAccum > THRESH) {
      next();
      wheelAccum = 0;
    } else if (wheelAccum < -THRESH) {
      prev();
      wheelAccum = 0;
    }
  }

  // ---- listeners ----
  mount.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  mount.addEventListener("pointerenter", pauseAutoplay);
  mount.addEventListener("pointerleave", () => {
    resumeAutoplay();
    if (dragging) onPointerUp();
  });
  mount.addEventListener("wheel", onWheel, { passive: false });

  // ---- démarrage ----
  updateRender();
  tick();
  startAutoplay();

  // API publique
  return {
    next,
    prev,
    goTo,
    getActive: () => mod(Math.round(current)),
    // Position animée continue (float). Lecture seule : le module 3D
    // (sneaker3d.js) l'utilise pour placer les modèles comme le manège.
    // N'altère AUCUNE mécanique (swipe / snap / pagination / autoplay).
    getPosition: () => current,
    pauseAutoplay,
    resumeAutoplay,
    destroy() {
      cancelAnimationFrame(rafId);
      if (autoplayTimer) clearInterval(autoplayTimer);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    },
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
