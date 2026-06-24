import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

// GET → todas las tablas para respaldo/reportes.
export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();
    const [cc, fs, pg, mu, it, cf, pa] = await Promise.all([
      sb.from("cuentas_cobro").select("*").order("consecutivo"),
      sb.from("facturas_siigo").select("*").order("consecutivo"),
      sb.from("pagos").select("*").order("fecha"),
      sb.from("mutuales").select("*").order("nombre"),
      sb.from("items_cuenta_cobro").select("*"),
      sb.from("config").select("*"),
      sb.from("parametros").select("*"),
    ]);
    return NextResponse.json({
      cuentas_cobro: cc.data || [],
      facturas_siigo: fs.data || [],
      pagos: pg.data || [],
      mutuales: mu.data || [],
      items_cuenta_cobro: it.data || [],
      config: cf.data || [],
      parametros: pa.data || [],
    });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
