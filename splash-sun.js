// Splash: solen stiger över en tunn havslinje, sväller i middagshettan och
// förvandlas till appens citron (samma som vid dra-ner-för-att-uppdatera).
// Allt ritas i en SVG som uppdateras varje bildruta (requestAnimationFrame).
// Tempot läses från CSS-variabeln --splash-k så att JS-tidslinjen och
// CSS-animationerna (rubriken, uttoningen) alltid följs åt.
//
// Filen laddas i <head> så att temat (dag/gyllene/natt) är satt innan
// sidan målas första gången. Själva animationen startas med SunSplash.start().
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const seg = (t, a, b) => clamp01((t - a) / (b - a));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const easeOutBack = (x) => { const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

  // Blandar två hex-färger, t = 0 → a, t = 1 → b
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // --- Dag, gyllene timme eller natt, utan nät ----------------------------
  // Soluppgång/solnedgång räknas ut med "solekvationen" (samma formel som
  // almanackor använder). Gränserna är desamma som applyDaypart() i app.js.
  function sunTimes(nowMs, lat, lon) {
    const rad = Math.PI / 180;
    const J = nowMs / 86400000 + 2440587.5;          // julianskt dagnummer
    const n = Math.round(J - 2451545.0);             // närmaste soltopp (mitt på dagen)
    const Jstar = n - lon / 360;
    const M = (357.5291 + 0.98560028 * Jstar) % 360; // solens medelanomali
    const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
    const L = (M + C + 180 + 102.9372) % 360;        // ekliptisk longitud
    const Jtransit = 2451545 + Jstar + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
    const sinD = Math.sin(L * rad) * Math.sin(23.4397 * rad);
    const cosD = Math.cos(Math.asin(sinD));
    const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * sinD) / (Math.cos(lat * rad) * cosD);
    const w = Math.acos(Math.max(-1, Math.min(1, cosW))) / rad;
    const toMs = (j) => (j - 2440587.5) * 86400000;
    return { rise: toMs(Jtransit - w / 360), set: toMs(Jtransit + w / 360) };
  }

  function daypartFor(lat, lon, nowMs = Date.now()) {
    const { rise, set } = sunTimes(nowMs, lat, lon);
    const MIN = 60000;
    if (nowMs < rise - 40 * MIN || nowMs > set + 45 * MIN) return "night";
    if (nowMs > set - 75 * MIN || nowMs < rise + 30 * MIN) return "golden";
    return "day";
  }

  // --- Utseende per tema ---------------------------------------------------
  // body: [ljus mitt, grundfärg, mörk kant]. restY: var solen/månen stannar
  // (lägre under gyllene timmen, högre för månen). rays: 0 = inga strålar.
  const LOOK = {
    day:    { body: ["#FFF4B8", "#F6D04D", "#E5B02A"], ray: "#F2C23A", glow: "#F6D04D", sea: "#2F86A6", restY: -16, rays: 1, theme: "#FFF8EC" },
    golden: { body: ["#FFDDB0", "#F5A04A", "#D9702F"], ray: "#EE8C3C", glow: "#F59A50", sea: "#4C7F9E", restY: 10,  rays: 1, theme: "#F9C9AC" },
    night:  { body: ["#FFFCF3", "#F1E6CF", "#CDBFA3"], ray: "#F1E6CF", glow: "#C9D3F2", sea: "#7CC3DD", restY: -30, rays: 0, theme: "#161E36" },
  };
  const LEMON = ["#FFF3A6", "#F6D04D", "#D8A516"];
  const LEAF = "#6C9A4C";

  // Mått i SVG:ns koordinater (viewBox centrerad kring citronens slutläge)
  const HORIZON = 52, R = 50, LEMON_RX = 64, LEMON_RY = 49, N_RAYS = 12;

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Kroppen ritas som en polär kurva: en cirkel (solen) som glider över i en
  // ellips med två små spetsar i ändarna (citronen) när m går 0 → 1.
  function bodyPath(scale, m) {
    const a = lerp(R, LEMON_RX, m) * scale, b = lerp(R, LEMON_RY, m) * scale, tip = 8 * m;
    let d = "";
    for (let k = 0; k < 100; k++) {
      const th = (k / 100) * Math.PI * 2;
      const c = Math.cos(th), s = Math.sin(th);
      const re = (a * b) / Math.hypot(b * c, a * s);
      const d0 = Math.min(Math.abs(Math.atan2(s, c)), Math.abs(Math.atan2(-s, -c)));
      const r = re + tip * Math.exp(-((d0 / 0.17) ** 2));
      d += (k ? "L" : "M") + (r * c).toFixed(2) + " " + (r * s).toFixed(2);
    }
    return d + "Z";
  }

  // Bygger SVG-scenen inuti splash-elementet
  function build(stage, part) {
    const svg = el("svg", { viewBox: "-160 -175 320 290", class: "splash-svg", "aria-hidden": "true" }, stage);
    const defs = el("defs", {}, svg);

    const grad = el("radialGradient", { id: "spBody", cx: "38%", cy: "32%", r: "78%" }, defs);
    const stops = [0, 0.55, 1].map((o) => el("stop", { offset: o }, grad));
    const glowGrad = el("radialGradient", { id: "spGlow" }, defs);
    const glowStops = [el("stop", { offset: 0, "stop-opacity": 0.55 }, glowGrad), el("stop", { offset: 1, "stop-opacity": 0 }, glowGrad)];
    const shadowGrad = el("radialGradient", { id: "spShadow" }, defs);
    el("stop", { offset: 0, "stop-color": "#3B2A22", "stop-opacity": 0.32 }, shadowGrad);
    el("stop", { offset: 1, "stop-color": "#3B2A22", "stop-opacity": 0 }, shadowGrad);

    // Värmedallring: brus som förskjuter pixlarna lite i sidled
    const filter = el("filter", { id: "spHeat", x: "-40%", y: "-40%", width: "180%", height: "180%" }, defs);
    const turb = el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.01 0.07", numOctaves: 2, seed: 4, result: "n" }, filter);
    const disp = el("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: 0, xChannelSelector: "R", yChannelSelector: "G" }, filter);

    // Klipper bort det som är under havslinjen medan solen stiger
    const clip = el("clipPath", { id: "spClip" }, defs);
    const clipRect = el("rect", { x: -200, y: -260, width: 400, height: 260 + HORIZON }, clip);

    const shadow = el("ellipse", { cx: 0, cy: LEMON_RY + 8, rx: 58, ry: 8, fill: "url(#spShadow)", opacity: 0 }, svg);

    // Havet: linjen och små glittrande streck under den
    const sea = el("g", {}, svg);
    const seaLine = el("line", { x1: -150, x2: 150, y1: HORIZON, y2: HORIZON, "stroke-width": 2, "stroke-linecap": "round" }, sea);
    const glitter = [[-26, 10, 30], [8, 10, 22], [-10, 19, 20], [14, 27, 12], [-34, 28, 10]].map(([x, dy, w]) =>
      el("line", { x1: x, x2: x + w, y1: HORIZON + dy, y2: HORIZON + dy, "stroke-width": 2.4, "stroke-linecap": "round" }, sea));

    const clipped = el("g", { "clip-path": "url(#spClip)" }, svg);
    const heatG = el("g", {}, clipped);
    const glow = el("circle", { r: R * 2.3, fill: "url(#spGlow)" }, heatG);
    const lemon = el("g", {}, heatG);
    const rays = [];
    for (let i = 0; i < N_RAYS; i++) rays.push(el("line", { "stroke-linecap": "round" }, lemon));
    const body = el("path", { fill: "url(#spBody)", "stroke-width": 1.8 }, lemon);

    // Månens kratrar (bara natt) och citronskalets porer
    const craters = part === "night"
      ? [[-18, -12, 9], [14, 8, 11], [20, -20, 5], [-8, 22, 6], [-28, 8, 4]].map(([x, y, r]) =>
          el("circle", { cx: x, cy: y, r, fill: "#CDBFA3" }, lemon))
      : [];
    const pores = el("g", { fill: "#C9961A", opacity: 0 }, lemon);
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 70; i++) {
      const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * 0.86;
      el("circle", { cx: (Math.cos(ang) * rr * LEMON_RX).toFixed(1), cy: (Math.sin(ang) * rr * LEMON_RY).toFixed(1), r: (0.7 + rnd() * 0.8).toFixed(2) }, pores);
    }
    const shine = el("ellipse", { cx: -22, cy: -20, rx: 16, ry: 7, fill: "#fff", opacity: 0, transform: "rotate(-28 -22 -20)" }, lemon);
    const shine2 = el("circle", { cx: -36, cy: -6, r: 2.6, fill: "#fff", opacity: 0 }, lemon);

    // Två blad och en liten stjälk på toppen, ritade med fästpunkten i (0,0)
    const leaves = el("g", {}, lemon);
    el("path", { d: "M0 0c2-7 1-11-1-13", stroke: "#5A7F3E", "stroke-width": 2.4, fill: "none", "stroke-linecap": "round" }, leaves);
    el("path", { d: "M0-6C5-17 17-23 31-21 26-10 14-4 0-6z", fill: LEAF }, leaves);
    el("path", { d: "M2-7C11-12 19-16 28-19", stroke: "#5A7F3E", "stroke-width": 1.1, fill: "none", opacity: 0.7 }, leaves);
    el("path", { d: "M-1-7C-6-15-14-19-23-17-19-9-10-6-1-7z", fill: "#7DAB5A" }, leaves);

    return { svg, stops, glowStops, turb, disp, clipRect, shadow, sea, seaLine, glitter, heatG, glow, lemon, rays, body, craters, pores, shine, shine2, leaves };
  }

  let current = null;

  function start(opts = {}) {
    const splash = opts.el || document.getElementById("splash");
    if (!splash) return;
    if (current) current.stop();

    const part = opts.part || splash.dataset.part || "day";
    splash.dataset.part = part;
    splash.classList.remove("splash-out");
    splash.innerHTML = "";
    const look = LOOK[part];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || opts.reduce;
    if (reduce) splash.classList.add("splash-still"); else splash.classList.remove("splash-still");

    // Temafärgen i webbläsarens statusfält följer splashen medan den syns
    const themeMeta = document.getElementById("themeColor");
    const prevTheme = themeMeta?.getAttribute("content");
    themeMeta?.setAttribute("content", look.theme);

    const stage = document.createElement("div");
    stage.className = "splash-stage";
    splash.appendChild(stage);
    const S = build(stage, part);

    const titleWrap = document.createElement("div");
    titleWrap.className = "splash-titles";
    titleWrap.innerHTML = `<p class="splash-title"></p><p class="splash-sub"></p>`;
    titleWrap.children[0].textContent = opts.title || "Spanien";
    titleWrap.children[1].textContent = opts.sub || "Costa del Sol";
    splash.appendChild(titleWrap);

    const K = parseFloat(getComputedStyle(splash).getPropertyValue("--splash-k")) || 1;
    const t0 = performance.now();
    let rot = 0, last = t0, raf = 0, done = false, hideTimer = 0;
    const doneFns = [];

    function frame(now) {
      // tidslinjen i ms vid tempo 1 (opts.at fryser en viss tidpunkt, för skärmbilder)
      const t = opts.at != null ? opts.at : reduce ? 9999 : (now - t0) / K;
      const dt = Math.min(64, now - last) / K;
      last = now;

      // 1. Solen stiger och strålarna börjar rotera
      const rise = easeOutCubic(seg(t, 0, 1000));
      const swell = easeInOut(seg(t, 850, 1400)) * (1 - easeInOut(seg(t, 1450, 1900)));
      const m = easeInOut(seg(t, 1400, 2100));            // 3. förvandlingen
      const raySpeed = lerp(22, 170, swell) * (1 - m);    // grader per sekund
      rot += (raySpeed * dt) / 1000;

      // 4. Studsen: hopp, landning med ihoptryckning, och gung som dör ut
      const hopT = seg(t, 2230, 2650);
      const hop = 38 * Math.sin(Math.PI * hopT);
      const crouch = Math.sin(Math.PI * seg(t, 2120, 2240)) * 0.08;
      const land = Math.sin(Math.PI * seg(t, 2650, 2800)) * 0.11;
      const squash = crouch + land - 0.05 * Math.sin(Math.PI * hopT);
      const wt = seg(t, 2650, 3600);
      const wobble = wt > 0 ? 9 * Math.exp(-4.2 * wt) * Math.sin(wt * 17) : 0;

      const scale = 1 + 0.08 * swell + 0.012 * Math.sin(t / 160) * swell;
      const sunY = lerp(HORIZON + R + 14, look.restY, rise);
      const cy = lerp(sunY, 0, m) - hop;
      const curRy = lerp(R, LEMON_RY, m) * scale;

      const sx = 1 + squash, sy = 1 - squash;
      S.lemon.setAttribute("transform",
        `translate(0 ${(cy + curRy).toFixed(2)}) rotate(${wobble.toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(0 ${(-curRy).toFixed(2)})`);
      S.glow.setAttribute("cy", cy.toFixed(2));
      S.glow.setAttribute("opacity", (rise * (0.8 + 0.35 * swell) * (1 - m)).toFixed(3));
      // Klippet öppnas när förvandlingen börjar så citronen kan lämna havet
      S.clipRect.setAttribute("height", 260 + HORIZON + 300 * seg(t, 1400, 1800));

      // Färger: sol/måne → citron
      const bc = [0, 1, 2].map((i) => mix(look.body[i], LEMON[i], m));
      S.stops.forEach((s, i) => s.setAttribute("stop-color", bc[i]));
      S.glowStops.forEach((s) => s.setAttribute("stop-color", look.glow));
      S.body.setAttribute("d", bodyPath(scale, m));
      S.body.setAttribute("stroke", LEMON[2]);
      S.body.setAttribute("stroke-opacity", (0.25 + 0.75 * m).toFixed(3));

      // Strålarna: roterar, och fälls sedan in mot toppen där bladen växer fram
      const top = { x: 0, y: -curRy - 2 };
      const fold = easeInOut(seg(m, 0, 0.8));
      const rayIn = easeOutBack(seg(t, 250, 950));
      const rayLen = (15 + 6 * swell) * rayIn;
      const r1 = R * scale + 10;
      const rayCol = mix(look.ray, LEAF, seg(m, 0.2, 0.8));
      S.rays.forEach((ray, i) => {
        const a = ((rot + i * (360 / N_RAYS)) * Math.PI) / 180;
        const c = Math.cos(a), s = Math.sin(a);
        const x1 = lerp(c * r1, top.x, fold), y1 = lerp(s * r1, top.y, fold);
        const x2 = lerp(c * (r1 + rayLen), top.x, fold), y2 = lerp(s * (r1 + rayLen), top.y, fold);
        ray.setAttribute("x1", x1.toFixed(2)); ray.setAttribute("y1", y1.toFixed(2));
        ray.setAttribute("x2", x2.toFixed(2)); ray.setAttribute("y2", y2.toFixed(2));
        ray.setAttribute("stroke", rayCol);
        ray.setAttribute("stroke-width", lerp(6.5, 2.5, fold).toFixed(2));
        ray.setAttribute("opacity", (look.rays * rayIn * (1 - seg(m, 0.6, 0.85))).toFixed(3));
      });

      const leafS = easeOutBack(seg(m, 0.45, 1));
      S.leaves.setAttribute("transform", `translate(${top.x} ${(top.y + 3).toFixed(2)}) scale(${leafS.toFixed(3)})`);
      S.leaves.setAttribute("opacity", seg(m, 0.45, 0.6).toFixed(3));
      S.craters.forEach((c) => c.setAttribute("opacity", (0.55 * (1 - seg(m, 0, 0.5))).toFixed(3)));
      S.pores.setAttribute("opacity", (0.4 * seg(m, 0.55, 1)).toFixed(3));
      S.shine.setAttribute("opacity", (0.6 * seg(m, 0.5, 1)).toFixed(3));
      S.shine2.setAttribute("opacity", (0.7 * seg(m, 0.7, 1)).toFixed(3));

      // Havet tonar bort och blir "terrassgolvet" där skuggan ligger
      const seaO = 1 - seg(t, 1500, 2100);
      S.seaLine.setAttribute("stroke", look.sea);
      S.seaLine.setAttribute("opacity", (0.75 * seaO * seg(t, 0, 300)).toFixed(3));
      S.glitter.forEach((g, i) => {
        g.setAttribute("stroke", part === "night" ? "#F1E6CF" : look.ray);
        g.setAttribute("opacity", (rise * seaO * (0.35 + 0.3 * Math.sin(t / 220 + i * 1.7))).toFixed(3));
      });
      const hRatio = hop / 38;
      S.shadow.setAttribute("opacity", (m * (1 - 0.55 * hRatio)).toFixed(3));
      S.shadow.setAttribute("rx", (58 * (1 - 0.3 * hRatio) * (1 + squash)).toFixed(2));

      // 2. Värmedallring: växer med hettan, försvinner innan citronen bildas
      const heat = reduce ? 0 : (2.2 + 5 * swell) * rise * (1 - seg(t, 1350, 1700));
      if (heat > 0.05) {
        S.heatG.setAttribute("filter", "url(#spHeat)");
        S.disp.setAttribute("scale", heat.toFixed(2));
        S.turb.setAttribute("baseFrequency", `0.012 ${(0.06 + 0.012 * Math.sin(t / 130)).toFixed(4)}`);
      } else S.heatG.removeAttribute("filter");

      if (!reduce && !done && opts.at == null) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // 5. Uttoning (CSS-övergång i style.css) och städning
    function hide() {
      if (done) return;
      done = true;
      clearTimeout(hideTimer);
      splash.classList.add("splash-out");
      const finish = () => {
        cancelAnimationFrame(raf);
        if (prevTheme && opts.restoreTheme !== false) themeMeta?.setAttribute("content", prevTheme);
        if (opts.onDone) opts.onDone();
        doneFns.splice(0).forEach((fn) => fn());
      };
      const dur = parseFloat(getComputedStyle(splash).transitionDuration) * 1000 || 0;
      setTimeout(finish, dur + 30);
    }
    if (opts.at == null) hideTimer = setTimeout(hide, (reduce ? 1400 : 3000) * K);
    splash.onclick = hide;   // ett tryck var som helst hoppar över

    current = {
      hide,
      stop() {
        done = true; clearTimeout(hideTimer); cancelAnimationFrame(raf);
        if (prevTheme) themeMeta?.setAttribute("content", prevTheme);
      },
      onDone(fn) { doneFns.push(fn); },
    };
    return current;
  }

  window.SunSplash = { start, daypartFor, sunTimes, LOOK };
})();
