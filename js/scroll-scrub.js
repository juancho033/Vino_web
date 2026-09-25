/* ============================================================
   SCROLL-SCRUB — reproduction de video gobernada por el scroll
   ═══════════════════════════════════════════════════════════
   Mapear el progreso del scroll sobre video.currentTime es la
   parte fácil. Lo difícil, y lo que separa esto de un efecto
   casero, son tres cosas:

   1. ANTI-THRASH. Cada scroll dispara decenas de eventos por
      segundo. Asignar currentTime en cada uno hace que el
      decodificador se maree y el video tiemble. Aqui se
      escribe UNA vez por frame de animacion, y solo si el
      salto supera medio frame de video. Ese medio frame es
      toda la diferencia.

   2. EL SENTIDO DE LA DIRECCIÓN. currentTime es bidireccional
      de serie: subir el scroll rebobina, sin código extra. Pero
      rebobinar es tan rápido como el seek, y el seek es tan
      rápido como el búfer. Por eso el motor no habilita el
      scrub hasta que el video tiene futuro downloading
      (readyState >= 3). Antes de eso, un estado de carga.

   3. CERRAR LA PUERTA CUANDO NO TOCA. Con rAF corriendo y
      seeking activo, una laptop en reposo se calienta y una
      bateria se come. IntersectionObserver detiene el bucle
      fuera de pantalla sin tirar el búfer, así que al volver
      el scrub reanuda instantáneo.
   ═══════════════════════════════════════════════════════════ */

(function (window, document) {
  "use strict";

  var VN = (window.VN = window.VN || {});

  var FRAME_GUARD = 1 / 60;
  var MOBILE_QUERY = "(max-width: 47.99rem)";
  var REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function clock(seconds) {
    var safe = isFinite(seconds) && seconds > 0 ? seconds : 0;
    var minutes = Math.floor(safe / 60);
    var rest = Math.floor(safe % 60);
    return minutes + ":" + (rest < 10 ? "0" : "") + rest;
  }

  function Scrub(el) {
    this.el = el;
    this.video = el.querySelector(".scrub__video");
    if (!this.video) return;

    this.stage = el.querySelector(".scrub__stage");
    this.timeOut = el.querySelector("[data-scrub-time]");
    this.durationOut = el.querySelector("[data-scrub-duration]");
    this.toggleBtn = el.querySelector("[data-scrub-toggle]");

    this.duration = 0;
    this.progress = 0;
    this.target = 0;
    this.lastSeek = -1;
    this.clockText = "";
    this.durationText = "";
    this.range = 1;
    this.top = 0;
    this.raf = 0;
    this.active = false;
    this.ready = false;

    this.reduced = window.matchMedia(REDUCED_QUERY);
    this.compact = window.matchMedia(MOBILE_QUERY);

    this.tick = this.tick.bind(this);

    this.start();
  }

  Scrub.prototype.start = function () {
    var self = this;

    this.el.setAttribute("data-state", "loading");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = "metadata";
    this.video.setAttribute("aria-hidden", "true");
    this.video.src = this.el.getAttribute("data-scrub-src");

    this.video.addEventListener("loadedmetadata", function () {
      self.duration = self.video.duration;
      self.durationText = clock(self.duration);
      if (self.durationOut) self.durationOut.textContent = self.durationText;
      self.measure();
    });

    this.video.addEventListener("canplaythrough", function () {
      self.activate();
    });

    this.video.addEventListener("error", function () {
      self.el.setAttribute("data-state", "error");
    });

    if (this.shouldFallBack()) {
      this.enterLoopMode();
    } else {
      this.enterScrubMode();
    }

    this.reduced.addEventListener("change", function () {
      if (self.shouldFallBack()) self.enterLoopMode();
      else self.enterScrubMode();
    });

    this.compact.addEventListener("change", function () {
      if (self.shouldFallBack()) self.enterLoopMode();
      else self.enterScrubMode();
    });

    window.addEventListener(
      "scroll",
      function () {
        self.onScroll();
      },
      { passive: true }
    );

    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        self.measure();
        self.onScroll();
      }, 150);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) self.stop();
      else self.onScroll();
    });

    this.observer = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) self.onScroll();
          else self.stop();
        }
      },
      { rootMargin: "20% 0px" }
    );
    this.observer.observe(this.el);

    this.measure();
    this.onScroll();
  };

  Scrub.prototype.shouldFallBack = function () {
    return this.reduced.matches || this.compact.matches;
  };

  Scrub.prototype.measure = function () {
    var box = this.el.getBoundingClientRect();
    this.top = box.top + window.pageYOffset;
    this.range = Math.max(1, this.el.offsetHeight - this.stage.offsetHeight);
  };

  Scrub.prototype.onScroll = function () {
    if (this.el.getAttribute("data-mode") !== "loop") {
      this.progress = clamp(
        (window.pageYOffset - this.top) / this.range,
        0,
        1
      );
      this.schedule();
    }
  };

  Scrub.prototype.schedule = function () {
    if (!this.raf && this.active) this.raf = requestAnimationFrame(this.tick);
  };

  Scrub.prototype.stop = function () {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  };

  Scrub.prototype.tick = function () {
    this.raf = 0;
    if (!this.active) return;

    var target = this.progress * this.duration;

    if (Math.abs(target - this.lastSeek) > FRAME_GUARD) {
      var ceiling = this.duration - 0.03;
      this.video.currentTime = target < ceiling ? target : Math.max(0, ceiling);
      this.lastSeek = target;
    }

    this.el.style.setProperty("--progress", this.progress.toFixed(4));

    if (this.timeOut) {
      var next = clock(target);
      if (next !== this.clockText) {
        this.clockText = next;
        this.timeOut.textContent = next;
      }
    }

    this.raf = requestAnimationFrame(this.tick);
  };

  Scrub.prototype.activate = function () {
    if (this.ready || this.el.getAttribute("data-mode") === "loop") return;
    this.ready = true;
    this.el.setAttribute("data-state", "ready");
    this.video.preload = "auto";
    this.onScroll();
  };

  Scrub.prototype.enterScrubMode = function () {
    this.stop();
    this.active = true;
    this.el.setAttribute("data-mode", "scrub");
    this.el.setAttribute("data-state", "loading");

    if (this.toggleBtn) this.toggleBtn.hidden = true;
    this.video.loop = false;
    this.video.pause();

    if (this.ready) {
      this.el.setAttribute("data-state", "ready");
    } else {
      this.onScroll();
    }
  };

  Scrub.prototype.enterLoopMode = function () {
    var self = this;

    this.stop();
    this.active = false;
    this.ready = false;
    this.el.setAttribute("data-mode", "loop");
    this.el.setAttribute("data-state", "ready");
    this.el.style.setProperty("--progress", "0");
    this.video.loop = true;
    this.video.playsInline = true;

    if (this.toggleBtn) {
      this.toggleBtn.hidden = false;
      this.toggleBtn.textContent = "Reproducir";
      this.toggleBtn.setAttribute("aria-pressed", "false");
      this.toggleBtn.addEventListener("click", function () {
        if (self.video.paused) {
          self.video.play();
          self.toggleBtn.textContent = "Pausar";
          self.toggleBtn.setAttribute("aria-pressed", "true");
        } else {
          self.video.pause();
          self.toggleBtn.textContent = "Reproducir";
          self.toggleBtn.setAttribute("aria-pressed", "false");
        }
      });
    }

    if (!this.reduced.matches) {
      var attempt = this.video.play();
      if (attempt && typeof attempt.catch === "function") {
        attempt.catch(function () {});
      }
    }
  };

  function init() {
    var nodes = document.querySelectorAll("[data-scrub]");
    for (var i = 0; i < nodes.length; i++) {
      VN.scrubs = VN.scrubs || [];
      VN.scrubs.push(new Scrub(nodes[i]));
    }
  }

  VN.initScrollScrub = init;
})(window, document);
