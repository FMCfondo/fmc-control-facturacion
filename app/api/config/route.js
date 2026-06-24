import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

// GET → { fondo_nombre, fondo_nit, ... } como objeto plano.
export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("config").select("*");
    if (error) throw error;
    const obj = Object.fromEntries((data || []).map((r) => [r.clave, r.valor]));
    return NextResponse.json({ config: obj });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// PATCH → recibe { clave: valor, ... } y los actualiza (upsert).
export async function PATCH(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const cambios = await request.json();
    const filas = Object.entries(cambios).map(([clave, valor]) => ({ clave, valor: valor ?? "" }));
    const sb = supabaseAdmin();
    const { error } = await sb.from("config").upsert(filas, { onConflict: "clave" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
