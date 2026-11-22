/**
 * Los textos de resultado de las calculadoras escriben las unidades en plural
 * («1 sacos»). Esta función los deja en singular cuando la cantidad es exactamente 1.
 */
const SINGULARS: Record<string, string> = {
  piezas: "pieza", sacos: "saco", tubos: "tubo", galones: "galón", varillas: "varilla", rollos: "rollo",
  láminas: "lámina", cajas: "caja", unidades: "unidad", postes: "poste", litros: "litro", espacios: "espacio",
  cartuchos: "cartucho", viajes: "viaje", puntos: "punto", líneas: "línea", escalones: "escalón",
  bolsas: "bolsa", zonas: "zona", viguetas: "vigueta", paneles: "panel", cuerpos: "cuerpo", cubetas: "cubeta",
  barrotes: "barrote", ventanas: "ventana", usos: "uso", tramos: "tramo", tomacorrientes: "tomacorriente",
  soportes: "soporte", skimmers: "skimmer", rieles: "riel", retornos: "retorno", reglas: "regla",
  rectangulares: "rectangular", puertas: "puerta", posiciones: "posición", patas: "pata", pares: "par",
  octogonales: "octogonal", manos: "mano", luminarias: "luminaria", luces: "luz", huecos: "hueco",
  hojas: "hoja", circuitos: "circuito", cerraduras: "cerradura", celdas: "celda", carriolas: "carriola",
  canales: "canal", camiones: "camión", bloques: "bloque", bisagras: "bisagra", bajantes: "bajante",
  aspersores: "aspersor", accesorios: "accesorio", abrazaderas: "abrazadera", desagües: "desagüe",
  extractores: "extractor", ductos: "ducto", rejillas: "rejilla", baterías: "batería", cadenas: "cadena",
  pilares: "pilar", columnas: "columna", vigas: "viga", zapatas: "zapata", escaleras: "escalera",
};

export function singularizeOne(text: string): string {
  return text.replace(/(^|[^\d.,])1 ([a-záéíóúüñ]+)/gi, (match, before: string, word: string) => {
    const singular = SINGULARS[word.toLowerCase()];
    if (!singular) return match;
    const keepCase = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
    return `${before}1 ${keepCase ? singular[0].toUpperCase() + singular.slice(1) : singular}`;
  });
}
