// Pipeline de procesamiento de datos de entrada, portado desde el HTML.
// Recibe filas (array de arrays) — desde un Excel cargado o texto pegado — y
// devuelve registros validados + advertencias, listos para generar archivos.
import { norm, parseMoneda, digitoVerificacion, limpiarNombre, separarNombres, limpiarCorreo, validarTelefono } from "./utils.js";
import { buscarGeo } from "./geo.js";
import * as XLSX from "xlsx-js-style";

// Mapeo de columnas por encabezado, con respaldo posicional (C,D,E…W).
export const COLMAP = {
  id: { pos: 2, keys: ["identificacion", "cedula", "nit", "documento"] },
  nombre: { pos: 3, keys: ["nombre del deudor", "nombre completo", "deudor", "nombre"] },
  dir: { pos: 4, keys: ["direccion", "residencia"] },
  ciudadDepto: { pos: 5, keys: ["ciudad", "municipio"] },
  depto: { pos: -1, keys: ["departamento", "depto", "estado"] },
  email: { pos: 7, keys: ["email", "correo", "e-mail"] },
  tel: { pos: 8, keys: ["contacto", "telefono", "celular", "movil"] },
  // Claves específicas de la comisión. NO usar "valor" genérico: hacía match con
  // "Valor garantizado". Si ninguna clave coincide, cae a la posición W (col 22).
  valor: { pos: 22, keys: ["valor de la comision", "valor comision", "comision con iva", "comision mas iva", "comision + iva", "comision e iva"] },
};

function construirMapeo(headerCols) {
  const n = headerCols.map((c) => norm(c || ""));
  const map = {};
  for (const [field, def] of Object.entries(COLMAP)) {
    let idx = -1;
    for (const k of def.keys) { idx = n.findIndex((c) => c.includes(k)); if (idx >= 0) break; }
    map[field] = idx >= 0 ? idx : def.pos;
  }
  return map;
}
const mapeoPorDefecto = () => Object.fromEntries(Object.entries(COLMAP).map(([f, d]) => [f, d.pos]));

// Cuenta cuántos campos clave reconoce una fila (para identificar la fila de encabezados).
function puntajeHeader(cols) {
  const n = (cols || []).map((c) => norm(c || ""));
  let s = 0;
  for (const def of Object.values(COLMAP))
    if (def.keys.some((k) => n.some((c) => c.includes(k)))) s++;
  return s;
}
// Busca la fila de encabezados entre las primeras filas (la plantilla puede traer
// títulos/filas vacías arriba). Devuelve su índice, o -1 si no hay encabezado.
function encontrarHeaderIdx(rows) {
  let best = -1, bestScore = 0;
  const lim = Math.min(rows.length, 12);
  for (let i = 0; i < lim; i++) {
    const sc = puntajeHeader(rows[i]);
    if (sc > bestScore) { bestScore = sc; best = i; }
  }
  return bestScore >= 2 ? best : -1; // al menos 2 columnas reconocidas
}

// Lee un ArrayBuffer de Excel y elige la mejor hoja (auto-detección por puntaje).
export function leerExcel(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const filas = (name) =>
    XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", raw: true, blankrows: false })
      .map((r) => r.map((c) => (c == null ? "" : c)));
  const puntuar = (rows) => {
    if (!rows.length) return 0;
    let score = 0;
    const hdr = encontrarHeaderIdx(rows);
    const head = (hdr >= 0 ? rows[hdr] : rows[0]).map((c) => norm(String(c || "")));
    for (const def of Object.values(COLMAP))
      if (def.keys.some((k) => head.some((c) => c.includes(k)))) score += 3;
    const desde = hdr >= 0 ? hdr + 1 : 0;
    const sample = rows.slice(desde, desde + 6);
    let idNum = 0, valNum = 0;
    sample.forEach((r) => {
      if (/^\d{5,}$/.test(String(r[COLMAP.id.pos] || "").replace(/\D/g, ""))) idNum++;
      const m = parseMoneda(r[COLMAP.valor.pos]);
      if (m.ok && m.valor > 0) valNum++;
    });
    if (sample.length) score += 2 * (idNum / sample.length) + 2 * (valNum / sample.length);
    return score + Math.min(rows.length, 10) * 0.1;
  };
  const ranking = wb.SheetNames.map((n) => ({ name: n, rows: filas(n) }))
    .map((s) => ({ ...s, score: puntuar(s.rows) }))
    .sort((a, b) => b.score - a.score);
  const elegida = ranking[0] && ranking[0].score > 0 ? ranking[0] : { name: wb.SheetNames[0], rows: filas(wb.SheetNames[0]) };
  return { hojas: wb.SheetNames, hojaElegida: elegida.name, rows: elegida.rows };
}

// Lee las filas de una hoja específica (para el selector de hoja).
export function leerHoja(arrayBuffer, nombre) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[nombre];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, blankrows: false })
    .map((r) => r.map((c) => (c == null ? "" : c)));
}

// Parsea filas → { records, errs, tieneHeader }.
export function procesarFilas(rows) {
  if (!rows || !rows.length) return { records: [], errs: [], tieneHeader: false };
  // Busca la fila de encabezados (puede no ser la primera si hay títulos arriba).
  const hdrIdx = encontrarHeaderIdx(rows);
  const tieneHeader = hdrIdx >= 0;
  const map = tieneHeader ? construirMapeo(rows[hdrIdx]) : mapeoPorDefecto();
  const dataRows = tieneHeader ? rows.slice(hdrIdx + 1) : rows;
  const records = [], errs = [];
  dataRows.forEach((cols, i) => {
    const cell = (k) => { const v = cols[map[k]]; return v == null ? "" : String(v).trim(); };
    const id = cell("id"), nombre = cell("nombre"), dir = cell("dir"), ciudadDepto = cell("ciudadDepto"), email = cell("email");
    const deptoTxt = (map.depto >= 0 && map.depto !== map.ciudadDepto) ? cell("depto") : "";
    if (!id && !nombre) return;
    const mon = parseMoneda(cols[map.valor]);
    const valorComision = mon.valor;
    const { nombres, apellidos } = separarNombres(nombre);
    const correo = limpiarCorreo(email), geo = buscarGeo(ciudadDepto, deptoTxt), dv = digitoVerificacion(id);
    const telV = validarTelefono(cell("tel"));
    if (!mon.ok || valorComision === 0) errs.push(`Fila ${i + 1} (${id}): Valor comisión inválido o en cero — "${cols[map.valor]}"`);
    if (correo.error) errs.push(`Fila ${i + 1} (${id}): Correo — ${correo.error}: "${email}"`);
    if (telV.error) errs.push(`Fila ${i + 1} (${id}): Teléfono — ${telV.error}: "${cell("tel")}"`);
    if (geo.error) errs.push(`Fila ${i + 1} (${id}): Geo — ${geo.error}`);
    else if (geo.warn) errs.push(`Fila ${i + 1} (${id}): Geo (revisar) — ${geo.warn}`);
    records.push({
      id, dv, nombre: limpiarNombre(nombre), nombres, apellidos, dir,
      ciudadDepto: ciudadDepto || deptoTxt, email: correo.email, emailOk: correo.ok,
      tel: telV.tel, telOk: telV.ok, valorComision, valorOk: mon.ok && valorComision !== 0, geo,
    });
  });
  return { records, errs, tieneHeader };
}

// Parsea texto pegado (tab-separated) → registros.
export function procesarTexto(texto) {
  const rows = texto.trim().split("\n").filter((l) => l.trim()).map((l) => l.split("\t"));
  return procesarFilas(rows);
}
