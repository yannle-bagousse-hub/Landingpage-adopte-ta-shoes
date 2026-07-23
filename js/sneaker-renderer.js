/* =============================================================================
   sneaker-renderer.js — MODULE ISOLÉ de rendu d'une sneaker (Option B : 2.5D)
   -----------------------------------------------------------------------------
   POURQUOI CE MODULE EST SÉPARÉ :
   Tout ce qui "dessine" une chaussure vit ici et NULLE PART AILLEURS. Le
   carousel (carousel.js) se contente de positionner/tourner le noeud DOM
   renvoyé par renderSneaker(). Pour passer à l'Option A (vrais modèles 3D
   Three.js + .glb), il suffira de réécrire CE fichier pour renvoyer un
   <canvas> WebGL au lieu d'un <svg>, sans toucher au carousel ni au reste.

   OPTION B (actuelle) :
   - Si product.image est défini → on affiche la photo détourée (PNG transparent).
   - Sinon → on dessine un PLACEHOLDER : une silhouette de sneaker en SVG,
     coloriée avec les couleurs du coloris (primary = corps, secondary = semelle).
     C'est volontairement générique (aucune marque) et clairement identifié
     comme placeholder à remplacer.
   ========================================================================== */

/**
 * Construit le visuel d'une sneaker.
 * @param {object} product - un objet de PRODUCTS (voir data.js)
 * @returns {HTMLElement} un noeud à insérer dans le DOM
 */
export function renderSneaker(product) {
  const wrap = document.createElement("div");
  wrap.className = "sneaker-visual";

  if (product.image) {
    // --- Vraie photo détourée fournie ---
    const img = document.createElement("img");
    img.src = product.image;
    img.alt = `${product.name} — ${product.colorway}`;
    img.className = "sneaker-photo";
    img.loading = "lazy";
    wrap.appendChild(img);
  } else {
    // --- PLACEHOLDER SVG (silhouette générique deux tons) ---
    wrap.classList.add("is-placeholder");
    wrap.innerHTML = placeholderSVG(product);
  }

  return wrap;
}

/**
 * Silhouette de sneaker stylisée en SVG (vue de profil, générique).
 * Deux tons : `primary` pour l'empeigne, `secondary` pour la semelle/accents.
 * PLACEHOLDER — à remplacer par de vraies photos via product.image.
 */
function placeholderSVG(product) {
  const p = product.primary;
  const s = product.secondary;
  const dark = product.text === "light"; // paire foncée → highlights clairs
  const stitch = dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.22)";
  const shade = dark ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.14)";

  // viewBox 0 0 420 240 — silhouette chunky/lifestyle, profil gauche.
  return `
  <svg class="sneaker-svg" viewBox="0 0 420 240" xmlns="http://www.w3.org/2000/svg" role="img"
       aria-label="${product.name} — ${product.colorway}">
    <defs>
      <linearGradient id="grad-${product.id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${p}"/>
        <stop offset="1" stop-color="${mix(p, s, 0.35)}"/>
      </linearGradient>
      <filter id="soft-${product.id}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="rgba(0,0,0,0.4)"/>
      </filter>
    </defs>

    <g filter="url(#soft-${product.id})">
      <!-- Semelle extérieure -->
      <path d="M18 196 Q10 214 40 216 L360 216 Q400 214 402 190
               Q404 176 388 172 L60 176 Q30 178 18 196 Z"
            fill="${s}"/>
      <!-- Midsole (bandeau clair) -->
      <path d="M22 190 Q16 200 44 202 L360 202 Q392 200 392 184
               L60 172 Q34 174 22 190 Z"
            fill="${mix(s, "#ffffff", 0.28)}"/>

      <!-- Empeigne principale -->
      <path d="M60 172 Q70 96 150 84 Q210 74 250 92
               Q300 112 372 128 Q396 132 392 156 Q388 174 360 176 L60 176 Z"
            fill="url(#grad-${product.id})"/>

      <!-- Bout renforcé (toe) -->
      <path d="M60 172 Q66 118 128 100 Q150 96 150 176 L60 176 Z"
            fill="${mix(p, s, 0.4)}"/>

      <!-- Contrefort talon -->
      <path d="M372 128 Q398 132 392 158 Q388 174 360 176 L338 176
               Q346 140 372 128 Z"
            fill="${mix(p, s, 0.4)}"/>

      <!-- Accent latéral (bande générique, PAS un swoosh de marque) -->
      <path d="M150 168 Q210 120 300 150 Q262 168 220 170 Q186 172 150 168 Z"
            fill="${s}" opacity="0.9"/>

      <!-- Zone laçage -->
      <path d="M150 92 Q200 82 244 100 L238 150 Q196 130 156 138 Z"
            fill="${mix(p, "#ffffff", dark ? 0.12 : 0.22)}"/>
      <g stroke="${stitch}" stroke-width="4" stroke-linecap="round">
        <line x1="168" y1="112" x2="216" y2="120"/>
        <line x1="166" y1="126" x2="214" y2="134"/>
        <line x1="166" y1="140" x2="212" y2="146"/>
      </g>

      <!-- Ombrage bas empeigne -->
      <path d="M60 176 L360 176 Q372 176 372 172 L60 168 Z" fill="${shade}"/>

      <!-- Oeillet / détail talon -->
      <circle cx="250" cy="104" r="6" fill="${stitch}"/>
    </g>
  </svg>`;
}

/* --- petit util : mélange deux couleurs hex (ratio 0→1 vers c2) --- */
function mix(c1, c2, ratio) {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  if (!a || !b) return c1;
  const r = Math.round(a.r + (b.r - a.r) * ratio);
  const g = Math.round(a.g + (b.g - a.g) * ratio);
  const bl = Math.round(a.b + (b.b - a.b) * ratio);
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
