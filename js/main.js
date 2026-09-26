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

    /* Se observan TODOS los `[data-theme]`, no solo los de `main`:
       el pie de pagina esta fuera de `main` y es oscuro. Con
       `main [data-theme]` la cabecera se quedaba en el tema
       claro de los importadores mientras la recortaba el pie
       negro, con el menu en crema sobre casi negro.

       El propio header se excluye: si se observara a si mismo,
       su `data-theme` se realimentaria sin cambiar nunca. */
    var secciones = document.querySelectorAll("[data-theme]:not([data-header])");
    var ultima = secciones.length ? secciones[secciones.length - 1] : null;

    /* El observer usa una banda de 2px pegada al borde superior,
       para que el tema cambie cuando la seccion llega AL TOP y
       no en cuanto asoma un pixel. Esa banda solo la cruzan las
       secciones mas altas que la ventana. El pie es mas bajo que
       la pantalla, asi que al final del documento queda SIEMPRE
       en la parte de abajo y nunca entra en la banda: la cabecera
       conservaba el tema claro de los importadores sobre el pie
       negro. Al pegarse al final se aplica el tema de la ultima
       seccion a mano, y al despegar manda de nuevo el observer. */
    function alFinal() {
      var doc = document.documentElement;
      var fondo = doc.scrollHeight - window.innerHeight;
      return fondo <= 2 || window.pageYOffset >= fondo - 2;
    }

    if (secciones.length) {
      var band = new IntersectionObserver(
        function (entries) {
          /* Al final del documento manda la regla de `alFinal`:
             si no, el observer puede reponer el tema de una
             seccion alta en una pagina corta. */
          if (alFinal()) return;
          for (var e = 0; e < entries.length; e++) {
            if (!entries[e].isIntersecting) continue;
            var t = entries[e].target.getAttribute("data-theme");
            if (t) header.setAttribute("data-theme", t);
          }
        },
        { rootMargin: "0px 0px -" + (window.innerHeight - 2) + "px 0px" }
      );
      for (var i = 0; i < secciones.length; i++) band.observe(secciones[i]);
    }

    /* `scrolled` guarda a la vez el estado del fondo y el del
       final, porque los dos los decide el mismo evento: si solo
       guardara el booleano de scroll, pasar por el final sin
       mover el scroll no reevaluaria el tema. */
    var previo = null;
    var onScroll = function () {
      var final = alFinal();
      var estado = (window.pageYOffset > 24 ? "1" : "0") + (final ? "f" : "");
      if (estado === previo) return;
      previo = estado;

      if (window.pageYOffset > 24) header.setAttribute("data-scrolled", "");
      else header.removeAttribute("data-scrolled");

      if (final && ultima) header.setAttribute("data-theme", ultima.getAttribute("data-theme"));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    /* El final del documento depende de la altura de la ventana:
       al redimensionar cambia, y sin esto la cabecera se queda con
       un tema que ya no corresponde. */
    window.addEventListener("resize", onScroll, { passive: true });
    onScroll();
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
