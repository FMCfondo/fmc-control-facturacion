import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad } from "../../../lib/actividad";

export const dynamic = "force-dynamic";

// GET → últimos eventos de la bitácora.
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("actividad").select("*").order("creado_en", { ascending: false }).limit(500);
    if (error) throw error;
    return NextResponse.json({ actividad: data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST → registrar un evento desde el cliente (ej. descargas).
export async function POST(request) {
  try {
    const b = await request.json();
    await logActividad(b);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
