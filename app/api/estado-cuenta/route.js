import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { leerTodo } from "../../../lib/db";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

// GET → cuentas de cobro con saldo pendiente (base del estado de cuenta por cliente).
// Paginado: el saldo total de la cartera se suma sobre estas filas. Ver lib/db.js.
export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();

    const { filas } = await leerTodo(sb, "cuentas_cobro", {
      columnas: "id,consecutivo,mutual_id,cliente_nombre,cliente_correo,mes,anio,fecha_elaboracion,fecha_vencimiento,valor_facturado,valor_recibido,anticipos,saldo,estado,mutuales(id,nombre,nit,dv,correo,correos_envio,correos_cc)",
      filtro: (q) => q.gt("saldo", 0),
      orden: [{ col: "fecha_vencimiento", opts: { ascending: true, nullsFirst: false } }],
    });

    const pendientes = filas.map((c) => {
      const m = c.mutuales || null;
      return {
        id: c.id, cc: c.consecutivo,
        mutual_id: c.mutual_id,
        cliente: m?.nombre || c.cliente_nombre || "—",
        nit: m ? `${m.nit}-${m.dv}` : null,
        correos: m?.correos_envio || m?.correo || c.cliente_correo || "",
        correos_cc: m?.correos_cc || "",
        mes: c.mes, anio: c.anio,
        fecha: c.fecha_elaboracion, vence: c.fecha_vencimiento,
        facturado: Number(c.valor_facturado) || 0,
        recibido: Number(c.valor_recibido) || 0,
        anticipos: Number(c.anticipos) || 0,
        saldo: Number(c.saldo) || 0,
        estado: c.estado,
      };
    });

    return NextResponse.json({ pendientes });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
