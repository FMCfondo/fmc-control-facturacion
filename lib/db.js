// Lectura COMPLETA y VERIFICADA de una tabla.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// PostgREST (la capa que expone Supabase) aplica un tope de filas por proyecto
// —el ajuste "Max rows", 1000 por defecto—. Cuando una consulta sin `Range`
// lo supera, NO devuelve un error: devuelve HTTP 200 con las primeras N filas.
// Desde `supabase-js` es indistinguible de una lectura completa.
//
// Consecuencias de leer así:
//   · el respaldo .sql sale corto y declara como total lo que ya venía recortado;
//   · cualquier agregado (IVA por cuatrimestre, cartera, dashboard) se calcula
//     sobre datos incompletos y da un número incorrecto sin ningún error.
//
// `leerTodo` cuenta primero cuántas filas hay de verdad y después las trae por
// páginas hasta completarlas, avanzando por lo REALMENTE devuelto (así funciona
// con cualquier valor de "Max rows", no solo con 1000).

const PAGINA = 1000;   // tamaño de página pedido
const MAX_VUELTAS = 500; // tope de seguridad contra un bucle sin progreso

/**
 * @param {object} sb        cliente de Supabase (service_role)
 * @param {string} tabla     nombre de la tabla
 * @param {object} opciones
 * @param {string} opciones.columnas  proyección (por defecto "*")
 * @param {string} opciones.clave     columna única para paginar de forma estable
 *                                    (sin un orden estable, paginar puede repetir
 *                                     u omitir filas). Por defecto "id".
 * @param {Array}  opciones.orden     [{ col, opts }] orden de presentación; la
 *                                    `clave` se añade siempre al final como desempate.
 * @param {Function} opciones.filtro  (q) => q  para aplicar `.eq()`, `.gt()`, etc.
 * @returns {Promise<{filas: Array, total: number, completa: boolean}>}
 */
export async function leerTodo(sb, tabla, { columnas = "*", clave = "id", orden = [], filtro } = {}) {
  // 1) Cuántas filas hay realmente (head: true no trae datos, solo la cuenta).
  const consultaConteo = sb.from(tabla).select("*", { count: "exact", head: true });
  const { count, error: eConteo } = await (filtro ? filtro(consultaConteo) : consultaConteo);
  if (eConteo) throw eConteo;
  const total = count ?? 0;
  if (!total) return { filas: [], total: 0, completa: true };

  // 2) Traerlas por páginas.
  const filas = [];
  for (let vuelta = 0; filas.length < total && vuelta < MAX_VUELTAS; vuelta++) {
    let q = sb.from(tabla).select(columnas);
    if (filtro) q = filtro(q);
    for (const o of orden) q = q.order(o.col, o.opts || {});
    q = q.order(clave, { ascending: true }); // desempate estable
    const { data, error } = await q.range(filas.length, filas.length + PAGINA - 1);
    if (error) throw error;
    if (!data || !data.length) break; // sin progreso: cortar en vez de girar
    filas.push(...data);
  }

  return { filas, total, completa: filas.length === total };
}

/**
 * Igual que `leerTodo`, pero FALLA CERRADO si la lectura salió incompleta.
 * Se usa donde una lectura parcial produce un artefacto incorrecto que parece
 * correcto: el respaldo restaurable, sobre todo.
 */
export async function leerTodoEstricto(sb, tabla, opciones) {
  const r = await leerTodo(sb, tabla, opciones);
  if (!r.completa) {
    throw new Error(
      `Lectura incompleta de "${tabla}": ${r.filas.length} de ${r.total} filas. ` +
      `Revisa el ajuste "Max rows" en Supabase → Settings → API.`
    );
  }
  return r.filas;
}
