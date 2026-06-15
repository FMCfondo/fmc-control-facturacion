import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

// GET → facturas por asociado, con fecha/mutual del lote y parámetros de cálculo.
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("facturas_siigo")
      .select("id,consecutivo,cedula,nombre,valor_comision,cuentas_cobro(fecha_elaboracion,anio,mes,consecutivo,mutuales(nombre,es_socia))")
      .order("consecutivo");
    if (error) throw error;

    const facturas = (data || []).map((f) => {
      const cc = f.cuentas_cobro || {};
      const mut = cc.mutuales || {};
      return {
        id: f.id, fv: f.consecutivo, cedula: f.cedula, nombre: f.nombre,
        valor: Number(f.valor_comision) || 0,
        fecha: cc.fecha_elaboracion, anio: cc.anio, mes: cc.mes, cc: cc.consecutivo,
        mutual: mut.nombre || "—", es_socia: !!mut.es_socia,
      };
    });

    const { data: par } = await sb.from("parametros").select("*");
    const p = Object.fromEntries((par || []).map((r) => [r.clave, Number(r.valor)]));
    const params = {
      iva: p.iva ?? 0.19,
      admin_socia: p.admin_socia ?? 0.13,
      admin_no_socia: p.admin_no_socia ?? 0.17,
    };

    return NextResponse.json({ facturas, params });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
