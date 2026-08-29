/* ============================================================
   Autopay — luxury motion layer
   Ambient particles · cursor glow · scroll reveal · 3D tilt ·
   chart-bar growth · number count-up · preloader
   All effects respect prefers-reduced-motion and degrade
   gracefully where an API is unavailable (e.g. jsdom/older UA).
   ============================================================ */
(function () {
  "use strict";

  var reduceMotion = typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var hasIO = "IntersectionObserver" in window;

  /* ---------------- preloader ---------------- */
  function hideLoader() {
    var l = document.getElementById("loader");
    if (!l) return;
    l.classList.add("done");
    setTimeout(function () { l.remove(); }, 700);
  }
  function scheduleLoaderHide() {
    if (document.readyState === "complete") {
      setTimeout(hideLoader, 350);
    } else {
      window.addEventListener("load", function () { setTimeout(hideLoader, 350); });
      setTimeout(hideLoader, 4000); // safety net (e.g. blocked CDN fonts)
    }
  }

  /* ---------------- cursor glow ---------------- */
  function initCursorGlow() {
    if (reduceMotion || !finePointer) return;
    var glow = document.querySelector(".cursor-glow");
    if (!glow) return;
    var raf = null;
    window.addEventListener("mousemove", function (e) {
      document.body.classList.add("glow-on");
      if (raf) return;
      raf = requestAnimationFrame(function () {
        glow.style.left = e.clientX + "px";
        glow.style.top = e.clientY + "px";
        raf = null;
      });
    }, { passive: true });
    document.addEventListener("mouseleave", function () {
      document.body.classList.remove("glow-on");
    });
  }

  /* ---------------- ambient particles ---------------- */
  function initParticles() {
    if (reduceMotion) return;
    var canvas = document.getElementById("particles");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return; // e.g. jsdom without canvas

    var DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    var W = 0, H = 0, parts = [];
    var glyphs = ["৳", "৳", "✦", "·"];
    var TAU = Math.PI * 2;

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      var count = Math.min(34, Math.floor(W / 40));
      parts = [];
      for (var i = 0; i < count; i++) {
        parts.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vy: 0.15 + Math.random() * 0.5,
          size: 9 + Math.random() * 15,
          glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
          alpha: 0.08 + Math.random() * 0.3,
          sway: Math.random() * TAU
        });
      }
    }

    function tick() {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.y -= p.vy;
        p.sway += 0.01;
        if (p.y < -30) { p.y = H + 30; p.x = Math.random() * W; }
        var x = p.x + Math.sin(p.sway) * 18;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.glyph === "৳" ? "#e7c26b" : "#8fa3c0";
        ctx.font = p.size + "px 'Hind Siliguri', serif";
        ctx.fillText(p.glyph, x, p.y);
      }
      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(tick);
    }

    var rafId = requestAnimationFrame(tick);
    var running = true;
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && running) { cancelAnimationFrame(rafId); running = false; }
      else if (!document.hidden && !running) { rafId = requestAnimationFrame(tick); running = true; }
    });
    window.addEventListener("resize", resize);
    resize();
  }

  /* ---------------- scroll reveal ---------------- */
  var REVEAL_SELECTOR = [
    ".hero-inner > div", ".section-head", ".feature", ".how-step", ".price-card",
    ".stat", ".card", ".checkout-card", ".method-pill", ".cta-band"
  ].join(",");

  var io = null;
  function revealNow(el) {
    el.classList.add("revealed");
    // Clear the stagger delay shortly after the entrance so later
    // hover transitions (e.g. on .stat) respond instantly.
    setTimeout(function () { el.style.setProperty("--d", "0s"); }, 1200);
  }
  function tagRevealables(root) {
    var els = Array.prototype.slice.call((root || document).querySelectorAll(REVEAL_SELECTOR));
    els.forEach(function (el) {
      if (el.classList.contains("reveal-item")) return;
      el.classList.add("reveal-item");
      var siblings = el.parentElement ? el.parentElement.children : [];
      var idx = Array.prototype.indexOf.call(siblings, el);
      el.style.setProperty("--d", Math.min(Math.max(idx, 0), 8) * 0.06 + "s");
      if (io) io.observe(el);
      else revealNow(el);
    });
  }

  function initReveal() {
    if (reduceMotion) return;
    if (hasIO) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { revealNow(en.target); io.unobserve(en.target); }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    }
  }

  /* ---------------- 3D tilt ---------------- */
  function attachTilt(el) {
    if (reduceMotion || !finePointer || el.dataset.fxTilt) return;
    el.dataset.fxTilt = "1";
    el.classList.add("tilt");
    var shine = document.createElement("span");
    shine.className = "tilt-shine";
    el.appendChild(shine);
    var intensity = el.classList.contains("phone-mock") ? 9 : 5;
    el.addEventListener("mousemove", function (e) {
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width;
      var py = (e.clientY - r.top) / r.height;
      var rx = (0.5 - py) * intensity;
      var ry = (px - 0.5) * intensity;
      el.style.transform = "perspective(1000px) rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg)";
      el.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      el.style.setProperty("--my", (py * 100).toFixed(1) + "%");
    }, { passive: true });
    el.addEventListener("mouseleave", function () {
      el.style.transform = "";
    });
  }
  function tagTilts(root) {
    if (reduceMotion || !finePointer) return;
    [".stat", ".feature", ".price-card", ".how-step", ".checkout-card"]
      .forEach(function (sel) {
        Array.prototype.slice.call((root || document).querySelectorAll(sel)).forEach(attachTilt);
      });
  }

  /* ---------------- chart bars ---------------- */
  function animateBars(root) {
    if (reduceMotion) return;
    Array.prototype.slice.call((root || document).querySelectorAll(".chart .bar")).forEach(function (bar) {
      if (bar.dataset.fxBared) return;
      bar.dataset.fxBared = "1";
      var target = bar.style.height;
      bar.style.height = "3px";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { bar.style.height = target; });
      });
    });
  }

  /* ---------------- number count-up ---------------- */
  function countUp(el) {
    if (reduceMotion || el.dataset.fxCounted) return;
    el.dataset.fxCounted = "1";
    var raw = el.textContent || "";
    var m = raw.match(/^(.*?)(\d[\d,]*)(\.\d+)?(.*)$/);
    if (!m) return;
    var prefix = m[1], suffix = m[4] || "";
    var dec = m[3] || "";
    var end = parseFloat(m[2].replace(/,/g, "") + dec);
    if (isNaN(end) || end <= 0) return;
    var dur = 900, t0 = null;
    function frame(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = end * eased;
      el.textContent = prefix + val.toLocaleString("en-US", { maximumFractionDigits: 2 }) + suffix;
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function tagCountUps(root) {
    Array.prototype.slice.call((root || document).querySelectorAll(".stat .s-value, .checkout-brand .amount"))
      .forEach(countUp);
  }

  /* ---------------- orchestrate after each render ---------------- */
  function enhance(root) {
    tagRevealables(root);
    tagTilts(root);
    animateBars(root);
    tagCountUps(root);
  }

  function watch() {
    var app = document.getElementById("app");
    if (!app) return;
    var mo = new MutationObserver(function () { enhance(app); });
    mo.observe(app, { childList: true, subtree: true });
    enhance(app);
  }

  /* ---------------- boot ---------------- */
  initCursorGlow();
  initParticles();
  initReveal();
  scheduleLoaderHide();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watch);
  } else {
    watch();
  }
})();
