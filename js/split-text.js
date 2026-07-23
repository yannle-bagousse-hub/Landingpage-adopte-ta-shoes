/* =============================================================================
   split-text.js — Découpage de texte maison (alternative gratuite à SplitText)
   -----------------------------------------------------------------------------
   SplitText de GSAP est un plugin payant. On fait un split maison :
   - splitChars(el)  → enveloppe chaque caractère dans un masque (pour titres)
   - splitLines(el)  → regroupe les mots par ligne réelle (pour paragraphes)

   Chaque unité a la structure : <span class="split-mask"><span class="split-inner">X</span></span>
   .split-mask a overflow:hidden (voir styles.css), .split-inner est ce qu'on
   anime en translateY pour l'effet "le texte glisse depuis le bas".
   ========================================================================== */

function makeUnit(content, isChar) {
  const mask = document.createElement("span");
  mask.className = isChar ? "split-mask split-mask--char" : "split-mask split-mask--line";
  const inner = document.createElement("span");
  inner.className = "split-inner";
  if (typeof content === "string") inner.textContent = content;
  else inner.appendChild(content);
  mask.appendChild(inner);
  return { mask, inner };
}

/** Découpe en caractères (espaces préservés). Renvoie les .split-inner à animer. */
export function splitChars(el) {
  const text = el.textContent;
  el.textContent = "";
  el.classList.add("is-split");
  const inners = [];
  for (const ch of text) {
    if (ch === " ") {
      el.appendChild(document.createTextNode(" "));
      continue;
    }
    const { mask, inner } = makeUnit(ch, true);
    el.appendChild(mask);
    inners.push(inner);
  }
  return inners;
}

/**
 * Découpe en lignes réelles : on enveloppe chaque mot, on mesure les sauts de
 * ligne (offsetTop), puis on regroupe les mots d'une même ligne dans un masque.
 * Renvoie les .split-inner (un par ligne) à animer.
 */
export function splitLines(el) {
  const words = el.textContent.split(/\s+/).filter(Boolean);
  el.textContent = "";
  el.classList.add("is-split");

  // 1) placer chaque mot dans un span temporaire pour mesurer les lignes
  const temp = [];
  words.forEach((w, i) => {
    const span = document.createElement("span");
    span.style.display = "inline-block";
    span.textContent = w;
    el.appendChild(span);
    temp.push(span);
    if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
  });

  // 2) grouper par offsetTop
  const lines = [];
  let currentTop = null;
  let bucket = [];
  temp.forEach((span) => {
    const top = span.offsetTop;
    if (currentTop === null) currentTop = top;
    if (Math.abs(top - currentTop) > 2) {
      lines.push(bucket);
      bucket = [];
      currentTop = top;
    }
    bucket.push(span.textContent);
  });
  if (bucket.length) lines.push(bucket);

  // 3) reconstruire en masques de ligne
  el.textContent = "";
  const inners = [];
  lines.forEach((lineWords) => {
    const lineWrap = document.createElement("span");
    lineWrap.className = "split-line-wrap";
    const { mask, inner } = makeUnit(lineWords.join(" "), false);
    lineWrap.appendChild(mask);
    el.appendChild(lineWrap);
    inners.push(inner);
  });
  return inners;
}
