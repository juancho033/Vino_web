/* ============================================================
   CATALOGO — render de la carta y filtros por tipo y parcela
   ═══════════════════════════════════════════════════════════
   Filtrar es ocultar y mostrar, no reconstruir. Cada tarjeta se
   construye una vez; despues solo cambia `hidden` y el
   contador. El nodo no se toca, asi que la transicion de
   entrada no se reinicia y el foco no se pierde.

   Los filtros son botones con `aria-pressed`, NO tabs: esto
   filtra una lista, no cambia de panel. Un tab implicaria un
   `role="tablist"` y la obligacion de managear `aria-selected`,
   `tabindex` y el roving focus, que aqui no existe porque
   todas las pestañas siguen siendo alcanzables por Tab.

   Sin JS la lista se renderiza estatica desde el HTML y los
   filtros se ocultan: seis vinos visibles, mejor que cero.
   ═══════════════════════════════════════════════════════════ */

(function (window, document) {
  "use strict";

  var VN = (window.VN = window.VN || {});

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  /* --- Tarjeta ------------------------------------------------ */

  function buildCard(vino) {
    var card = el("li", "wine");

    /* Marco 4:5. El `img` va con loading=lazy y decoding=async:
       seis fotos de 1000px son ~600 kB que no hacen falta para
       el primer pintado. */
    var frame = el("div", "wine__frame");

    var img = document.createElement("img");
    img.className = "wine__img";
    img.alt = vino.nombre + " " + vino.ano + ", botella";
    img.loading = "lazy";
    img.decoding = "async";
    /* NO se oculta con `hidden` ni se pone `display: none` antes de
       asignar el src: un `loading="lazy"` que no esta en el flujo
       no se pide nunca, el evento `load` no llega y la foto se
       queda en 0x0 para siempre. El respaldo va encima en CSS y
       se aparta con `data-vacio` cuando la foto carga de verdad. */
    frame.setAttribute("data-vacio", "");
    img.addEventListener("load", function () {
      frame.removeAttribute("data-vacio");
    });
    img.src = vino.image;
    frame.appendChild(img);

    /* El respaldo vive siempre en el DOM, debajo de la foto.
       No se crea al vuelo: asi el cambio al cargar la imagen es
       un solo toggle de atributo, sin recalcular nada. */
    var fallback = el("div", "wine__fallback");
    fallback.setAttribute("aria-hidden", "true");
    var fbNombre = el("span", "wine__fallback-nombre", vino.nombre);
    var fbAno = el("span", "wine__fallback-ano", vino.ano);
    fallback.appendChild(fbNombre);
    fallback.appendChild(fbAno);
    frame.appendChild(fallback);

    card.appendChild(frame);

    /* Cabecera: tipo, nombre, añada. El nombre es un h3 porque
       la seccion tiene un h2. */
    var head = el("div", "wine__head");
    var tipo = el("span", "wine__tipo", (VN.TIPOS[vino.tipo] || {}).etiqueta);
    tipo.setAttribute("data-tipo", vino.tipo);
    var name = el("h3", "wine__name");
    name.appendChild(document.createTextNode(vino.nombre));
    var ano = el("span", "wine__ano", vino.ano);
    head.appendChild(tipo);
    head.appendChild(name);
    head.appendChild(ano);
    card.appendChild(head);

    /* Nota de cata: lo unico en la tarjeta que se lee entero. */
    card.appendChild(el("p", "wine__nota", vino.nota));

    /* Ficha tecnica. Un dl es lo que es: termino y definicion.
       El valor mas denso (alcohol) va primero para que el ojo
       lo encuentre antes de cansarse. */
    var dl = el("dl", "wine__specs");
    var specs = [
      ["Uva", vino.uva],
      ["Parcela", VN.parcelaNombre(vino.parcela) + ", " + vino.parcela.replace(/-/g, " ")],
      ["Alcohol", vino.alcohol],
      ["Azucar", vino.azucar],
      ["Origen", vino.origen]
    ];
    for (var i = 0; i < specs.length; i++) {
      var row = el("div", "wine__spec");
      var dt = el("dt", null, specs[i][0]);
      var dd = el("dd", null, specs[i][1]);
      row.appendChild(dt);
      row.appendChild(dd);
      dl.appendChild(row);
    }
    card.appendChild(dl);

    card.appendChild(el("p", "wine__facts", vino.facts));

    return card;
  }

  /* --- Filtros ------------------------------------------------ */

  /* Un solo grupo de filtros, con dos ejes (tipo y parcela).
     `data-facet` los separa en la UI pero el estado es el mismo
     objeto: son combinables. */
  function buildFilters() {
    var nav = el("div", "filtros");
    nav.setAttribute("role", "group");
    nav.setAttribute("aria-label", "Filtrar la carta");

    var facets = [
      { nombre: "Tipo", clave: "tipo", opciones: buildTipoOpciones() },
      { nombre: "Parcela", clave: "parcela", opciones: buildParcelaOpciones() }
    ];

    for (var f = 0; f < facets.length; f++) {
      var facet = facets[f];
      var row = el("div", "filtros__row");
      row.setAttribute("data-facet", facet.clave);

      var legend = el("span", "filtros__legend", facet.nombre);
      row.appendChild(legend);

      var list = el("ul", "filtros__list");
      var todas = el("button", "chip", "Todas");
      todas.type = "button";
      todas.setAttribute("aria-pressed", "true");
      todas.dataset.facet = facet.clave;
      todas.dataset.value = "*";
      var todasLi = el("li");
      todasLi.appendChild(todas);
      list.appendChild(todasLi);

      for (var o = 0; o < facet.opciones.length; o++) {
        var op = facet.opciones[o];
        var btn = el("button", "chip", op.etiqueta);
        btn.type = "button";
        btn.setAttribute("aria-pressed", "false");
        btn.dataset.facet = facet.clave;
        btn.dataset.value = op.valor;
        if (op.punto) btn.setAttribute("data-punto", op.punto);
        var li = el("li");
        li.appendChild(btn);
        list.appendChild(li);
      }

      row.appendChild(list);
      nav.appendChild(row);
    }

    return nav;
  }

  function buildTipoOpciones() {
    var out = [];
    var keys = Object.keys(VN.TIPOS);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      out.push({ valor: k, etiqueta: VN.TIPOS[k].etiqueta, punto: VN.TIPOS[k].punto });
    }
    return out;
  }

  function buildParcelaOpciones() {
    var out = [];
    for (var i = 0; i < VN.PARCELAS.length; i++) {
      out.push({
        valor: VN.PARCELAS[i].id,
        etiqueta: VN.PARCELAS[i].nombre,
        anno: VN.PARCELAS[i].anno
      });
    }
    return out;
  }

  /* --- Init --------------------------------------------------- */

  function init() {
    var root = document.querySelector("[data-catalogo]");
    if (!root || !VN.VINOS) return;

    var grid = root.querySelector("[data-catalogo-grid]");
    var count = root.querySelector("[data-catalogo-count]");
    var live = root.querySelector("[data-catalogo-live]");
    if (!grid) return;

    var estado = { tipo: "*", parcela: "*" };
    var tarjetas = [];

    /* La lista del HTML es un snapshot estatico de data.js, para el
       caso sin JS. Aqui se vacia y se reconstruye desde data.js,
       que es la unica fuente: asi lo que se ve con JS y lo que se
       ve sin JS es la misma carta, campo por campo.

       Si anades un vino a data.js, anadelo tambien al HTML: el
       snapshot sin JS no se genera solo. */
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    for (var i = 0; i < VN.VINOS.length; i++) {
      var card = buildCard(VN.VINOS[i]);
      grid.appendChild(card);
      tarjetas.push({ nodo: card, vino: VN.VINOS[i] });
    }

    var filters = buildFilters();
    var slot = root.querySelector("[data-catalogo-filters]");
    if (slot) {
      slot.appendChild(filters);
      /* El HTML llega con `hidden` porque sin JS no hay nada que
         filtrar. Aqui ya hay filtros de verdad, asi que el
         contenedor se muestra. */
      slot.hidden = false;
    }

    function pasa(vino) {
      return (
        (estado.tipo === "*" || vino.tipo === estado.tipo) &&
        (estado.parcela === "*" || vino.parcela === estado.parcela)
      );
    }

    function aplicar() {
      var visibles = 0;
      for (var i = 0; i < tarjetas.length; i++) {
        var coincide = pasa(tarjetas[i].vino);
        tarjetas[i].nodo.hidden = !coincide;
        if (coincide) visibles++;
      }

      if (count) {
        count.textContent =
          visibles === 1 ? "1 vino" : visibles + " vinos";
      }
      if (live) {
        live.textContent =
          visibles === 0
            ? "Ningun vino coincide con ese filtro."
            : visibles === 1
              ? "1 vino en la carta."
              : visibles + " vinos en la carta.";
      }
    }

    function setFacet(facet, value) {
      estado[facet] = value;
      var botones = filters.querySelectorAll('[data-facet="' + facet + '"]');
      for (var i = 0; i < botones.length; i++) {
        botones[i].setAttribute(
          "aria-pressed",
          botones[i].dataset.value === value ? "true" : "false"
        );
      }
      aplicar();
    }

    /* Delegacion: un solo listener para los N chips, en vez de
       uno por boton. Sobrevive a cualquier cambio futuro en los
       hijos. */
    filters.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-facet]");
      if (!btn || !filters.contains(btn)) return;
      setFacet(btn.dataset.facet, btn.dataset.value);
    });

    /* El estado vive en la URL para que un filtro sea
       enlazable y el boton Atras del navegador funcione. */
    function leerURL() {
      var params = new URLSearchParams(window.location.search);
      var t = params.get("tipo");
      var p = params.get("parcela");
      if (t) estado.tipo = t;
      if (p) estado.parcela = p;
    }

    function escribirURL() {
      var params = new URLSearchParams();
      if (estado.tipo !== "*") params.set("tipo", estado.tipo);
      if (estado.parcela !== "*") params.set("parcela", estado.parcela);
      var qs = params.toString();
      var url = window.location.pathname + (qs ? "?" + qs : "");
      /* replaceState, no pushState: filtrar no es navegar, y no
         queremos llenar la lista del boton Atras con cada chip
         que se toca. */
      window.history.replaceState(null, "", url);
    }

    leerURL();

    /* Sincroniza el estado inicial (que puede venir de la URL)
       con los aria-pressed de los chips. */
    (function syncChips() {
      var facets = ["tipo", "parcela"];
      for (var f = 0; f < facets.length; f++) {
        var botones = filters.querySelectorAll('[data-facet="' + facets[f] + '"]');
        for (var i = 0; i < botones.length; i++) {
          botones[i].setAttribute(
            "aria-pressed",
            botones[i].dataset.value === estado[facets[f]] ? "true" : "false"
          );
        }
      }
    })();

    /* Una sola pasada: si la URL traia un filtro, ya esta en
       `estado` y los chips ya reflejan eso. */
    aplicar();

    /* La URL se escribe al cambiar un chip, no en cada render:
       se registra aqui para no duplicar la escritura en el
       listener de los filtros. */
    filters.addEventListener("click", function () {
      escribirURL();
    });
  }

  VN.initCatalogo = init;
})(window, document);
