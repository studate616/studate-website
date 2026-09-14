'use strict';

(function () {
  const FUNKTION = 'https://gwkmoucgsroqdtgqccvy.supabase.co/functions/v1/founder-dashboard';
  const FOTO_PREFIX = 'https://gwkmoucgsroqdtgqccvy.supabase.co/storage/v1/object/public/';
  const SPEICHER = 'studate_intern_schluessel';
  const INTERVALL_MS = 60000;

  const $ = (id) => document.getElementById(id);
  let hochschulen = {};
  let timer = null;
  let laeuft = false;
  let letzterVerlauf = null;

  // Nutzerinhalte (Namen, Studiengänge) landen hier. Deshalb wird nie innerHTML
  // benutzt: jeder Text geht über textContent, sonst könnte ein präparierter
  // Profilname Skript im Dashboard ausführen und den Schlüssel abgreifen.
  function el(tag, attrs, kinder) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'text') node.textContent = String(v);
        else if (k === 'klasse') node.className = v;
        else node.setAttribute(k, String(v));
      }
    }
    for (const kind of kinder || []) if (kind) node.appendChild(kind);
    return node;
  }
  function leeren(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function lesen() { try { return localStorage.getItem(SPEICHER); } catch (_) { return null; } }
  function schreiben(v) { try { v ? localStorage.setItem(SPEICHER, v) : localStorage.removeItem(SPEICHER); } catch (_) {} }

  const zahl = new Intl.NumberFormat('de-DE');
  function quote(teil, ganz) { return ganz > 0 ? Math.round((teil / ganz) * 100) + ' %' : 'k. A.'; }

  function vorWann(iso) {
    if (!iso) return 'nie';
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'gerade eben';
    if (s < 3600) return 'vor ' + Math.floor(s / 60) + ' Min.';
    if (s < 86400) return 'vor ' + Math.floor(s / 3600) + ' Std.';
    const t = Math.floor(s / 86400);
    return t === 1 ? 'gestern' : 'vor ' + t + ' Tagen';
  }
  function tagKurz(iso) {
    const [, m, t] = iso.slice(0, 10).split('-');
    return t + '.' + m + '.';
  }
  function hochschulName(id) {
    const h = hochschulen[id];
    return h ? h.n : (id || 'unbekannt');
  }

  function kachel(wert, titel, zusatz, variante) {
    return el('div', { klasse: 'kachel' + (variante ? ' ' + variante : '') }, [
      el('div', { klasse: 'wert', text: zahl.format(wert) }),
      el('div', { klasse: 'titel', text: titel }),
      zusatz ? el('div', { klasse: 'zusatz', text: zusatz }) : null,
    ]);
  }

  function renderKacheln(k) {
    const w = $('kacheln-wachstum');
    leeren(w);
    w.append(
      kachel(k.profile, 'Fertige Profile', '+' + k.profile_heute + ' heute', 'hervor'),
      kachel(k.konten, 'Konten gesamt', '+' + k.konten_heute + ' heute, +' + k.konten_7_tage + ' in 7 Tagen'),
      kachel(k.ohne_profil, 'Onboarding offen', quote(k.ohne_profil, k.konten) + ' der Konten'),
      kachel(k.aktiv_24h, 'Aktiv in 24 Std.', k.aktiv_7_tage + ' in 7 Tagen'),
      kachel(k.verifiziert, 'Verifiziert', quote(k.verifiziert, k.profile) + ' der Profile'),
      kachel(k.pausiert, 'Pausiert', 'unsichtbar im Deck'),
      kachel(k.mit_push, 'Mitteilungen an', quote(k.mit_push, k.profile) + ' der Profile'),
      kachel(k.meldungen_offen, 'Offene Meldungen', k.blockierungen + ' Blockierungen', k.meldungen_offen > 0 ? 'alarm' : null)
    );
    const a = $('kacheln-aktivitaet');
    leeren(a);
    a.append(
      kachel(k.pings, 'Pings', '+' + k.pings_heute + ' heute'),
      kachel(k.matches, 'Connects', '+' + k.matches_heute + ' heute'),
      kachel(k.nachrichten, 'Nachrichten', '+' + k.nachrichten_heute + ' heute'),
      kachel(k.posts + k.meetups, 'Posts und Meetups', k.posts + ' Posts, ' + k.meetups + ' Meetups')
    );
  }

  function renderVerlauf(verlauf) {
    const box = $('verlauf');
    leeren(box);
    letzterVerlauf = verlauf;
    const B = Math.max(260, Math.round(box.clientWidth || 600)), H = 190, oben = 18, unten = 24, links = 4, rechts = 4;
    const max = Math.max(1, ...verlauf.map((d) => d.konten));
    const skalaMax = max <= 4 ? max : Math.ceil(max / 5) * 5;
    const schritt = (B - links - rechts) / verlauf.length;
    const breite = Math.max(3, schritt - 2);
    const hoehe = (v) => ((H - oben - unten) * v) / skalaMax;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + B + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Neue Konten pro Tag, letzte 30 Tage, Höchstwert ' + max);
    const s = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const k in attrs) {
        if (k === 'fill' || k === 'stroke') n.style[k] = attrs[k];
        else n.setAttribute(k, attrs[k]);
      }
      return n;
    };

    const grundY = H - unten;
    const obenY = oben;
    svg.appendChild(s('line', { x1: links, x2: B - rechts, y1: grundY, y2: grundY, stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.appendChild(s('line', { x1: links, x2: B - rechts, y1: obenY, y2: obenY, stroke: 'var(--grid)', 'stroke-width': 1, 'stroke-dasharray': '3 4' }));
    const lab = s('text', { x: B - rechts, y: obenY - 5, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--ink-mute)' });
    lab.textContent = skalaMax;
    svg.appendChild(lab);

    const tip = el('div', { klasse: 'tip', role: 'status' });
    verlauf.forEach((d, i) => {
      const x = links + i * schritt + (schritt - breite) / 2;
      const h = hoehe(d.konten);
      if (h > 0) {
        const r = Math.min(4, breite / 2, h);
        const y = grundY - h;
        const pfad = 'M' + x + ',' + grundY + ' V' + (y + r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
          ' H' + (x + breite - r) + ' Q' + (x + breite) + ',' + y + ' ' + (x + breite) + ',' + (y + r) + ' V' + grundY + ' Z';
        svg.appendChild(s('path', { d: pfad, fill: 'var(--bar)' }));
      }
      const treffer = s('rect', { x: links + i * schritt, y: obenY, width: schritt, height: grundY - obenY, fill: 'transparent', tabindex: 0,
        'aria-label': tagKurz(d.tag) + ': ' + d.konten + ' Konten, ' + d.profile + ' fertige Profile' });
      const zeigen = () => {
        tip.textContent = tagKurz(d.tag) + '  ' + d.konten + ' Konten, ' + d.profile + ' Profile';
        const r = box.getBoundingClientRect();
        tip.style.left = Math.min(r.width - 70, Math.max(70, ((links + (i + 0.5) * schritt) / B) * r.width)) + 'px';
        tip.style.top = (((grundY - h) / H) * r.height) + 'px';
        tip.classList.add('an');
      };
      treffer.addEventListener('pointerenter', zeigen);
      treffer.addEventListener('pointerdown', zeigen);
      treffer.addEventListener('focus', zeigen);
      treffer.addEventListener('pointerleave', () => tip.classList.remove('an'));
      treffer.addEventListener('blur', () => tip.classList.remove('an'));
      svg.appendChild(treffer);
    });
    [0, Math.floor(verlauf.length / 2), verlauf.length - 1].forEach((i, n) => {
      const t = s('text', { x: links + (i + 0.5) * schritt, y: H - 6, 'text-anchor': n === 0 ? 'start' : n === 2 ? 'end' : 'middle', 'font-size': 11, fill: 'var(--ink-mute)' });
      t.textContent = tagKurz(verlauf[i].tag);
      svg.appendChild(t);
    });
    box.append(svg, tip);

    const tb = $('verlauf-tabelle');
    leeren(tb);
    verlauf.slice().reverse().forEach((d) => {
      tb.appendChild(el('tr', null, [
        el('td', { text: tagKurz(d.tag) }),
        el('td', { klasse: 'zahl', text: d.konten }),
        el('td', { klasse: 'zahl', text: d.profile }),
      ]));
    });
  }

  function renderHochschulen(liste, geschlecht) {
    const box = $('hochschulen');
    leeren(box);
    if (!liste.length) box.appendChild(el('p', { klasse: 'leer', text: 'Noch keine Profile.' }));
    const max = Math.max(1, ...liste.map((h) => h.anzahl));
    liste.slice(0, 12).forEach((h) => {
      const fuell = el('div', { klasse: 'fuell' });
      fuell.style.width = Math.max(4, (h.anzahl / max) * 100) + '%';
      box.appendChild(el('div', { klasse: 'balken-zeile', title: (hochschulen[h.id] || {}).v || h.id }, [
        el('div', { klasse: 'oben' }, [el('span', { text: hochschulName(h.id) }), el('span', { text: h.anzahl })]),
        el('div', { klasse: 'spur' }, [fuell]),
      ]));
    });
    if (liste.length > 12) box.appendChild(el('p', { klasse: 'leer', text: '+ ' + (liste.length - 12) + ' weitere Hochschulen' }));

    const g = $('geschlecht');
    leeren(g);
    const namen = { w: 'weiblich', m: 'männlich', d: 'divers' };
    Object.entries(geschlecht).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      g.appendChild(el('span', null, [el('b', { text: v }), document.createTextNode(' ' + (namen[k] || k))]));
    });
  }

  function renderProfile(profile) {
    const box = $('profile');
    leeren(box);
    if (!profile.length) { box.appendChild(el('p', { klasse: 'leer', text: 'Noch keine Profile.' })); return; }
    profile.forEach((p) => {
      const neu = Date.now() - new Date(p.angelegt).getTime() < 24 * 3600 * 1000;
      const bild = typeof p.foto === 'string' && p.foto.startsWith(FOTO_PREFIX)
        ? el('img', { src: p.foto, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' })
        : el('div', { klasse: 'platzhalter', text: (p.name || '?').trim().charAt(0).toUpperCase() });
      const teile = [p.studiengang, p.semester ? p.semester + '. Semester' : null].filter(Boolean).join(', ');
      box.appendChild(el('div', { klasse: 'profil' }, [
        bild,
        el('div', { klasse: 'text' }, [
          el('div', { klasse: 'name' }, [
            document.createTextNode((p.name || 'ohne Namen') + (p.alter ? ', ' + p.alter : '')),
            neu ? el('span', { klasse: 'marke neu', text: 'neu' }) : null,
            p.verification === 'verifiziert' ? el('span', { klasse: 'marke', text: 'verifiziert' }) : null,
            p.paused ? el('span', { klasse: 'marke pause', text: 'pausiert' }) : null,
          ]),
          el('div', { klasse: 'meta', text: hochschulName(p.uni_id) }),
          teile ? el('div', { klasse: 'meta', text: teile }) : null,
          el('div', { klasse: 'zeit', text: 'angelegt ' + vorWann(p.angelegt) + ', zuletzt aktiv ' + vorWann(p.zuletzt_aktiv) }),
        ]),
      ]));
    });
  }

  function renderOnboardings(liste) {
    const box = $('onboardings');
    leeren(box);
    if (!liste.length) { box.appendChild(el('p', { klasse: 'leer', text: 'Niemand hängt gerade im Onboarding.' })); return; }
    liste.forEach((o) => {
      box.appendChild(el('div', null, [el('code', { text: o.kurz_id }), el('span', { text: 'angemeldet ' + vorWann(o.angemeldet) })]));
    });
  }

  function zeigeAnmeldung(meldung) {
    stopp();
    $('app').hidden = true;
    $('anmelden').hidden = false;
    $('anmelde-fehler').textContent = meldung || '';
    $('schluessel').value = '';
    setTimeout(() => $('schluessel').focus(), 50);
  }

  async function laden() {
    const schluessel = lesen();
    if (!schluessel) return zeigeAnmeldung();
    if (laeuft) return;
    laeuft = true;
    $('inhalt').classList.add('laedt');
    try {
      const res = await fetch(FUNKTION, { method: 'POST', headers: { 'x-founder-key': schluessel }, cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (res.status === 401) { schreiben(null); return zeigeAnmeldung('Dieser Schlüssel ist nicht gültig.'); }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const d = await res.json();
      $('anmelden').hidden = true;
      $('app').hidden = false;
      $('fehler').textContent = '';
      renderKacheln(d.kennzahlen);
      renderVerlauf(d.verlauf || []);
      renderHochschulen(d.hochschulen || [], d.geschlecht || {});
      renderProfile(d.neueste_profile || []);
      renderOnboardings(d.offene_onboardings || []);
      const zeit = new Date(d.stand).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      $('stand').textContent = 'Stand ' + zeit + (d.gruender ? ', ' + d.gruender.charAt(0).toUpperCase() + d.gruender.slice(1) : '');
      start();
    } catch (e) {
      if (!$('app').hidden) $('fehler').textContent = 'Aktualisieren fehlgeschlagen. Nächster Versuch in einer Minute.';
      else zeigeAnmeldung('Server nicht erreichbar. Bitte gleich noch einmal versuchen.');
    } finally {
      laeuft = false;
      $('inhalt').classList.remove('laedt');
    }
  }

  function start() { stopp(); timer = setInterval(() => { if (document.visibilityState === 'visible') laden(); }, INTERVALL_MS); }
  function stopp() { if (timer) clearInterval(timer); timer = null; }

  // Bewusst keine Übergabe per Link (#k=...): Der Browser behält die zuerst
  // aufgerufene Adresse im Verlauf, auch wenn sie danach ersetzt wird.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);

  $('anmelde-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const wert = $('schluessel').value.trim();
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(wert)) { $('anmelde-fehler').textContent = 'Das sieht nicht nach einem gültigen Schlüssel aus.'; return; }
    schreiben(wert);
    laden();
  });
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (letzterVerlauf && !$('app').hidden) renderVerlauf(letzterVerlauf); }, 150);
  });
  $('neu-laden').addEventListener('click', laden);
  $('abmelden').addEventListener('click', () => { schreiben(null); zeigeAnmeldung('Abgemeldet. Der Schlüssel wurde von diesem Gerät entfernt.'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && lesen()) laden(); });

  fetch('hochschulen.json', { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((h) => { hochschulen = h || {}; laden(); });
})();
