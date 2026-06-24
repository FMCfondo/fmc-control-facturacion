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
