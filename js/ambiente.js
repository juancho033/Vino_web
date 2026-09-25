/* ============================================================
   AMBIENTE — el loop decorativo de "la finca"
   ═══════════════════════════════════════════════════════════
   Un <video> en loop no necesita el motor de scroll-scrub: no
   hay seek, hay reproduccion. Pero necesita tres guardingas
   que si se olvidan se notan mucho:

     1. `prefers-reduced-motion`: un loop de 5 segundos en loop es
        movimiento infinito. Con movimiento reducido el video no
        arranca nunca y se queda en el poster.
     2. Fuera de pantalla: un video que se reproduce en una
        seccion que el usuario ya dejo sigue quemando CPU. Se
        pausa con el IntersectionObserver, no con scroll.
     3. `saveData` y datos moviles: un loop de 1,1 MB encima
        de los dos scrubs son 10 MB de video en una pagina de
        texto. Con `saveData` se respeta el poster.
   ═══════════════════════════════════════════════════════════ */

(function (window, document) {
  "use strict";

  var VN = (window.VN = window.VN || {});
  var REDUCED = "(prefers-reduced-motion: reduce)";
  var SAVE_DATA = "(prefers-reduced-data: reduce)";

  function initAmbiente() {
    var videos = document.querySelectorAll("[data-ambiente]");
    if (!videos.length) return;

    var reduced = window.matchMedia(REDUCED);
    var saveData = window.matchMedia(SAVE_DATA);

    for (var i = 0; i < videos.length; i++) setup(videos[i], reduced, saveData);

    /* Si el usuario cambia la preferencia a mitad de la pagina,
       hay que obedecer en caliente: video arrancado que se
       congela de golpe, o poster que se queda con un video ya
       descargado. */
    function onReducedChange(e) {
      for (var j = 0; j < videos.length; j++) {
        var v = videos[j];
        if (e.matches) v.pause();
        else if (isVisible(v)) play(v);
      }
    }

    if (typeof reduced.addEventListener === "function") {
      reduced.addEventListener("change", onReducedChange);
    }

    function isVisible(el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    }

    function play(el) {
      var attempt = el.play();
      /* El navegador rechaza autoplay sin gesto si la politica
         lo prohibe. Es esperado, no un error: el poster se queda
         y el clip no se mueve. No hay nada que reintentar. */
      if (attempt && typeof attempt.catch === "function") attempt.catch(function () {});
    }

    function setup(video) {
      /* `preload="none"` en el HTML: hasta que el navegador sabe
         que va a reproducir, no descarga ni un byte. Por eso aqui
         NO hay un `load()` ni un `requestIdleCallback` que lo
         anticipe: descargar un clip de 1,1 MB que el usuario puede
         que nunca mire es justo lo que `preload="none"` evita.

         Tampoco se desconecta el observer tras el primer play:
         desconectarlo mataba la pausa por visibilidad, que es la
         mitad del motivo de existir de este modulo. */
      if (reduced.matches || saveData.matches) return;

      var observer = new IntersectionObserver(
        function (entries) {
          for (var k = 0; k < entries.length; k++) {
            if (entries[k].isIntersecting) play(video);
            else video.pause();
          }
        },
        { threshold: 0.15 }
      );
      observer.observe(video);
    }
  }

  VN.initAmbiente = initAmbiente;
})(window, document);
