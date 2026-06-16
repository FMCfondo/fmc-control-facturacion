import { supabaseAdmin } from "./supabase";

// Registra un evento en la bitácora. Es "fire-and-forget": si falla, no rompe la operación.
export async function logActividad({ tipo, descripcion, entidad, entidad_id, detalle }) {
  try {
    const sb = supabaseAdmin();
    await sb.from("actividad").insert({
      tipo: tipo || "evento",
      descripcion: descripcion || "",
      entidad: entidad || null,
      entidad_id: entidad_id != null ? String(entidad_id) : null,
      detalle: detalle || null,
    });
  } catch (_) { /* no interrumpir el flujo principal */ }
}
