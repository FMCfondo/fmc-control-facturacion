// Arma el PDF de UNA cuenta de cobro (documento + anexo con la relación de facturas).
//
// POR QUÉ ESTÁ AQUÍ Y NO DENTRO DE UNA RUTA
// Lo necesitan dos rutas de correo: `enviar-correo` (una cuenta) y
// `enviar-estado-cuenta` (todas las pendientes de un cliente). Tenerlo dos veces
// es exactamente la asimetría que la auditoría encontró entre esas mismas dos
// rutas con el escapado del HTML: una se corrigió y la otra no.
//
// El anexo se lee PAGINADO. Un anexo al que le faltan filas es un documento
// incorrecto enviado a un tercero, y PostgREST trunca sin avisar. Ver lib/db.js.

import { leerTodo } from "./db";
import { generarPDFCuenta } from "./pdf";

/**
 * @param {object} sb        cliente de Supabase (service_role)
 * @param {string} cuentaId  uuid de la cuenta de cobro
 * @param {object} ctx       { fondo, logoBase64 }
 * @returns {Promise<{pdf: Buffer, cuenta: object, nombre: string, filename: string, facturas: number}>}
 */
export async function armarCuentaPDF(sb, cuentaId, { fondo, logoBase64 }) {
  const { data: cuenta, error } = await sb
    .from("cuentas_cobro").select("*,mutuales(*)").eq("id", cuentaId).single();
  if (error) throw error;

  const mutual = cuenta.mutuales || null;
  const [{ data: items }, { filas: facturas }] = await Promise.all([
    sb.from("items_cuenta_cobro").select("*").eq("cuenta_cobro_id", cuentaId),
    leerTodo(sb, "facturas_siigo", {
      filtro: (q) => q.eq("cuenta_cobro_id", cuentaId),
      orden: [{ col: "consecutivo" }],
    }),
  ]);

  const pdf = generarPDFCuenta({
    cuenta, mutual, items: items || [], facturas, fondo, logoBase64,
  });
  const nombre = mutual?.nombre || cuenta.cliente_nombre || "Cliente";
  return {
    pdf, cuenta, mutual, nombre,
    filename: `Cuenta de cobro ${cuenta.consecutivo} - ${nombre}.pdf`,
    facturas: facturas.length,
  };
}

// Gmail corta en 25 MB, y nodemailer codifica los adjuntos en base64 (~33% más).
// Se deja margen y se comprueba ANTES de enviar: es preferible un error claro y
// accionable a que Gmail rechace el correo con un mensaje opaco.
export const TOPE_ADJUNTOS_BYTES = 18 * 1024 * 1024;

export const pesoAdjuntos = (adjuntos) =>
  adjuntos.reduce((s, a) => s + (a.content?.length || 0), 0);

export const enMB = (bytes) => (bytes / 1024 / 1024).toFixed(1);
