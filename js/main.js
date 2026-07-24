/* =============================================================================
   main.js — Orchestrateur de la landing "Adopte ta shoes"
   -----------------------------------------------------------------------------
   Câble ensemble : Lenis (smooth scroll) + GSAP/ScrollTrigger (reveals) +
   le carousel 3D + les transitions de couleur de marque + les textes animés +
   nav/menu, FAQ accordéon, formulaire newsletter, HUD, toggle son.

   Dépendances chargées en global via CDN dans index.html :
   window.gsap, window.ScrollTrigger, window.Lenis
   (tout est "guardé" : si une lib manque, le contenu reste visible et lisible.)
   ========================================================================== */

import { HERO_LOOKS } from "./hero-data.js";
import { COLLECTION_LOOKS } from "./collection-data.js";
import { createCarousel } from "./carousel.js";
import { renderSneaker } from "./sneaker-renderer.js";
import { initSneaker3D } from "./sneaker3d.js";
import { createCollection3D } from "./collection3d.js";
import { splitChars, splitLines } from "./split-text.js";
import { audio } from "./audio.js";
import { initStorytelling } from "./storytelling.js";

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.addEventListener("DOMContentLoaded", () => {
  initLoader();
  const lenis = initSmoothScroll();
  initNavAndMenu();
  initProgressBar(lenis);
  initThemeToggle();
  initSoundToggle();
  const carousel = initCarousel();
  // Storytelling (chaussure géante scroll-driven) : ADDITIF et INDÉPENDANT,
  // instance Three.js dédiée (cf. js/storytelling.js) — ne reçoit rien du
  // carousel ci-dessus et ne modifie rien de sa mécanique.
  initStorytelling();
  initCollectionGrid();
  initBenefitsNav(lenis);
  initReveals();
  initFAQ();
  initNewsletter();
  initHUD(lenis);
  initFooterYear();

  // Note : la page d'intro (chaussures géantes, une fois par session) N'EST
  // PLUS pilotée depuis ce fichier — cf. js/site-intro.js, un module 100%
  // séparé chargé par son propre <script> dans index.html, qui construit son
  // propre DOM/CSS et ne reçoit rien de main.js (ni n'y est importé).

  // expose pour debug console
  window.__adopte = { carousel, lenis };
});

/* -------------------------------------------------------------------------- */
/* Loader                                                                     */
/* -------------------------------------------------------------------------- */
function initLoader() {
  const loader = document.getElementById("loader");
  const fill = document.querySelector(".loader-progress-fill");
  const percentText = document.getElementById("loader-percent");
  if (!loader) return;

  document.body.style.overflow = "hidden";

  const finish = () => {
    document.body.style.overflow = "";
    document.body.classList.add("site-ready");
    loader.classList.add("is-done");
    setTimeout(() => (loader.style.display = "none"), 800);
  };

  if (!gsap) {
    if (fill) fill.style.width = "100%";
    if (percentText) percentText.textContent = "100";
    finish();
    return;
  }

  const obj = { v: 0 };
  gsap
    .timeline()
    .from(".loader-logo", { opacity: 0, y: 12, duration: 0.7, ease: "power3.out" })
    .to(
      obj,
      {
        v: 100,
        duration: 1.8,
        ease: "power2.inOut",
        onUpdate: () => {
          const val = Math.floor(obj.v);
          if (fill) fill.style.width = val + "%";
          if (percentText) percentText.textContent = val;
        },
      },
      "-=0.2"
    )
    .to(".loader-content", { opacity: 0, y: -12, duration: 0.4, ease: "power2.in" })
    .add(finish);
}

/* -------------------------------------------------------------------------- */
/* Smooth scroll (Lenis) + snap doux par section (desktop)                    */
/* -------------------------------------------------------------------------- */
function initSmoothScroll() {
  if (!window.Lenis || prefersReduced) return null;

  const lenis = new window.Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    // scroll naturel (pas de smooth) sur tactile → meilleure sensation mobile
    smoothTouch: false,
  });

  // relie Lenis au ticker GSAP + ScrollTrigger
  if (gsap && ScrollTrigger) {
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  } else {
    const raf = (t) => {
      lenis.raf(t);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  return lenis;
}

/* -------------------------------------------------------------------------- */
/* Navbar + menu plein écran                                                  */
/* -------------------------------------------------------------------------- */
function initNavAndMenu() {
  const header = document.querySelector(".main-header");
  const toggle = document.getElementById("menuToggle");
  const menu = document.getElementById("mobileMenu");

  // header : fond au scroll
  if (header) {
    window.addEventListener("scroll", () => {
      header.classList.toggle("scrolled", window.pageYOffset > 40);
    });
  }

  if (!toggle || !menu) return;
  const close = () => {
    toggle.classList.remove("is-open");
    menu.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  };
  const open = () => {
    toggle.classList.add("is-open");
    menu.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("menu-open");
    audio.play("click");
  };
  toggle.addEventListener("click", () =>
    menu.classList.contains("is-open") ? close() : open()
  );
  menu.querySelectorAll("a").forEach((a) => a.addEventListener("click", close));
}

/* -------------------------------------------------------------------------- */
/* Barre de progression "liquide"                                             */
/* -------------------------------------------------------------------------- */
function initProgressBar(lenis) {
  const bar = document.querySelector(".scroll-progress-fill");
  if (!bar) return;
  const update = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const p = h > 0 ? window.pageYOffset / h : 0;
    bar.style.transform = `scaleX(${p})`;
  };
  if (lenis) lenis.on("scroll", update);
  window.addEventListener("scroll", update);
  update();
}

/* -------------------------------------------------------------------------- */
/* Toggle thème clair/sombre                                                  */
/* -------------------------------------------------------------------------- *
   L'attribut data-theme est déjà posé de façon synchrone AVANT ce script (cf.
   script inline du <head>, résolu depuis localStorage puis prefers-color-
   scheme) — ce module se contente de lire cet état pour synchroniser l'icône/
   aria-*, puis de le faire basculer au clic + le persister. Tout le reste du
   site (styles.css) réagit déjà à data-theme via les variables CSS : aucune
   autre coordination n'est nécessaire ici, sauf pour la scène 3D du carousel
   (Three.js ne lit pas le CSS) — cf. l'évènement "adopte:theme-change" plus
   bas, écouté en ADDITION par js/sneaker3d.js et js/collection3d.js. */
const THEME_KEY = "adopte-theme";
function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  const root = document.documentElement;
  if (!btn) return;

  const sync = () => {
    const isLight = root.getAttribute("data-theme") === "light";
    btn.setAttribute("aria-pressed", String(isLight));
    btn.setAttribute("aria-label", isLight ? "Passer en mode sombre" : "Passer en mode clair");
  };
  sync();

  btn.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    sync();
    audio.play("click");
    window.dispatchEvent(new CustomEvent("adopte:theme-change", { detail: { theme: next } }));
  });
}

/* -------------------------------------------------------------------------- */
/* Toggle son                                                                 */
/* -------------------------------------------------------------------------- */
function initSoundToggle() {
  const btn = document.getElementById("soundToggle");
  if (!btn) return;
  const sync = () => btn.classList.toggle("is-muted", audio.isMuted());
  sync();
  btn.addEventListener("click", () => {
    audio.toggleMute();
    sync();
    audio.play("click");
  });
}

/* -------------------------------------------------------------------------- */
/* Carousel hero + liaison couleurs/textes/pagination                         */
/* -------------------------------------------------------------------------- */
function initCarousel() {
  const mount = document.getElementById("carouselTrack");
  const dotsWrap = document.getElementById("carouselDots");
  const root = document.documentElement;
  if (!mount) return null;

  // Le manège 3D (Three.js) est initialisé APRÈS le carousel (il lit sa
  // position continue). Cf. plus bas, après createCarousel().
  const scene = document.querySelector(".carousel-scene");
  const viewport = document.querySelector(".carousel-viewport");
  const heroSection = document.getElementById("hero");

  // pagination : un point par carte
  const dots = HERO_LOOKS.map((p, i) => {
    const dot = document.createElement("button");
    dot.className = "carousel-dot";
    dot.setAttribute("aria-label", `${p.name} — ${p.colorway}`);
    dot.addEventListener("click", () => carousel.goTo(i));
    dotsWrap && dotsWrap.appendChild(dot);
    return dot;
  });

  // ambiance urbaine : une couche par carte, crossfade en opacité (cf. styles.css)
  const ambianceLayers = heroSection
    ? HERO_LOOKS.map((p, i) => {
        const el = document.createElement("div");
        el.className = `ambiance-layer ambiance-${p.ambiance}`;
        el.dataset.index = i;
        return el;
      })
    : [];
  if (heroSection && ambianceLayers.length) {
    const wrap = document.createElement("div");
    wrap.className = "hero-ambiance";
    ambianceLayers.forEach((el) => wrap.appendChild(el));
    heroSection.insertBefore(wrap, heroSection.firstChild);
  }

  const applyActive = (index) => {
    const p = HERO_LOOKS[index];
    if (!p) return;

    // 1) couleurs de marque (transition douce via CSS)
    root.style.setProperty("--brand-primary", p.primary);
    root.style.setProperty("--brand-secondary", p.secondary);
    root.style.setProperty("--brand-on", p.text === "light" ? "#f5f2ec" : "#141210");

    // 2) titre hero (nom + coloris) animé caractère par caractère
    setHeroTitle(p);

    // 3) meta (prix, badge)
    setText(".hero-active-price", p.price);
    setBadge(p.badge);

    // 4) pagination
    dots.forEach((d, i) => d.classList.toggle("is-active", i === index));

    // 5) ambiance urbaine derrière la paire active
    ambianceLayers.forEach((el, i) => el.classList.toggle("is-active", i === index));

    // 6) section Profil (description + gros titre décoratif)
    setProfile(p);

    // 7) son
    audio.play("change");
  };

  // NOTE : onClick ne se déclenche (via carousel.js, INCHANGÉ) que pour un clic
  // sur la paire DÉJÀ active — conservé tel quel (juste le son). L'ouverture du
  // panneau de zoom, elle, passe désormais par le raycaster ci-dessous, qui
  // fonctionne pour N'IMPORTE QUELLE paire visible (active ou sur le côté).
  const carousel = createCarousel({
    mount,
    products: HERO_LOOKS,
    onChange: applyActive,
    onClick: () => audio.play("click"),
  });

  // --- Manège 3D : chaque carte = un clone teinté d'un des 2 modèles source -
  // Canvas transparent qui couvre le viewport (pointer-events:none) ; il LIT la
  // position du carousel pour placer les modèles → mécanique carousel inchangée.
  // Si WebGL indisponible → s3d reste null et les visuels 2D restent affichés.
  let s3d = null;
  if (viewport) {
    const layer = document.createElement("div");
    layer.className = "sneaker3d-layer";
    viewport.appendChild(layer);
    s3d = initSneaker3D({
      mount: layer,
      pointerEl: scene || viewport,
      products: HERO_LOOKS,
      getPosition: () => carousel.getPosition(),
      // on masque les visuels 2D une fois le manège 3D visible (modèles chargés)
      onReady: () => scene && scene.classList.add("all-3d"),
      // clic (≠ drag) sur N'IMPORTE QUELLE paire visible, identifiée par raycaster
      // (cf. sneaker3d.js § détection clic) — AJOUT, indépendant de carousel.js.
      onShoeClick: (index) => {
        audio.play("click");
        openFocus(index);
      },
    });
    window.__adopte3d = s3d;
  }

  // flèches
  const prevBtn = document.querySelector(".carousel-arrow.prev");
  const nextBtn = document.querySelector(".carousel-arrow.next");
  prevBtn && prevBtn.addEventListener("click", () => carousel.prev());
  nextBtn && nextBtn.addEventListener("click", () => carousel.next());

  // --- Focus / zoom hero : clic sur N'IMPORTE QUELLE paire visible ---------
  // Agrandit la paire cliquée (recentrée, taille "héros" quelle que soit sa
  // position/taille de départ), floute le reste (scrim + backdrop-filter avec
  // un "trou" masqué sur la zone du carousel-viewport) et affiche nom/date/
  // mini histoire au bout d'une fine ligne annotée. PÉRIMÈTRE : hero uniquement.
  const focus = scene ? initHeroFocus({ scene, viewport, carousel, s3d }) : null;
  function openFocus(index) {
    focus && focus.open(HERO_LOOKS[index], index);
  }

  applyActive(0);
  return carousel;
}

/* -------------------------------------------------------------------------- */
/* Focus / zoom hero — panneau d'info + flou d'arrière-plan au clic           */
/* -------------------------------------------------------------------------- */
function initHeroFocus({ scene, viewport, carousel, s3d }) {
  const heroSection = scene.closest(".hero-section");
  const root = document.createElement("div");
  root.className = "hero-focus";
  root.innerHTML = `
    <div class="hero-focus-scrim"></div>
    <button type="button" class="hero-focus-close" aria-label="Fermer les détails">×</button>
    <div class="hero-focus-info">
      <p class="hero-focus-meta"></p>
      <h3 class="hero-focus-name"></h3>
      <p class="hero-focus-story"></p>
      <div class="hero-focus-line" aria-hidden="true"></div>
    </div>`;
  // le voile doit couvrir TOUTE LA PAGE (position:fixed) : attaché au <body>
  // plutôt qu'à .carousel-scene, pour ne dépendre d'aucun ancêtre local
  // (le hero garde un `overflow:hidden` qui ne gêne pas un fixed, mais on
  // évite ainsi tout risque lié à un futur ancêtre avec transform/filter).
  document.body.appendChild(root);

  const scrim = root.querySelector(".hero-focus-scrim");
  const closeBtn = root.querySelector(".hero-focus-close");
  const lineEl = root.querySelector(".hero-focus-line");
  const metaEl = root.querySelector(".hero-focus-meta");
  const nameEl = root.querySelector(".hero-focus-name");
  const storyEl = root.querySelector(".hero-focus-story");

  let open = false;
  let holeRadiusPx = 0;
  let holeCenter = { x: 0, y: 0 };
  let savedBodyOverflow = "";

  // Centre/rayon du "trou" (zone non floutée) = position RÉELLE du carousel-
  // viewport à l'écran (fixed → coordonnées déjà relatives au viewport, donc
  // directement utilisables) + rayon EXACT de la chaussure une fois zoomée
  // (calculé par sneaker3d.js, cf. getHeroRadiusPx), avec une marge confortable.
  function updateHoleSize() {
    const vp = (viewport || scene).getBoundingClientRect();
    holeCenter = { x: vp.left + vp.width / 2, y: vp.top + vp.height / 2 };
    const shoeR = s3d && s3d.getHeroRadiusPx ? s3d.getHeroRadiusPx() : 0;
    const fallback = Math.min(vp.width, vp.height) * 0.34;
    holeRadiusPx = Math.max(shoeR * 1.18, fallback);
    root.style.setProperty("--hole-x", `${holeCenter.x}px`);
    root.style.setProperty("--hole-y", `${holeCenter.y}px`);
    root.style.setProperty("--hole-r", `${holeRadiusPx}px`);
  }

  function onScrimClick(e) {
    const dist = Math.hypot(e.clientX - holeCenter.x, e.clientY - holeCenter.y);
    if (dist > holeRadiusPx) close(); // clic HORS de la chaussure agrandie
  }
  function onKeydown(e) {
    if (e.key === "Escape") close();
  }

  function openFn(look, index) {
    if (!look || open) return;
    open = true;
    metaEl.textContent = [look.designer, look.releaseDate].filter(Boolean).join(" · ");
    nameEl.textContent = `${look.name} — ${look.colorway}`;
    storyEl.textContent = look.story || "";

    // IMPORTANT : setZoomed AVANT updateHoleSize (qui lit s3d.getHeroRadiusPx(),
    // lui-même basé sur l'index couramment zoomé — sinon le trou ne verrait
    // que le repli générique au premier calcul, avant même de démarrer).
    carousel && carousel.pauseAutoplay();
    s3d && s3d.setZoomed(true, index);
    updateHoleSize();
    root.classList.add("is-open");
    heroSection && heroSection.classList.add("is-zoomed");
    // empêche le reste de la page de défiler pendant le zoom plein écran
    // (sinon le "trou", fixé au viewport, se déciderait du canvas qui lui
    // continuerait de défiler avec le reste de la page).
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("resize", updateHoleSize);
    document.addEventListener("keydown", onKeydown);

    if (gsap && !prefersReduced) {
      gsap.fromTo(lineEl, { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: "power2.out", overwrite: true });
      gsap.fromTo(
        [metaEl, nameEl, storyEl],
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.08, delay: 0.15, overwrite: true }
      );
    }
  }
  function close() {
    if (!open) return;
    open = false;
    carousel && carousel.resumeAutoplay();
    s3d && s3d.setZoomed(false);
    root.classList.remove("is-open");
    heroSection && heroSection.classList.remove("is-zoomed");
    document.body.style.overflow = savedBodyOverflow;
    window.removeEventListener("resize", updateHoleSize);
    document.removeEventListener("keydown", onKeydown);

    // referme la ligne/le texte proprement (sinon les styles inline laissés
    // par GSAP à l'ouverture resteraient figés en position "ouverte").
    if (gsap && !prefersReduced) {
      gsap.to(lineEl, { scaleX: 0, duration: 0.35, ease: "power2.in", overwrite: true });
      gsap.to([metaEl, nameEl, storyEl], { opacity: 0, y: 10, duration: 0.3, ease: "power2.in", overwrite: true });
    }
  }

  scrim.addEventListener("click", onScrimClick);
  closeBtn.addEventListener("click", close);

  return { open: openFn, close };
}

// (Ré)écrit le titre hero et anime les caractères
function setHeroTitle(p) {
  const nameEl = document.querySelector(".hero-active-name");
  const colorEl = document.querySelector(".hero-active-colorway");
  if (!nameEl || !colorEl) return;
  nameEl.textContent = p.name;
  colorEl.textContent = p.colorway;
  if (!gsap || prefersReduced) return;
  [nameEl, colorEl].forEach((el, idx) => {
    const inners = splitChars(el);
    gsap.fromTo(
      inners,
      { yPercent: 110 },
      {
        yPercent: 0,
        duration: 0.6,
        ease: "power4.out",
        stagger: 0.03,
        delay: idx * 0.05,
      }
    );
  });
}

function setProfile(p) {
  const big = document.querySelector(".profile-bigtitle");
  const desc = document.querySelector(".profile-desc");
  if (big) big.textContent = p.name;
  if (!desc) return;
  desc.textContent = p.description;
  if (!gsap || prefersReduced) return;
  const inners = splitLines(desc);
  gsap.fromTo(
    inners,
    { yPercent: 110 },
    { yPercent: 0, duration: 0.7, ease: "power4.out", stagger: 0.08 }
  );
}

function setBadge(badge) {
  const el = document.querySelector(".hero-active-badge");
  if (!el) return;
  if (badge) {
    el.textContent = badge;
    el.style.display = "";
  } else {
    el.style.display = "none";
  }
}

function setText(sel, txt) {
  const el = document.querySelector(sel);
  if (el) el.textContent = txt;
}

/* -------------------------------------------------------------------------- */
/* Grille "Toute la collection" (scroll horizontal) — section ISOLÉE : ses     */
/* données (js/collection-data.js) et son rendu 3D (js/collection3d.js) sont  */
/* propres à cette section, sans dépendre du code du carousel héro.          */
/* -------------------------------------------------------------------------- */
function initCollectionGrid() {
  const grid = document.getElementById("collectionGrid");
  if (!grid) return;
  // moteur 3D partagé (un seul contexte WebGL, 2 modèles sources) ; null si
  // WebGL indispo → repli 2D (silhouette SVG générique par coloris).
  const c3d = createCollection3D({ products: COLLECTION_LOOKS });
  COLLECTION_LOOKS.forEach((p, i) => {
    const card = document.createElement("article");
    card.className = "collection-card";
    card.style.setProperty("--card-primary", p.primary);
    card.style.setProperty("--card-secondary", p.secondary);
    card.style.setProperty("--card-on", p.text === "light" ? "#f5f2ec" : "#141210");

    const media = document.createElement("div");
    media.className = "collection-media";
    if (c3d) {
      // visuel interne = canvas 3D (modèle + coloris propres à la carte)
      const canvas = document.createElement("canvas");
      canvas.className = "collection-canvas";
      media.appendChild(canvas);
      c3d.register(canvas, i);
    } else {
      media.appendChild(renderSneaker(p)); // fallback 2D si pas de WebGL
    }

    const body = document.createElement("div");
    body.className = "collection-body";
    const sizesHtml = p.sizes
      .map((sz) => `<button type="button" class="size-pill" data-size="${sz}" aria-pressed="false">${sz}</button>`)
      .join("");
    // Chaque bloc (badge, nom, coloris, tagline, prix, tailles, bouton) a une
    // hauteur fixe/mini identique sur toutes les cartes (cf. styles.css § 10) :
    // le badge est toujours rendu, même vide, pour réserver sa place et ne
    // jamais décaler le nom en dessous selon les cartes.
    body.innerHTML = `
      <div class="collection-badge-slot">${p.badge ? `<span class="collection-badge">${p.badge}</span>` : ""}</div>
      <h3 class="collection-name">${p.name}</h3>
      <p class="collection-colorway">${p.colorway}</p>
      <p class="collection-tagline">${p.tagline}</p>
      <div class="collection-price-row"><span class="collection-price">${p.price}</span></div>
      <div class="collection-sizes" role="group" aria-label="Choisir une taille">${sizesHtml}</div>
      <button type="button" class="collection-add-btn">
        <span class="add-btn-label">Ajouter au panier</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
      </button>`;

    // sélecteur de taille : simple état visuel (pas de panier réel pour l'instant)
    const sizeBtns = Array.from(body.querySelectorAll(".size-pill"));
    sizeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        sizeBtns.forEach((b) => { b.classList.remove("is-selected"); b.setAttribute("aria-pressed", "false"); });
        btn.classList.add("is-selected");
        btn.setAttribute("aria-pressed", "true");
        audio.play("click");
      });
    });

    // "Ajouter au panier" : retour visuel bref, sans logique de panier réelle.
    const addBtn = body.querySelector(".collection-add-btn");
    const addLabel = addBtn.querySelector(".add-btn-label");
    let addTimer = null;
    addBtn.addEventListener("click", () => {
      audio.play("click");
      addBtn.classList.add("is-added");
      addLabel.textContent = "Ajouté ✓";
      clearTimeout(addTimer);
      addTimer = setTimeout(() => {
        addBtn.classList.remove("is-added");
        addLabel.textContent = "Ajouter au panier";
      }, 1600);
    });

    card.appendChild(media);
    card.appendChild(body);
    grid.appendChild(card);
  });
  if (c3d) c3d.start(); // démarre l'observation/rendu des cartes visibles
}

/* -------------------------------------------------------------------------- */
/* Sections "Pourquoi adopter" : nav latérale à icônes                        */
/* -------------------------------------------------------------------------- */
function initBenefitsNav(lenis) {
  const navBtns = Array.from(document.querySelectorAll(".benefit-nav-item"));
  const panels = Array.from(document.querySelectorAll(".benefit-panel"));
  if (!navBtns.length || !panels.length) return;

  // clic → saute au panneau
  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      if (lenis) lenis.scrollTo(target, { offset: 0 });
      else target.scrollIntoView({ behavior: "smooth" });
      audio.play("click");
    });
  });

  // met en surbrillance l'item courant + son "benefits" à l'entrée
  if (gsap && ScrollTrigger) {
    panels.forEach((panel, i) => {
      ScrollTrigger.create({
        trigger: panel,
        start: "top center",
        end: "bottom center",
        onEnter: () => activate(i),
        onEnterBack: () => activate(i),
      });
    });
  }
  function activate(i) {
    navBtns.forEach((b, j) => b.classList.toggle("is-active", i === j));
    audio.play("benefits");
  }
}

/* -------------------------------------------------------------------------- */
/* Reveals génériques (titres/paragraphes en masque)                          */
/* -------------------------------------------------------------------------- */
function initReveals() {
  if (!gsap || !ScrollTrigger || prefersReduced) return;

  // titres → split caractères
  document.querySelectorAll("[data-reveal='chars']").forEach((el) => {
    const inners = splitChars(el);
    gsap.from(inners, {
      yPercent: 110,
      duration: 0.7,
      ease: "power4.out",
      stagger: 0.02,
      scrollTrigger: { trigger: el, start: "top 85%" },
    });
  });

  // paragraphes / éléments → split lignes
  document.querySelectorAll("[data-reveal='lines']").forEach((el) => {
    const inners = splitLines(el);
    gsap.from(inners, {
      yPercent: 110,
      duration: 0.8,
      ease: "power4.out",
      stagger: 0.08,
      scrollTrigger: { trigger: el, start: "top 88%" },
    });
  });

  // reveal simple (fade + translate)
  document.querySelectorAll("[data-reveal='fade']").forEach((el, i) => {
    gsap.from(el, {
      y: 28,
      opacity: 0,
      duration: 0.8,
      ease: "power3.out",
      delay: (i % 4) * 0.05,
      scrollTrigger: { trigger: el, start: "top 88%" },
    });
  });

  // Statement : scale/fade au scroll
  const statement = document.querySelector(".statement-title");
  if (statement) {
    gsap.fromTo(
      statement,
      { scale: 0.82, opacity: 0.2 },
      {
        scale: 1,
        opacity: 1,
        ease: "none",
        scrollTrigger: {
          trigger: ".statement-section",
          start: "top bottom",
          end: "center center",
          scrub: true,
        },
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* FAQ accordéon                                                              */
/* -------------------------------------------------------------------------- */
function initFAQ() {
  document.querySelectorAll(".faq-item").forEach((item) => {
    const btn = item.querySelector(".faq-question");
    const ans = item.querySelector(".faq-answer");
    if (!btn || !ans) return;
    btn.addEventListener("click", () => {
      const open = item.classList.contains("is-open");
      // ferme les autres
      document.querySelectorAll(".faq-item.is-open").forEach((other) => {
        if (other !== item) {
          other.classList.remove("is-open");
          other.querySelector(".faq-answer").style.maxHeight = null;
          other.querySelector(".faq-question").setAttribute("aria-expanded", "false");
        }
      });
      item.classList.toggle("is-open", !open);
      btn.setAttribute("aria-expanded", String(!open));
      ans.style.maxHeight = open ? null : ans.scrollHeight + "px";
      audio.play("click");
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Newsletter (validation front + POST placeholder)                           */
/* -------------------------------------------------------------------------- */
function initNewsletter() {
  const form = document.getElementById("newsletterForm");
  if (!form) return;
  const email = form.querySelector("input[type='email']");
  const consent = form.querySelector("input[type='checkbox']");
  const status = form.querySelector(".form-status");
  const btn = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    status.className = "form-status";

    if (!email.value || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)) {
      showStatus("Oups, cet email n'a pas l'air valide.", "error");
      return;
    }
    if (consent && !consent.checked) {
      showStatus("Merci de cocher la case RGPD pour continuer.", "error");
      return;
    }

    btn.classList.add("is-loading");
    btn.disabled = true;
    try {
      // PLACEHOLDER : remplace l'URL par ton endpoint (Brevo / Mailchimp / …)
      // await fetch("https://TON-ENDPOINT", { method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ email: email.value }) });
      await new Promise((r) => setTimeout(r, 900)); // simule le réseau
      showStatus("Bienvenue dans la team Adopte ! 🐾 On te tient au courant des drops.", "success");
      form.reset();
    } catch (_) {
      showStatus("Un souci est survenu. Réessaie dans un instant.", "error");
    } finally {
      btn.classList.remove("is-loading");
      btn.disabled = false;
    }
  });

  function showStatus(msg, type) {
    status.textContent = msg;
    status.className = "form-status is-" + type;
  }
}

/* -------------------------------------------------------------------------- */
/* HUD décoratif (coordonnées de scroll)                                      */
/* -------------------------------------------------------------------------- */
function initHUD(lenis) {
  const out = document.querySelector(".hud-coords");
  if (!out) return;
  const update = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const p = h > 0 ? Math.round((window.pageYOffset / h) * 100) : 0;
    out.textContent = `SCROLL ${String(p).padStart(3, "0")} / 100`;
  };
  if (lenis) lenis.on("scroll", update);
  window.addEventListener("scroll", update);
  update();
}

/* -------------------------------------------------------------------------- */
/* Footer : année du copyright générée dynamiquement                          */
/* -------------------------------------------------------------------------- */
function initFooterYear() {
  const el = document.getElementById("footerYear");
  if (el) el.textContent = String(new Date().getFullYear());
}
