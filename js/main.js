/* ============================================================
   MAIN — cabecera adaptable al fondo, entradas al viewport,
   arranque de los módulos.
   ============================================================ */

(function (window, document) {
  "use strict";

  var VN = (window.VN = window.VN || {});

  function headerTheme() {
    var header = document.querySelector("[data-header]");
    if (!header) return;

    var scrolled = 0;
    var onScroll = function () {
      var next = window.pageYOffset > 24 ? 1 : 0;
      if (next === scrolled) return;
      scrolled = next;
      if (next) header.setAttribute("data-scrolled", "");
      else header.removeAttribute("data-scrolled");
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    /* Se observan TODOS los `[data-theme]`, no solo los de `main`:
       el pie de pagina esta fuera de `main` y es oscuro. Con
       `main [data-theme]` la cabecera se quedaba en el tema
       claro de los importadores mientras la recortaba el pie
       negro, con el texto del menu en crema sobre casi negro.

       El propio header se excluye: si se observara a si mismo,
       su `data-theme` se realimentaria sin cambiar nunca. */
    var sections = document.querySelectorAll("[data-theme]:not([data-header])");
    if (!sections.length) return;

    var band = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            header.setAttribute(
              "data-theme",
              entries[i].target.getAttribute("data-theme")
            );
          }
        }
      },
      { rootMargin: "0px 0px -" + (window.innerHeight - 2) + "px 0px" }
    );

    for (var i = 0; i < sections.length; i++) band.observe(sections[i]);
  }

  function reveals() {
    var nodes = document.querySelectorAll(".reveal");
    if (!nodes.length) return;

    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      for (var i = 0; i < nodes.length; i++) nodes[i].classList.add("is-visible");
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        for (var e = 0; e < entries.length; e++) {
          if (!entries[e].isIntersecting) continue;
          entries[e].target.classList.add("is-visible");
          observer.unobserve(entries[e].target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );

    for (var n = 0; n < nodes.length; n++) observer.observe(nodes[n]);
  }

  function start() {
    if (typeof VN.initScrollScrub === "function") VN.initScrollScrub();
    if (typeof VN.initAmbiente === "function") VN.initAmbiente();
    if (typeof VN.initCatalogo === "function") VN.initCatalogo();
    headerTheme();
    reveals();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window, document);
