import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

export const dynamic = "force-dynamic";

// GET → cuentas de cobro (por cliente/intermediario) con datos para el control de IVA y reserva.
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from("cuentas_cobro")
      .select("id,consecutivo,tipo,cliente_nombre,anio,mes,cuatrimestre,fecha_elaboracion,factura_inicial,factura_final,num_facturas,valor_facturado,mutuales(nombre,es_socia)")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false, nullsFirst: false })
      .order("consecutivo", { ascending: false });
    if (error) throw error;

    const cuentas = (data || []).map((c) => {
      const mut = c.mutuales || null;
      return {
        id: c.id, cc: c.consecutivo, tipo: c.tipo,
        cliente: mut ? mut.nombre : (c.cliente_nombre || "—"),
        es_socia: mut ? !!mut.es_socia : false,
        esMutual: !!mut,
        anio: c.anio, mes: c.mes, cuatrimestreManual: c.cuatrimestre, fecha: c.fecha_elaboracion,
        fi: c.factura_inicial, ff: c.factura_final, num: c.num_facturas,
        valor: Number(c.valor_facturado) || 0,
      };
    });

    const { data: par } = await sb.from("parametros").select("*");
    const p = Object.fromEntries((par || []).map((r) => [r.clave, Number(r.valor)]));
    const params = { iva: p.iva ?? 0.19, admin_socia: p.admin_socia ?? 0.13, admin_no_socia: p.admin_no_socia ?? 0.17 };

    return NextResponse.json({ cuentas, params });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
