(() => {
  'use strict';

  const lista = document.getElementById('lista');
  const datum = document.getElementById('datum');

  datum.textContent = new Date().toLocaleDateString('hu-HU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const TIMEOUT_MS = 6000;
  const INK = '#1a0b2e';

  /* ---------- Színek ---------- */

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  // Tartalék szín: a domainből számolt, mindig ugyanaz a vidám árnyalat
  function hashColor(text) {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return hslToRgb(h % 360, 85, 62);
  }

  // Az ikon átlagszíne (az átlátszó pixeleket figyelmen kívül hagyja)
  function averageColor(img) {
    try {
      const size = 32;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      let r = 0, g = 0, b = 0, w = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a < 20) continue;
        r += data[i] * a;
        g += data[i + 1] * a;
        b += data[i + 2] * a;
        w += a;
      }
      if (!w) return null;
      return [Math.round(r / w), Math.round(g / w), Math.round(b / w)];
    } catch (e) {
      return null; // CORS nélküli kép: a canvas nem olvasható
    }
  }

  function paint(card, rgb) {
    const [r, g, b] = rgb;
    card.style.setProperty('--card-bg', `rgb(${r} ${g} ${b})`);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    card.style.setProperty('--card-fg', lum > 150 ? INK : '#fff');
  }

  /* ---------- Oldal adatai (név, ikon) ---------- */

  async function fetchInfo(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const title = (doc.querySelector('title')?.textContent || '').trim();
      const href = doc.querySelector('link[rel~="icon"]')?.getAttribute('href');
      return { title, icon: href ? new URL(href, res.url || url).href : null };
    } catch (e) {
      return {}; // jellemzően CORS: a tartalék megoldások lépnek életbe
    } finally {
      clearTimeout(timer);
    }
  }

  function loadImage(src, cors) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  async function loadIcon(candidates) {
    for (const src of candidates) {
      try { return { img: await loadImage(src, true), readable: true }; } catch (e) { /* tovább */ }
      try { return { img: await loadImage(src, false), readable: false }; } catch (e) { /* tovább */ }
    }
    return null;
  }

  /* ---------- Kártyák ---------- */

  function createCard(entry) {
    const url = new URL(entry.link, location.href);
    const host = url.hostname.replace(/^www\./, '');

    const card = document.createElement('a');
    card.className = 'card';
    card.href = url.href;
    card.target = '_blank';
    card.rel = 'noopener';

    const iconBox = document.createElement('div');
    iconBox.className = 'card-icon';
    iconBox.textContent = '🌐';

    const body = document.createElement('div');
    body.className = 'card-body';
    const name = document.createElement('h2');
    name.className = 'card-name';
    name.textContent = entry.nev || host;
    const text = document.createElement('p');
    text.className = 'card-text';
    text.textContent = entry.leiras || '';
    body.append(name, text);

    const go = document.createElement('span');
    go.className = 'card-go';
    go.setAttribute('aria-hidden', 'true');
    go.textContent = '→';

    card.append(iconBox, body, go);
    enrich(card, entry, url, host, name, iconBox);
    return card;
  }

  async function enrich(card, entry, url, host, nameEl, iconBox) {
    const info = (!entry.nev || !entry.ikon) ? await fetchInfo(url.href) : {};

    if (!entry.nev && info.title) nameEl.textContent = info.title;

    const candidates = [
      entry.ikon && new URL(entry.ikon, url.href).href,
      info.icon,
      url.origin + '/favicon.ico'
    ].filter(Boolean);

    const icon = await loadIcon(candidates);
    let color = null;
    if (icon) {
      icon.img.alt = '';
      iconBox.textContent = '';
      iconBox.append(icon.img);
      if (icon.readable) color = averageColor(icon.img);
    }
    paint(card, color || hashColor(host));
  }

  /* ---------- Indulás ---------- */

  function showStatus(message) {
    lista.replaceChildren();
    const p = document.createElement('p');
    p.className = 'status';
    p.textContent = message;
    lista.append(p);
  }

  async function init() {
    let data;
    try {
      const res = await fetch('oldalak.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      data = await res.json();
    } catch (e) {
      showStatus('Nem sikerült betölteni az oldalak.json fájlt. 😢');
      return;
    }

    if (!Array.isArray(data) || !data.length) {
      showStatus('Még nincs mit csinálni mára, vegyél fel linkeket az oldalak.json-be! 🎉');
      return;
    }

    lista.replaceChildren();
    for (const entry of data) {
      if (!entry || !entry.link) continue;
      try {
        lista.append(createCard(entry));
      } catch (e) {
        console.warn('Hibás link az oldalak.json-ben:', entry);
      }
    }
  }

  init();
})();
