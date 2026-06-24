import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { requireUser } from "../../../lib/requireUser";
import { logActividad } from "../../../lib/actividad";

export const dynamic = "force-dynamic";

// GET → { iva, admin_socia, admin_no_socia, dias_vencimiento, tasa_mora, ... }
export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("parametros").select("*");
    if (error) throw error;
    const obj = Object.fromEntries((data || []).map((r) => [r.clave, Number(r.valor)]));
    return NextResponse.json({ parametros: obj });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// PATCH → { clave: valor, ... } actualiza parámetros existentes (upsert).
export async function PATCH(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const cambios = await request.json();
    const filas = Object.entries(cambios).map(([clave, valor]) => ({ clave, valor: Number(valor) }));
    const sb = supabaseAdmin();
    const { error } = await sb.from("parametros").upsert(filas, { onConflict: "clave" });
    if (error) throw error;
    await logActividad({ tipo: "Parámetros", descripcion: `Parámetros actualizados (${Object.keys(cambios).join(", ")})`, entidad: "parametros", detalle: cambios });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
