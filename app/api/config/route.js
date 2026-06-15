import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

// GET → { fondo_nombre, fondo_nit, ... } como objeto plano.
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("config").select("*");
    if (error) throw error;
    const obj = Object.fromEntries((data || []).map((r) => [r.clave, r.valor]));
    return NextResponse.json({ config: obj });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH → recibe { clave: valor, ... } y los actualiza (upsert).
export async function PATCH(request) {
  try {
    const cambios = await request.json();
    const filas = Object.entries(cambios).map(([clave, valor]) => ({ clave, valor: valor ?? "" }));
    const sb = supabaseAdmin();
    const { error } = await sb.from("config").upsert(filas, { onConflict: "clave" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
