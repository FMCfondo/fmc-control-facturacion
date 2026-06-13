import { NextResponse } from "next/server";
import { supabaseAdmin, proximoConsecutivoCC, proximaFacturaSiigo } from "../../../lib/supabase";

// GET → { proximoCC, proximaFactura, mutuales[] }
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = supabaseAdmin();
    const [cc, fac, mut] = await Promise.all([
      proximoConsecutivoCC(sb),
      proximaFacturaSiigo(sb),
      sb.from("mutuales").select("id,nombre,nombre_corto,nit,dv,es_socia").eq("activa", true).order("nombre"),
    ]);
    if (mut.error) throw mut.error;
    return NextResponse.json({ proximoCC: cc, proximaFactura: fac, mutuales: mut.data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
