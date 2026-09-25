/* ============================================================
   DATA — la carta de vinos
   ═══════════════════════════════════════════════════════════
   Un solo lugar donde vive el catálogo. La UI nunca lleva
   datos dentro: se genera desde aquí.

   IMAGENES
   --------
   Cada vino trae `image` con la ruta de su foto, en
   `assets/wines/<slug>.webp`.

   Las fotos llegaron como `assets/img-1.jpg` … `img-6.jpg`, en
   vertical y con hasta 103 megapixeles (8308x12462). Convertidas
   a WebP a 1200px de ancho: de 12,9 MB a 420 KB en total, una
   reduccion del 97%. El ratio original va de 0.56 a 0.80 y el
   marco es 0.80, asi que van con `object-fit: cover` y recortan.

   El mapeo de foto a vino es POR ORDEN DE NOMBRE (img-1 es
   Graves, img-2 es Argile, …) porque las fotos no traian
   nombre de vino. Si esa correspondencia esta mal, se corrige
   cambiando la cadena `image` de un solo vino aqui.

   Si `image` apunta a un archivo que no existe, la tarjeta cae
   al marco de respaldo: noche, filete y el nombre en display.
   No se rompe, no hay un 404 visible, y cuando subas la foto
   aparece sin tocar CSS.

   Cero URLs remotas a proposito: una carta de vinos que depende
   de un CDN de terceros se rompe el dia que ese CDN cambia.
   ═══════════════════════════════════════════════════════════ */

(function (window) {
  "use strict";

  var VN = (window.VN = window.VN || {});

  /* Tipos: se usan para el filtro y para el color del punto.
     No son categorias de UI: son el atributo real del vino. */
  var TIPOS = {
    tinto: { etiqueta: "Tinto", punto: "--vino-700" },
    blanco: { etiqueta: "Blanco", punto: "--vino-300" },
    rosado: { etiqueta: "Rosado", punto: "--vino-400" }
  };

  /* Parcelas: los seis vinedos de la casa. El orden es el de
     maduración, no alfabético: una carta se lee de izquierda a
     derecha como una linea de tiempo. */
  var PARCELAS = [
    { id: "graves", nombre: "Graves", anno: "1958" },
    { id: "argile", nombre: "Argile", anno: "1963" },
    { id: "gravel-deep", nombre: "Gravel profound", anno: "1971" },
    { id: "ferrugineux", nombre: "Ferrugineux", anno: "1968" },
    { id: "blanc-sec", nombre: "Blanc sec", anno: "1977" },
    { id: "rose-de-table", nombre: "Rosé de table", anno: "1982" }
  ];

  var VINOS = [
    {
      slug: "graves-1994",
      nombre: "Graves",
      ano: "1994",
      tipo: "tinto",
      parcela: "graves",
      uva: "Cabernet Sauvignon",
      origen: "Pessac-Lestonac",
      alcohol: "13,0%",
      azucar: "0,8 g/L",
      nota: "Clavo, grafito, hoja de tabaco. El que se sirve cuando no hay nada que demostrar.",
      facts: "9 ha - gravas gruesas - 11 meses en barrica",
      image: "assets/wines/graves-1994.webp"
    },
    {
      slug: "argile-1998",
      nombre: "Argile",
      ano: "1998",
      tipo: "tinto",
      parcela: "argile",
      uva: "Merlot",
      origen: "Pessac-Lestonac",
      alcohol: "13,5%",
      azucar: "1,1 g/L",
      nota: "Arcilla pura. Guinda, cacao, un fondo de canela que aparece a los diez minutos.",
      facts: "9 ha - arcilla roja - 14 meses en barrica",
      image: "assets/wines/argile-1998.webp"
    },
    {
      slug: "gravel-deep-2001",
      nombre: "Gravel profound",
      ano: "2001",
      tipo: "tinto",
      parcela: "gravel-deep",
      uva: "Cabernet Franc",
      origen: "Pessac-Lestonac",
      alcohol: "12,5%",
      azucar: "0,6 g/L",
      nota: "La parcela que se plantó para no parecerse a las otras. Ciruela negra, pimienta blanca, tanino largo.",
      facts: "9 ha - grava a 18 m - barrica de 24 meses",
      image: "assets/wines/gravel-deep-2001.webp"
    },
    {
      slug: "ferrugineux-2016",
      nombre: "Ferrugineux",
      ano: "2016",
      tipo: "tinto",
      parcela: "ferrugineux",
      uva: "Petit Verdot",
      origen: "Pessac-Lestonac",
      alcohol: "14,0%",
      azucar: "0,4 g/L",
      nota: "Cuarenta por ciento de la mezcla. Estructura de piedra, no de fruta. Es el vino que envejece mejor de la lista.",
      facts: "9 ha - suelo ferruginoso - tonneaux de 600 L",
      image: "assets/wines/ferrugineux-2016.webp"
    },
    {
      slug: "blanc-sec-2019",
      nombre: "Blanc sec",
      ano: "2019",
      tipo: "blanco",
      parcela: "blanc-sec",
      uva: "Sauvignon Blanc",
      origen: "Pessac-Lestonac",
      alcohol: "12,0%",
      azucar: "1,8 g/L",
      nota: "Fermentado en barrica, sin maloláctica. Cítrico, tiza, una mineralidad que se nota en el final de la boca.",
      facts: "9 ha - 11 meses en barrica - fermentación lenta",
      image: "assets/wines/blanc-sec-2019.webp"
    },
    {
      slug: "rose-de-table-2021",
      nombre: "Rosé de table",
      ano: "2021",
      tipo: "rosado",
      parcela: "rose-de-table",
      uva: "Cabernet Franc",
      origen: "Pessac-Lestonac",
      alcohol: "12,0%",
      azucar: "2,4 g/L",
      nota: "Prensa directa, cuatro horas de contacto. Seco de una manera que en un rosado casi parece un error.",
      facts: "9 ha - prensa directa - 4 horas de contacto",
      image: "assets/wines/rose-de-table-2021.webp"
    }
  ];

  /* Índice de parcelas por id, para resolver el filtro sin
     recorrer el array en cada render. */
  var PARCELA_POR_ID = {};
  for (var i = 0; i < PARCELAS.length; i++) PARCELA_POR_ID[PARCELAS[i].id] = PARCELAS[i];

  VN.TIPOS = TIPOS;
  VN.PARCELAS = PARCELAS;
  VN.VINOS = VINOS;
  VN.parcelaNombre = function (id) {
    var p = PARCELA_POR_ID[id];
    return p ? p.nombre : id;
  };
})(window);
