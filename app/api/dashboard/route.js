import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

// GET → datos base para el dashboard (cuentas + pagos + mutuales + parámetros).
// El volumen es bajo (~150 cuentas), así que los agregados se calculan en el cliente
// y así los filtros (año/mes/mutual) responden al instante sin volver al servidor.
export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();

    const [cc, pg, par, mut] = await Promise.all([
      sb.from("cuentas_cobro")
        .select("id,consecutivo,tipo,mutual_id,cliente_nombre,mes,anio,fecha_elaboracion,fecha_vencimiento,num_facturas,valor_facturado,valor_recibido,saldo,estado,mutuales(nombre,nombre_corto,es_socia)")
        .order("anio", { ascending: true }),
      sb.from("pagos").select("cuenta_cobro_id,fecha,valor"),
      sb.from("parametros").select("*"),
      sb.from("mutuales").select("id,nombre,nombre_corto,es_socia,activa").order("nombre"),
    ]);
    if (cc.error) throw cc.error;

    const p = Object.fromEntries((par.data || []).map((r) => [r.clave, Number(r.valor)]));
    const cuentas = (cc.data || []).map((c) => {
      const m = c.mutuales || null;
      return {
        id: c.id, cc: c.consecutivo, tipo: c.tipo,
        cliente: m?.nombre || c.cliente_nombre || "—",
        corto: m?.nombre_corto || c.cliente_nombre || "—",
        esMutual: !!m, es_socia: m ? !!m.es_socia : false,
        anio: c.anio, mes: c.mes, fecha: c.fecha_elaboracion, vence: c.fecha_vencimiento,
        num: c.num_facturas, estado: c.estado,
        valor: Number(c.valor_facturado) || 0,
        recibido: Number(c.valor_recibido) || 0,
        saldo: Number(c.saldo) || 0,
      };
    });

    return NextResponse.json({
      cuentas,
      pagos: pg.data || [],
      mutuales: (mut.data || []).filter((m) => m.activa),
      params: {
        iva: p.iva ?? 0.19,
        admin_socia: p.admin_socia ?? 0.13,
        admin_no_socia: p.admin_no_socia ?? 0.17,
      },
    });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
