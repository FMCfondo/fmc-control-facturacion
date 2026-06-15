import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

// GET ?id=<cuenta_cobro_id> → { cuenta, mutual, items } para armar la cuenta de cobro.
export async function GET(request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const sb = supabaseAdmin();

    const { data: cuenta, error } = await sb.from("cuentas_cobro").select("*").eq("id", id).single();
    if (error) throw error;

    let mutual = null;
    if (cuenta.mutual_id) {
      const { data } = await sb.from("mutuales").select("*").eq("id", cuenta.mutual_id).single();
      mutual = data;
    }
    const { data: items } = await sb.from("items_cuenta_cobro").select("*").eq("cuenta_cobro_id", id);
    const { data: facturas } = await sb.from("facturas_siigo").select("*").eq("cuenta_cobro_id", id).order("consecutivo");

    return NextResponse.json({ cuenta, mutual, items: items || [], facturas: facturas || [] });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
