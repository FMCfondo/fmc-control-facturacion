import { supabaseAdmin } from "./supabase";
import { currentUserEmail } from "./requireUser";

// Registra un evento en la bitácora. Es "fire-and-forget": si falla, no rompe la operación.
// El "usuario" se resuelve SIEMPRE del lado del servidor (no se confía en el cliente).
export async function logActividad({ tipo, descripcion, entidad, entidad_id, detalle }) {
  try {
    const usuario = await currentUserEmail();
    const sb = supabaseAdmin();
    await sb.from("actividad").insert({
      tipo: tipo || "evento",
      descripcion: descripcion || "",
      entidad: entidad || null,
      entidad_id: entidad_id != null ? String(entidad_id) : null,
      detalle: detalle || null,
      usuario,
    });
  } catch (_) { /* no interrumpir el flujo principal */ }
}

// Formatea un número como pesos (para descripciones de la bitácora).
const pesos = (v) => "$" + (Number(v) || 0).toLocaleString("es-CO");

// Resumen legible de una cuenta de cobro (consecutivo + cliente + valor) para
// enriquecer la bitácora. Devuelve null si no existe.
export async function resumenCuenta(sb, id) {
  try {
    const { data } = await sb.from("cuentas_cobro")
      .select("consecutivo,tipo,cliente_nombre,valor_facturado,mes,anio,mutuales(nombre)")
      .eq("id", id).single();
    if (!data) return null;
    return {
      consecutivo: data.consecutivo,
      cliente: data.mutuales?.nombre || data.cliente_nombre || "—",
      valor: Number(data.valor_facturado) || 0,
      mes: data.mes, anio: data.anio, tipo: data.tipo,
    };
  } catch { return null; }
}

export { pesos as fmtPesosLog };
