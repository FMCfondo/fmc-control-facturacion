import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

// GET → { iva, admin_socia, admin_no_socia, dias_vencimiento, tasa_mora, ... }
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("parametros").select("*");
    if (error) throw error;
    const obj = Object.fromEntries((data || []).map((r) => [r.clave, Number(r.valor)]));
    return NextResponse.json({ parametros: obj });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH → { clave: valor, ... } actualiza parámetros existentes (upsert).
export async function PATCH(request) {
  try {
    const cambios = await request.json();
    const filas = Object.entries(cambios).map(([clave, valor]) => ({ clave, valor: Number(valor) }));
    const sb = supabaseAdmin();
    const { error } = await sb.from("parametros").upsert(filas, { onConflict: "clave" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
