// Generación de los 3 archivos SIIGO, portada desde Facturacion_FMC_SIIGO.html.
// Devuelve workbooks de xlsx-js-style listos para descargar o subir a Storage.
import * as XLSX from "xlsx-js-style";
import { round2, round6 } from "./utils.js";
import { NIT_FONDO, CODIGO_PRODUCTO, DESC_PRODUCTO, CUENTA_CXC_ASOCIADOS, CUENTA_CXC_MUTUALES, OBS } from "./constantes.js";

const ROJO = { fill: { patternType: "solid", fgColor: { rgb: "F8D7DA" } }, font: { color: { rgb: "842029" } } };
const AMARILLO = { fill: { patternType: "solid", fgColor: { rgb: "FFF3CD" } }, font: { color: { rgb: "664D03" } } };

const fechasCortas = (ws) => {
  const ref = XLSX.utils.decode_range(ws["!ref"]);
  for (let r = ref.s.r; r <= ref.e.r; r++)
    for (let c = ref.s.c; c <= ref.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "d") cell.z = "dd/mm/yyyy";
    }
  return ws;
};
const hoja = (aoa) => fechasCortas(XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }));
const pintar = (ws, i, c, estilo) => {
  const a = XLSX.utils.encode_cell({ r: i + 1, c });
  if (ws[a]) ws[a].s = estilo;
};

/**
 * @param {Object} cfg
 * @param {Array}  cfg.records  registros validados (ver procesar.js)
 * @param {Object} cfg.mutual   { nombre_corto, nit }
 * @param {string} cfg.fechaISO "YYYY-MM-DD"
 * @param {number} cfg.factIni  consecutivo de factura inicial
 * @param {number} cfg.cdc      número de cuenta de cobro
 * @returns {Array} [{ name, wb, opts, label, icon }]
 */
export function generarArchivosSiigo({ records, mutual, fechaISO, factIni, cdc }) {
  const d = new Date(fechaISO + "T12:00:00");
  const dLast = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  const nc = mutual.nombre_corto;
  const files = [];

  // ── TERCEROS ──
  const tH = ["Identificación (Obligatorio)", "Dígito de verificación", "Código Sucursal", "Tipo identificación (Obligatorio)", "Tipo (Obligatorio)", "Razón social (Obligatorio)", "Nombres del tercero (Obligatorio)", "Apellidos del tercero (Obligatorio)", "Nombre Comercial", "Dirección", "Código país", "Código departamento/estado", "Código ciudad", "Indicativo teléfono principal", "Teléfono principal", "Extensión teléfono principal", "Tipo de régimen IVA", "Código Responsabilidad fiscal", "Código Postal", "Nombres contacto principal", "Apellidos contacto principal", "Indicativo teléfono contacto principal", "Teléfono contacto principal", "Extensión teléfono contacto principal", "Correo electrónico contacto principal", "Identificación del cobrador", "Identificación del vendedor", "Otros", "Clientes", "Proveedor", "Estado"];
  const tD = records.map((r) => [r.id, r.dv, "", 13, "Es persona", "", r.nombres, r.apellidos, "", r.dir, r.geo.cod_pais, r.geo.cod_depto, r.geo.cod_ciudad, "", r.tel, "", "", "", "", r.nombres, r.apellidos, "", r.tel, "", r.email, "", "", "", "", "", ""]);
  const wsT = hoja([tH, ...tD]);
  records.forEach((r, i) => {
    if (!r.emailOk) pintar(wsT, i, 24, ROJO);
    if (!r.telOk) { pintar(wsT, i, 14, ROJO); pintar(wsT, i, 22, ROJO); }
    const eg = r.geo.error ? ROJO : (r.geo.warn ? AMARILLO : null);
    if (eg) { pintar(wsT, i, 10, eg); pintar(wsT, i, 11, eg); pintar(wsT, i, 12, eg); }
  });
  const wbT = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbT, wsT, "Hoja 1");
  files.push({ wb: wbT, name: `${cdc} - (${anio} MES ${mes}) ${nc} --Terceros.xlsm`, opts: { bookType: "xlsm" }, label: "Terceros", icon: "👤" });

  // ── FACTURAS ──
  const fH = ["Tipo de comprobante", "Consecutivo", "Identificación tercero", "Sucursal", "Código centro/subcentro de costos", "Fecha de elaboración", "Sigla Moneda", "Tasa de cambio", "Nombre contacto", "Email Contacto", "Orden de compra", "Orden de entrega", "Fecha orden de entrega", "Código producto", "Descripción producto", "Identificación vendedor", "Código de Bodega", "Cantidad producto", "Valor unitario", "Valor Descuento", "Base AIU", "Identificación ingreso para terceros", "Código impuesto cargo", "Código impuesto cargo dos", "Código impuesto retención", "Código ReteICA", "Código ReteIVA", "Código forma de pago", "Valor Forma de Pago", "Fecha Vencimiento", "Observaciones"];
  const fD = records.map((r, i) => {
    const vfp = round2(r.valorComision), base = round6(r.valorComision / 1.19);
    return [2, factIni + i, r.id, "", "", d, "", "", r.nombre, r.email, "", "", "", CODIGO_PRODUCTO, DESC_PRODUCTO, NIT_FONDO, "", 1, base, "", "", "", 23, "", "", "", "", 9, vfp, "", OBS];
  });
  const wsF = hoja([fH, ...fD]);
  records.forEach((r, i) => {
    if (!r.emailOk) pintar(wsF, i, 9, ROJO);
    if (!r.valorOk) { pintar(wsF, i, 18, ROJO); pintar(wsF, i, 28, ROJO); }
  });
  const wbF = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbF, wsF, "Hoja 1");
  files.push({ wb: wbF, name: `${cdc} - (${anio} MES ${mes}) ${nc} FACTURAS 1 --Modelo de facturas de ventas.xlsx`, opts: {}, label: "Facturas", icon: "📄" });

  // ── COMPROBANTES ──
  const cH = ["Tipo de comprobante", "Consecutivo comprobante", "Fecha de elaboración", "Sigla moneda", "Tasa de cambio", "Código cuenta contable", "Identificación tercero", "Sucursal", "Código producto", "Código de bodega", "Acción", "Cantidad producto", "Prefijo", "Consecutivo", "No. cuota", "Fecha vencimiento", "Código impuesto", "Código grupo activo fijo", "Código activo fijo", "Descripción", "Código centro/subcentro de costos", "Débito", "Crédito", "Observaciones", "Base gravable libro compras/ventas", "Base exenta libro compras/ventas", "Mes de cierre"];
  const creditos = records.map((r) => round2(r.valorComision));
  const tot = round2(creditos.reduce((s, v) => s + v, 0));
  const cD = records.map((r, idx) => [13, cdc, d, "", "", CUENTA_CXC_ASOCIADOS, r.id, "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", creditos[idx], "", "", "", ""]);
  cD.push([13, cdc, d, "", "", CUENTA_CXC_MUTUALES, mutual.nit, "", "", "", "", "", "CC", cdc, 1, dLast, "", "", "", "", "", tot, "", "", "", ""]);
  const wsC = hoja([cH, ...cD]);
  records.forEach((r, i) => { if (!r.valorOk) pintar(wsC, i, 22, ROJO); });
  const wbC = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbC, wsC, "Hoja 1");
  files.push({ wb: wbC, name: `${cdc}.(${anio} MES ${mes}) Importacion de comprobantes contables ${nc}.xlsx`, opts: {}, label: "Comprobantes", icon: "📊" });

  return files;
}

// Descarga en el navegador.
export function descargar(file) {
  XLSX.writeFile(file.wb, file.name, file.opts);
}
