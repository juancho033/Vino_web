/* ============================================================
   SCROLL-SCRUB — reproducción de video gobernada por el scroll
   ═══════════════════════════════════════════════════════════
   Mapear scroll → video.currentTime es fácil. Lo que la hace
   fluida son cuatro cosas, y las cuatro están aquí.

   1. UN SOLO SEEK EN VUELO. Medido en la v1: el motor pedía
      3.00 seeks por cada frame realmente pintado. Cada seek
      cancelaba el decode en vuelo, así que el 66% del trabajo
      se tiraba a la basura y el video avanzaba a saltos. El
      arreglo no es "optimizar": es pedir un tiempo, ESPERAR a
      que requestVideoFrameCallback confirme que ese frame ya
      está en pantalla, y solo entonces pedir el siguiente.
      Objetivo medido: 1.00 seeks por frame pintado.

   2. SUAVIZAR LA ENTRADA, NO LA SALIDA. La rueda del ratón
      entrega deltas discretos y no uniformes. Feeding eso
      crudo a currentTime produce un video que da tirones. Se
      interpola el progreso hacia el objetivo con un factor
      dependiente del tiempo, más una zona muerta: un flick
      largo salta, un ajuste fino se afina.

   3. CUADRÍCULA DE FRAMES. currentTime acepta cualquier float,
      pero el decodificador solo tiene N frames. Pedir 12.3456
      cuando el frame empieza en 12.3333 es pedir un frame que
      no existe. Se mide el fps real en runtime con los deltas
      de mediaTime y se ajusta a la rejilla.

   4. ESPERA A QUE HAYA BÚFER COMPLETO. Rebobinar sobre un
      búfer parcial fuerza un flush a disco o red en cada seek,
      y eso es un stutter garantizado. El scrub no se habilita
      hasta canplaythrough (readyState 4).

   Además: el HUD no toca `height` ni `top`, solo `transform`.
   Animar esas propiedades fuerza layout en CADA frame; las
   medidas de rAF dieron 0 ticks > 20 ms, así que el hilo
   principal no es el cuello — pero no hay razón para pagarlo.
   ═══════════════════════════════════════════════════════════ */

(function (window, document) {
  "use strict";

  var VN = (window.VN = window.VN || {});

  var MOBILE_QUERY = "(max-width: 47.99rem)";
  var REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

  var SMOOTHING = 0.22;
  var SNAP_ZONE = 0.18;
  var EDGE_EASE = 0.4;
  var SEEK_TIMEOUT = 320;
  var FRAME_EPSILON = 1.5;

  /* Presupuesto mínimo entre seeks. El objetivo NO es maximizar los
     seeks por segundo: es que cada seek caiga en un frame nuevo.

     Los videos se re-codificaron con GOP 12 y sin pista de audio, así
     que cada seek cuesta ~6 frames en vez de ~38. Con GOP 3 s el
     techo medido eran 15 Hz; con GOP 12 el techo es el fps nativo.

     Sweep medido en ventana real, 2.6 s de scroll sobre 25 fps:

        20ms → 33.4 Hz  CV 0.43   ← supera los 25 fps nativos:
        24ms → 28.0 Hz  CV 0.28      repinta el mismo frame, y la
                                     cadencia se irregulariza
        28ms → 24.2 Hz  CV 0.20   ← óptimo
        32ms → 24.2 Hz  CV 0.22
        40ms → 21.5 Hz  CV 0.10   ← más regular, pero por debajo
                                     del fps nativo: pierde frames

     28 ms es el punto donde los seeks igualan el frame rate nativo:
     cada uno painta un frame distinto, al máximo ritmo sostenible.
     Sobrescribible por sección con data-scrub-budget. */
  var SEEK_BUDGET_MS = 28;

  /* El presupuesto de arriba está medido en una máquina con GPU de
     sobra, donde un seek se resuelve en ~5 ms. En un equipo donde el
     decodificador va justo, pedir 28 seeks por segundo solo sirve para
     encolar trabajo: cada seek espera al anterior, los frames llegan
     tarde y el video se ve a saltos en vez de suave.

     Por eso el presupuesto se realimenta con lo que el decodificador
     tarda de verdad en entregar cada frame, y se ensancha cuando ese
     coste se acerca al presupuesto. Un scrub mas burdo sigue siendo
     fluido — 30 s repartidos en 4.140 px dan un frame de video por cada
     3 px de scroll — y en cambio llega a tiempo. Es la unica palanca
     que sobrevive cuando el cuello no es este hilo. */
  var DECODE_HEADROOM = 2.5;
  var MAX_BUDGET_MS = 120;

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function clock(seconds) {
    var safe = isFinite(seconds) && seconds > 0 ? seconds : 0;
    var minutes = Math.floor(safe / 60);
    var rest = Math.floor(safe % 60);
    return minutes + ":" + (rest < 10 ? "0" : "") + rest;
  }

  function easeEdges(p, amount) {
    var smooth = p * p * (3 - 2 * p);
    return p + (smooth - p) * amount;
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
    this.targetProgress = 0;
    this.progress = 0;
    this.presented = 0;
    this.fps = parseFloat(el.getAttribute("data-scrub-fps")) || 30;
    this.budget = parseFloat(el.getAttribute("data-scrub-budget")) || SEEK_BUDGET_MS;
    this.decodeCost = 0;
    this.mediaTimes = [];
    this.seekInFlight = false;
    this.watchdog = 0;
    this.lastSeekAt = 0;
    this.pendingFrame = 0;
    this.raf = 0;
    this.lastFrame = 0;
    this.clockText = "";
    this.durationText = "";
    this.range = 1;
    this.top = 0;
    this.active = false;
    this.ready = false;
    this.visible = true;
    this.supported = typeof this.video.requestVideoFrameCallback === "function";

    this.reduced = window.matchMedia(REDUCED_QUERY);
    this.compact = window.matchMedia(MOBILE_QUERY);

    this.tick = this.tick.bind(this);
    this.onFrame = this.onFrame.bind(this);

    this.start();
  }

  Scrub.prototype.start = function () {
    var self = this;

    this.el.setAttribute("data-state", "loading");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = "auto";
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

    this.video.addEventListener("loadeddata", function () {
      self.watchPresentation();
    });

    if (this.shouldFallBack()) {
      this.enterLoopMode();
    } else {
      this.enterScrubMode();
    }

    var reevaluate = function () {
      if (self.shouldFallBack()) self.enterLoopMode();
      else self.enterScrubMode();
    };
    this.reduced.addEventListener("change", reevaluate);
    this.compact.addEventListener("change", reevaluate);

    window.addEventListener(
      "scroll",
      function () {
        self.onScroll();
      },
      { passive: true }
    );

    var resizeTimer = 0;
    var remeasure = function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        self.measure();
        self.onScroll();
      }, 120);
    };
    window.addEventListener("resize", remeasure);
    window.addEventListener("load", remeasure);
    window.addEventListener("orientationchange", remeasure);

    document.addEventListener("visibilitychange", function () {
      self.setVisible(!document.hidden);
    });

    this.observer = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          self.setVisible(entries[i].isIntersecting);
        }
      },
      { rootMargin: "25% 0px" }
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

  /* Un scrub fuera de pantalla no se avanza. El listener de scroll es
     global: sin este corte, cada scroll de la pagina arranco el rAF de
     TODOS los scrub y los empujaba hasta el final del video mientras el
     usuario ni los veia. Al volver, el hero tenia que rebobinar ~28 s
     frame a frame, que es la direccion mas cara para el decodificador y
     se ve como video a saltos. El IntersectionObserver ya sabe si la
     seccion esta en pantalla; aqui solo se le hace caso. */
  Scrub.prototype.onScroll = function () {
    if (this.el.getAttribute("data-mode") === "loop") return;
    if (!this.visible) {
      this.stop();
      return;
    }
    this.targetProgress = clamp(
      (window.pageYOffset - this.top) / this.range,
      0,
      1
    );
    this.startLoop();
  };

  Scrub.prototype.startLoop = function () {
    if (!this.raf && this.active) {
      this.lastFrame = 0;
      this.raf = requestAnimationFrame(this.tick);
    }
  };

  Scrub.prototype.stop = function () {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  };

  Scrub.prototype.targetTime = function () {
    return easeEdges(this.progress, EDGE_EASE) * this.duration;
  };

  Scrub.prototype.snap = function (time) {
    var frame = 1 / this.fps;
    return clamp(Math.round(time / frame) * frame, 0, Math.max(0, this.duration - frame));
  };

  Scrub.prototype.tick = function (now) {
    this.raf = requestAnimationFrame(this.tick);

    var dt = this.lastFrame ? now - this.lastFrame : 16.667;
    this.lastFrame = now;

    var gap = this.targetProgress - this.progress;

    if (Math.abs(gap) > SNAP_ZONE) {
      this.progress = this.targetProgress;
    } else if (gap !== 0) {
      var blend = 1 - Math.pow(1 - SMOOTHING, clamp(dt, 1, 50) / 16.667);
      this.progress += gap * blend;
    }

    this.el.style.setProperty("--progress", this.progress.toFixed(4));

    if (this.timeOut) {
      var next = clock(this.targetTime());
      if (next !== this.clockText) {
        this.clockText = next;
        this.timeOut.textContent = next;
      }
    }

    this.requestSeek();
  };

  /* El presupuesto real nunca baja del declarado, pero sube si el
     decodificador no da abasto. El tope evita que una pausa larga
     infle el valor para siempre. */
  Scrub.prototype.effectiveBudget = function () {
    var needed = this.decodeCost * DECODE_HEADROOM;
    return clamp(
      Math.max(this.budget, needed),
      this.budget,
      Math.max(this.budget, MAX_BUDGET_MS)
    );
  };

  Scrub.prototype.requestSeek = function () {
    if (this.seekInFlight || !this.duration) return;

    var now = performance.now();
    if (now - this.lastSeekAt < this.effectiveBudget()) return;

    var target = this.snap(this.targetTime());
    var frame = 1 / this.fps;

    if (Math.abs(target - this.presented) < frame * FRAME_EPSILON) return;

    this.lastSeekAt = now;
    this.seekInFlight = true;
    this.video.currentTime = target;
    this.armWatchdog();
  };

  Scrub.prototype.armWatchdog = function () {
    var self = this;
    window.clearTimeout(this.watchdog);
    /* con un presupuesto ya ensanchado, 320 ms dejan de ser "el decoder
       se ha colgado" y pasan a ser "el decoder va lento": el nudge
       (play + pause) solo debe firing cuando el frame no llega de
       ninguna manera, no cuando llega tarde */
    this.watchdog = window.setTimeout(function () {
      if (!self.seekInFlight) return;
      self.nudge();
    }, Math.max(SEEK_TIMEOUT, this.effectiveBudget() * 4));
  };

  Scrub.prototype.nudge = function () {
    var self = this;
    this.video.pause();
    var attempt = this.video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(function () {});
    }
    requestAnimationFrame(function () {
      self.video.pause();
    });
    this.release();
  };

  Scrub.prototype.release = function () {
    window.clearTimeout(this.watchdog);
    this.seekInFlight = false;
    if (this.supported && this.pendingFrame) {
      this.video.cancelVideoFrameCallback(this.pendingFrame);
      this.pendingFrame = 0;
    }
  };

  Scrub.prototype.onFrame = function (now, meta) {
    this.pendingFrame = 0;
    this.seekInFlight = false;
    window.clearTimeout(this.watchdog);

    /* lo que de verdad tardo el decodificador en servir este frame */
    var cost = now - this.lastSeekAt;
    if (cost > 0 && cost < 2000) {
      this.decodeCost = this.decodeCost
        ? this.decodeCost * 0.8 + cost * 0.2
        : cost;
    }

    this.presented = meta.mediaTime;
    this.sampleFps(meta.mediaTime);
    this.watchPresentation();
  };

  Scrub.prototype.watchPresentation = function () {
    if (!this.supported) return;
    if (this.el.getAttribute("data-mode") === "loop") return;
    if (this.pendingFrame) return;
    this.pendingFrame = this.video.requestVideoFrameCallback(this.onFrame);
  };

  Scrub.prototype.sampleFps = function (mediaTime) {
    this.mediaTimes.push(mediaTime);
    if (this.mediaTimes.length > 8) this.mediaTimes.shift();
    if (this.mediaTimes.length < 4) return;

    var deltas = [];
    for (var i = 1; i < this.mediaTimes.length; i++) {
      var d = this.mediaTimes[i] - this.mediaTimes[i - 1];
      if (d > 0.001) deltas.push(d);
    }
    if (!deltas.length) return;

    deltas.sort(function (a, b) { return a - b; });
    var median = deltas[Math.floor(deltas.length / 2)];
    var measured = 1 / median;
    if (measured > 5 && measured < 120) this.fps = measured;
  };

  Scrub.prototype.activate = function () {
    if (this.ready || this.el.getAttribute("data-mode") === "loop") return;
    this.ready = true;
    this.el.setAttribute("data-state", "ready");
    this.presented = this.video.currentTime;
    this.watchPresentation();
    this.onScroll();
  };

  Scrub.prototype.enterScrubMode = function () {
    this.stop();
    this.active = true;
    this.el.setAttribute("data-mode", "scrub");

    if (this.toggleBtn) this.toggleBtn.hidden = true;
    this.video.loop = false;
    this.video.pause();

    if (this.ready) {
      this.el.setAttribute("data-state", "ready");
      this.presented = this.video.currentTime;
      this.watchPresentation();
      this.onScroll();
    } else {
      this.el.setAttribute("data-state", "loading");
    }
  };

  Scrub.prototype.enterLoopMode = function () {
    var self = this;

    this.stop();
    this.release();
    this.active = false;
    this.ready = false;
    this.el.setAttribute("data-mode", "loop");
    this.el.setAttribute("data-state", "ready");
    this.el.style.setProperty("--progress", "0");
    this.video.loop = true;
    this.video.playsInline = true;

    if (this.toggleBtn && !this.toggleBtn.dataset.bound) {
      this.toggleBtn.dataset.bound = "1";
      this.toggleBtn.hidden = false;
      this.toggleBtn.addEventListener("click", function () {
        if (self.video.paused) {
          var attempt = self.video.play();
          if (attempt && typeof attempt.catch === "function") {
            attempt.catch(function () {});
          }
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

  /* Un scrub en modo loop reproduce solo, sin rAF, asi que
     `stop()` no lo detiene: el <video> sigue decodificando aunque
     la seccion este fuera de pantalla. Con dos scrubs en la misma
     pagina eso son dos videos reproduciendose a la vez, fuera de
     pantalla, quemando CPU y bateria.

     En modo scrub el video ya esta pausado y solo se mueve por
     seek, asi que aqui solo hace falta cubrir el caso loop. */
  Scrub.prototype.setVisible = function (visible) {
    this.visible = visible;
    if (this.el.getAttribute("data-mode") !== "loop") {
      if (visible) this.onScroll();
      else this.stop();
      return;
    }

    if (visible) {
      /* No reanudamos si el usuario pauso a mano: el boton
         guarda esa intencion en aria-pressed. */
      var usuarioPauso = this.toggleBtn && this.toggleBtn.getAttribute("aria-pressed") === "false";
      if (!this.reduced.matches && !usuarioPauso && this.video.paused) {
        var attempt = this.video.play();
        if (attempt && typeof attempt.catch === "function") attempt.catch(function () {});
      }
    } else if (!this.video.paused) {
      this.video.pause();
      if (this.toggleBtn) {
        this.toggleBtn.textContent = "Reproducir";
        this.toggleBtn.setAttribute("aria-pressed", "false");
      }
    }
  };

  function init() {
    var nodes = document.querySelectorAll("[data-scrub]");
    VN.scrubs = VN.scrubs || [];
    for (var i = 0; i < nodes.length; i++) {
      VN.scrubs.push(new Scrub(nodes[i]));
    }
  }

  VN.initScrollScrub = init;
})(window, document);
