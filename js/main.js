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

import { PRODUCTS } from "./data.js";
import { createCarousel } from "./carousel.js";
import { renderSneaker } from "./sneaker-renderer.js";
import { initSneaker3D } from "./sneaker3d.js";
import { createCollection3D } from "./collection3d.js";
import { splitChars, splitLines } from "./split-text.js";
import { audio } from "./audio.js";

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

document.addEventListener("DOMContentLoaded", () => {
  initLoader();
  const lenis = initSmoothScroll();
  initNavAndMenu();
  initProgressBar(lenis);
  initSoundToggle();
  const carousel = initCarousel();
  initCollectionGrid();
  initBenefitsNav(lenis);
  initReveals();
  initFAQ();
  initNewsletter();
  initHUD(lenis);

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

  // pagination : un point par produit
  const dots = PRODUCTS.map((p, i) => {
    const dot = document.createElement("button");
    dot.className = "carousel-dot";
    dot.setAttribute("aria-label", `${p.name} — ${p.colorway}`);
    dot.addEventListener("click", () => carousel.goTo(i));
    dotsWrap && dotsWrap.appendChild(dot);
    return dot;
  });

  const applyActive = (index) => {
    const p = PRODUCTS[index];
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

    // 5) section Profil (description + gros titre décoratif)
    setProfile(p);

    // 6) son
    audio.play("change");
  };

  const carousel = createCarousel({
    mount,
    products: PRODUCTS,
    onChange: applyActive,
    onClick: () => audio.play("click"),
  });

  // --- Manège 3D : TOUTES les paires en vrais modèles 3D distincts ---------
  // Canvas transparent qui couvre le viewport (pointer-events:none) ; il LIT la
  // position du carousel pour placer les modèles → mécanique carousel inchangée.
  // Si WebGL indisponible → s3d = null et les visuels 2D restent affichés.
  if (viewport) {
    const layer = document.createElement("div");
    layer.className = "sneaker3d-layer";
    viewport.appendChild(layer);
    const s3d = initSneaker3D({
      mount: layer,
      pointerEl: scene || viewport,
      products: PRODUCTS,
      getPosition: () => carousel.getPosition(),
      // on masque les visuels 2D une fois le manège 3D visible (base chargée)
      onReady: () => scene && scene.classList.add("all-3d"),
    });
    window.__adopte3d = s3d;
  }

  // flèches
  const prevBtn = document.querySelector(".carousel-arrow.prev");
  const nextBtn = document.querySelector(".carousel-arrow.next");
  prevBtn && prevBtn.addEventListener("click", () => carousel.prev());
  nextBtn && nextBtn.addEventListener("click", () => carousel.next());

  applyActive(0);
  return carousel;
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
/* Grille "Toute la collection" (scroll horizontal) — réutilise le renderer   */
/* -------------------------------------------------------------------------- */
function initCollectionGrid() {
  const grid = document.getElementById("collectionGrid");
  if (!grid) return;
  // moteur 3D partagé (un seul contexte WebGL) ; null si WebGL indispo → 2D
  const c3d = createCollection3D();
  PRODUCTS.forEach((p, i) => {
    const card = document.createElement("article");
    card.className = "collection-card";
    card.style.setProperty("--card-primary", p.primary);
    card.style.setProperty("--card-secondary", p.secondary);

    const media = document.createElement("div");
    media.className = "collection-media";
    if (c3d) {
      // visuel interne = canvas 3D (même modèle Miles, coloris par carte)
      const canvas = document.createElement("canvas");
      canvas.className = "collection-canvas";
      media.appendChild(canvas);
      c3d.register(canvas, i);
    } else {
      media.appendChild(renderSneaker(p)); // fallback 2D si pas de WebGL
    }

    const body = document.createElement("div");
    body.className = "collection-body";
    body.innerHTML = `
      ${p.badge ? `<span class="collection-badge">${p.badge}</span>` : ""}
      <h3>${p.name}</h3>
      <p class="collection-colorway">${p.colorway}</p>
      <div class="collection-meta"><span>${p.price}</span><a href="#newsletter">Adopter</a></div>`;

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
