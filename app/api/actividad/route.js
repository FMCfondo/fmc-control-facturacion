import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad } from "../../../lib/actividad";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

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

// POST → registrar un evento desde el cliente (ej. descargas).
export async function POST(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const b = await request.json();
    await logActividad(b);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
