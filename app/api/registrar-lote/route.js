import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

// POST → crea la cuenta de cobro + sus facturas (detalle por asociado) en una operación.
// Body: { cuenta: {...}, facturas: [...] }
export async function POST(request) {
  try {
    const { cuenta, facturas } = await request.json();
    if (!cuenta || !cuenta.consecutivo) {
      return NextResponse.json({ error: "Faltan datos de la cuenta de cobro" }, { status: 400 });
    }
    const sb = supabaseAdmin();

    // Evitar duplicar el consecutivo (por si dos personas generan a la vez).
    const { data: existe } = await sb
      .from("cuentas_cobro").select("id").eq("consecutivo", cuenta.consecutivo).maybeSingle();
    if (existe) {
      return NextResponse.json(
        { error: `El consecutivo de cuenta de cobro ${cuenta.consecutivo} ya existe. Refresca para tomar el siguiente.` },
        { status: 409 }
      );
    }

    const { data: cc, error: e1 } = await sb
      .from("cuentas_cobro").insert(cuenta).select("id").single();
    if (e1) throw e1;

    if (Array.isArray(facturas) && facturas.length) {
      const filas = facturas.map((f) => ({ ...f, cuenta_cobro_id: cc.id }));
      const { error: e2 } = await sb.from("facturas_siigo").insert(filas);
      if (e2) {
        // rollback manual de la cuenta si fallan las facturas
        await sb.from("cuentas_cobro").delete().eq("id", cc.id);
        throw e2;
      }
    }
    return NextResponse.json({ ok: true, cuenta_cobro_id: cc.id });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
