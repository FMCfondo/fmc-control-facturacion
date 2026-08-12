import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { leerTodo } from "../../../lib/db";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

// GET → cuentas de cobro (por cliente/intermediario) con datos para el control de IVA y reserva.
// Paginado: el IVA por cuatrimestre se suma sobre estas filas y una lectura
// truncada daría una cifra menor sin ningún error. Ver lib/db.js.
export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();
    const { filas } = await leerTodo(sb, "cuentas_cobro", {
      columnas: "id,consecutivo,tipo,cliente_nombre,anio,mes,cuatrimestre,fecha_elaboracion,factura_inicial,factura_final,num_facturas,valor_facturado,mutuales(nombre,es_socia)",
      orden: [
        { col: "anio", opts: { ascending: false } },
        { col: "mes", opts: { ascending: false, nullsFirst: false } },
        { col: "consecutivo", opts: { ascending: false } },
      ],
    });

    const cuentas = filas.map((c) => {
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

    const { filas: par } = await leerTodo(sb, "parametros", { clave: "clave" });
    const p = Object.fromEntries(par.map((r) => [r.clave, Number(r.valor)]));
    const params = { iva: p.iva ?? 0.19, admin_socia: p.admin_socia ?? 0.13, admin_no_socia: p.admin_no_socia ?? 0.17 };

    return NextResponse.json({ cuentas, params });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
