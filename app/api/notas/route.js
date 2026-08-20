import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad, resumenCuenta, fmtPesosLog } from "../../../lib/actividad";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

const TIPOS = new Set(["credito", "debito"]);
const texto = (v, max) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };

/**
 * Busca la factura SIIGO de origen y devuelve lo necesario para la nota:
 * el valor exacto a reversar y los porcentajes que REALMENTE se aplicaron al
 * facturarla.
 *
 * Los porcentajes no salen de los parámetros de hoy: se derivan de los valores
 * guardados en la cuenta de cobro de origen —`iva` y `administracion` sobre su
 * `valor_facturado`—, que son la huella de lo que regía ese día. Si esa cuenta
 * es del histórico migrado y no los tiene, se devuelven null y el desglose usa
 * los vigentes.
 */
async function origenDeFactura(sb, consecutivo) {
  const { data: fac } = await sb
    .from("facturas_siigo")
    .select("consecutivo,cedula,nombre,valor_comision,cuenta_cobro_id")
    .eq("consecutivo", consecutivo)
    .maybeSingle();
  if (!fac) return null;

  const { data: cc } = await sb
    .from("cuentas_cobro")
    .select("consecutivo,fecha_elaboracion,mes,anio,valor_facturado,iva,administracion,mutuales(nombre)")
    .eq("id", fac.cuenta_cobro_id)
    .maybeSingle();

  let pct_admin_origen = null, iva_pct_origen = null;
  if (cc) {
    const facturado = Number(cc.valor_facturado) || 0;
    const ivaGuardado = Number(cc.iva) || 0;
    const adminGuardada = Number(cc.administracion) || 0;
    const base = facturado - ivaGuardado;
    if (base > 0) {
      if (ivaGuardado > 0) iva_pct_origen = ivaGuardado / base;
      if (adminGuardada > 0) pct_admin_origen = adminGuardada / base;
    }
  }

  return {
    factura: fac.consecutivo,
    cedula: fac.cedula,
    nombre: fac.nombre,
    // Valor CON IVA de esa factura: es exactamente lo que hay que reversar.
    valor: Number(fac.valor_comision) || 0,
    cuenta_origen: cc?.consecutivo ?? null,
    cliente_origen: cc?.mutuales?.nombre ?? null,
    fecha_origen: cc?.fecha_elaboracion ?? null,
    mes_origen: cc?.mes ?? null,
    anio_origen: cc?.anio ?? null,
    pct_admin_origen,
    iva_pct_origen,
  };
}

// GET ?cuenta_cobro_id=…  → notas de esa cuenta
// GET ?factura=…          → datos de la factura de origen (para precargar el formulario)
export async function GET(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const q = new URL(request.url).searchParams;
    const sb = supabaseAdmin();

    const factura = q.get("factura");
    if (factura) {
      const n = Number(factura);
      if (!Number.isInteger(n) || n <= 0)
        return NextResponse.json({ error: "Número de factura inválido" }, { status: 400 });
      const origen = await origenDeFactura(sb, n);
      if (!origen) return NextResponse.json({ error: `No existe la factura ${n}.` }, { status: 404 });
      return NextResponse.json({ origen });
    }

    const id = q.get("cuenta_cobro_id");
    if (!id) return NextResponse.json({ error: "Falta cuenta_cobro_id" }, { status: 400 });
    const { data, error } = await sb.from("notas_ajuste").select("*")
      .eq("cuenta_cobro_id", id).order("fecha").order("creado_en");
    if (error) throw error;
    return NextResponse.json({ notas: data || [] });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// POST → crea una nota. El trigger recalcula `anticipos` (y con él, el saldo).
export async function POST(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const b = await request.json();

    if (!b.cuenta_cobro_id) return NextResponse.json({ error: "Falta la cuenta de cobro" }, { status: 400 });
    if (!TIPOS.has(b.tipo)) return NextResponse.json({ error: "El tipo debe ser crédito o débito" }, { status: 400 });
    const motivo = texto(b.motivo, 500);
    if (!motivo) return NextResponse.json({ error: "Escribe el motivo de la nota" }, { status: 400 });

    const sb = supabaseAdmin();

    // Si se indicó la factura de origen, de ahí salen el valor y los porcentajes.
    let origen = null;
    if (b.factura_origen != null && String(b.factura_origen).trim() !== "") {
      const n = Number(b.factura_origen);
      if (!Number.isInteger(n) || n <= 0)
        return NextResponse.json({ error: "Número de factura inválido" }, { status: 400 });
      origen = await origenDeFactura(sb, n);
      if (!origen) return NextResponse.json({ error: `No existe la factura ${n}.` }, { status: 404 });
    }

    // El valor lo puede ajustar el operador (una anulación parcial), pero por
    // defecto es el de la factura de origen.
    const valor = b.valor != null && String(b.valor).trim() !== "" ? Number(b.valor) : origen?.valor;
    if (!Number.isFinite(valor) || valor <= 0)
      return NextResponse.json({ error: "El valor debe ser un número mayor que cero" }, { status: 400 });

    const fila = {
      cuenta_cobro_id: b.cuenta_cobro_id,
      tipo: b.tipo,
      valor,
      motivo,
      factura_origen: origen?.factura ?? null,
      pct_admin_origen: origen?.pct_admin_origen ?? null,
      iva_pct_origen: origen?.iva_pct_origen ?? null,
      fecha: b.fecha || new Date().toISOString().slice(0, 10),
    };
    const { error } = await sb.from("notas_ajuste").insert(fila);
    if (error) throw error;

    const r = await resumenCuenta(sb, b.cuenta_cobro_id);
    await logActividad({
      tipo: b.tipo === "credito" ? "Nota crédito" : "Nota débito",
      descripcion:
        `Nota ${b.tipo} de ${fmtPesosLog(valor)}${r ? ` — CC #${r.consecutivo} · ${r.cliente}` : ""}` +
        `${origen ? ` · corrige la factura ${origen.factura} (CC #${origen.cuenta_origen ?? "—"}, ${origen.fecha_origen ?? "sin fecha"})` : " · sin factura de origen"}`,
      entidad: "nota_ajuste", entidad_id: r?.consecutivo ?? b.cuenta_cobro_id,
      detalle: { ...fila, motivo, origen, cuenta: r },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// DELETE { id } → elimina una nota (el trigger recalcula).
export async function DELETE(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    const sb = supabaseAdmin();

    const { data: nota } = await sb.from("notas_ajuste").select("*").eq("id", id).maybeSingle();
    const r = nota ? await resumenCuenta(sb, nota.cuenta_cobro_id) : null;
    const { error } = await sb.from("notas_ajuste").delete().eq("id", id);
    if (error) throw error;

    await logActividad({
      tipo: "Nota eliminada",
      descripcion: nota
        ? `Nota ${nota.tipo} de ${fmtPesosLog(nota.valor)} eliminada${r ? ` — CC #${r.consecutivo} · ${r.cliente}` : ""}`
        : "Nota eliminada",
      entidad: "nota_ajuste", entidad_id: r?.consecutivo ?? id,
      detalle: { nota, cuenta: r }, // snapshot ANTES de borrar
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
