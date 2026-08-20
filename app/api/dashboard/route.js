import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { leerTodo } from "../../../lib/db";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

// GET → datos base para el dashboard (cuentas + pagos + mutuales + parámetros).
// El volumen es bajo (~150 cuentas), así que los agregados se calculan en el cliente
// y así los filtros (año/mes/mutual) responden al instante sin volver al servidor.
//
// Las lecturas van por `leerTodo` (paginado): un agregado calculado sobre una
// lectura truncada da un número incorrecto sin producir ningún error. Ver lib/db.js.
export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();

    const [cc, pg, par, mut] = await Promise.all([
      leerTodo(sb, "cuentas_cobro", {
        columnas: "id,consecutivo,tipo,mutual_id,cliente_nombre,mes,anio,fecha_elaboracion,fecha_vencimiento,num_facturas,valor_facturado,valor_recibido,saldo,estado,anticipos,mutuales(nombre,nombre_corto,es_socia)",
        orden: [{ col: "anio", opts: { ascending: true } }],
      }),
      leerTodo(sb, "pagos", { columnas: "cuenta_cobro_id,fecha,valor" }),
      leerTodo(sb, "parametros", { clave: "clave" }),
      leerTodo(sb, "mutuales", { columnas: "id,nombre,nombre_corto,es_socia,activa", orden: [{ col: "nombre" }] }),
    ]);

    const p = Object.fromEntries(par.filas.map((r) => [r.clave, Number(r.valor)]));
    const cuentas = cc.filas.map((c) => {
      const m = c.mutuales || null;
      return {
        id: c.id, cc: c.consecutivo, tipo: c.tipo,
        cliente: m?.nombre || c.cliente_nombre || "—",
        corto: m?.nombre_corto || c.cliente_nombre || "—",
        esMutual: !!m, es_socia: m ? !!m.es_socia : false,
        anio: c.anio, mes: c.mes, fecha: c.fecha_elaboracion, vence: c.fecha_vencimiento,
        num: c.num_facturas, estado: c.estado,
        valor: Number(c.valor_facturado) || 0,
        // Saldo a favor por nota crédito: reduce base, IVA, administración y reserva.
        anticipos: Number(c.anticipos) || 0,
        recibido: Number(c.valor_recibido) || 0,
        saldo: Number(c.saldo) || 0,
      };
    });

    return NextResponse.json({
      cuentas,
      pagos: pg.filas,
      mutuales: mut.filas.filter((m) => m.activa),
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
