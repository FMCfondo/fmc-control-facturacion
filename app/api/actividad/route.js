import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad } from "../../../lib/actividad";
import { texto } from "../../../lib/validar";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

// Únicos eventos que el NAVEGADOR puede registrar. Todo lo demás lo escribe el
// servidor desde la ruta que ejecuta la acción, que es donde se sabe qué pasó.
// Sin esta lista, un evento falso de tipo "Respaldo BD" apagaría el recordatorio
// de respaldo de /reportes sin que se hubiera hecho ningún respaldo.
const TIPOS_CLIENTE = new Set(["Descarga", "Respaldo BD"]);

// GET → últimos eventos de la bitácora.
export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("actividad").select("*").order("creado_en", { ascending: false }).limit(500);
    if (error) throw error;
    return NextResponse.json({ actividad: data });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// POST → registrar un evento desde el cliente (descargas y respaldos).
// El cuerpo se filtra: la bitácora es la única evidencia de lo que pasó en el
// sistema; si se puede escribir sin forma, deja de servir como evidencia.
export async function POST(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const b = await request.json();
    if (!TIPOS_CLIENTE.has(b?.tipo))
      return NextResponse.json({ error: "Tipo de evento no permitido" }, { status: 400 });
    await logActividad({
      tipo: b.tipo,
      descripcion: texto(b.descripcion, 300),
      entidad: texto(b.entidad, 50),
      entidad_id: texto(b.entidad_id, 50),
      // `detalle` solo se acepta como objeto plano de conteos (el resumen del respaldo).
      detalle: b.detalle && typeof b.detalle === "object" && !Array.isArray(b.detalle) ? b.detalle : null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
