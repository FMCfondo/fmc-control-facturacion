import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad, resumenCuenta, fmtPesosLog } from "../../../lib/actividad";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

// Campos que se permiten crear/editar manualmente.
const CAMPOS = [
  "consecutivo", "tipo", "mutual_id", "cliente_nombre", "cliente_nit",
  "cliente_direccion", "cliente_correo", "mes", "anio", "fecha_elaboracion",
  "fecha_vencimiento", "factura_inicial", "factura_final", "num_facturas",
  "valor_facturado", "valor_recibido", "reserva_individual", "administracion",
  "iva", "anticipos", "cuatrimestre", "estado", "documento_nombre", "notas",
];

function limpiar(body) {
  const o = {};
  for (const k of CAMPOS) if (body[k] !== undefined) o[k] = body[k] === "" ? null : body[k];
  return o;
}

// Lista todas las cuentas de cobro (para refrescar la tabla tras un cambio).
export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("cuentas_cobro").select("*")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false, nullsFirst: false })
      .order("consecutivo", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ cuentas: data });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// Crear una cuenta de cobro manual.
export async function POST(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const body = await request.json();
    const datos = limpiar(body);
    datos.origen = "manual";
    if (!datos.consecutivo) return NextResponse.json({ error: "Falta el consecutivo" }, { status: 400 });
    const sb = supabaseAdmin();
    const { data: existe } = await sb.from("cuentas_cobro").select("id").eq("consecutivo", datos.consecutivo).maybeSingle();
    if (existe) return NextResponse.json({ error: `El consecutivo ${datos.consecutivo} ya existe.` }, { status: 409 });
    const { data, error } = await sb.from("cuentas_cobro").insert(datos).select("id").single();
    if (error) throw error;
    await guardarItems(sb, data.id, body.items);
    const r = await resumenCuenta(sb, data.id);
    await logActividad({
      tipo: "Cuenta creada",
      descripcion: r ? `Cuenta de cobro #${r.consecutivo} creada manualmente — ${r.cliente} · ${fmtPesosLog(r.valor)}` : `Cuenta de cobro #${datos.consecutivo} creada manualmente`,
      entidad: "cuenta_cobro", entidad_id: datos.consecutivo, detalle: r,
    });
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// Inserta los ítems (reemplazando los existentes) de una cuenta de cobro irregular.
async function guardarItems(sb, cuentaId, items) {
  if (!Array.isArray(items)) return;
  await sb.from("items_cuenta_cobro").delete().eq("cuenta_cobro_id", cuentaId);
  const filas = items
    .filter((it) => it && it.descripcion)
    .map((it) => ({
      cuenta_cobro_id: cuentaId,
      cantidad: Number(it.cantidad) || 1,
      codigo: it.codigo || null,
      descripcion: it.descripcion,
      valor_unitario: Number(it.valor_unitario) || 0,
    }));
  if (filas.length) {
    const { error } = await sb.from("items_cuenta_cobro").insert(filas);
    if (error) throw error;
  }
}

// Editar una cuenta de cobro existente.
export async function PATCH(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    const datos = limpiar(body);
    const sb = supabaseAdmin();
    const { error } = await sb.from("cuentas_cobro").update(datos).eq("id", body.id);
    if (error) throw error;
    if (body.items !== undefined) await guardarItems(sb, body.id, body.items);
    const r = await resumenCuenta(sb, body.id);
    const campos = Object.keys(datos).join(", ");
    await logActividad({
      tipo: "Cuenta modificada",
      descripcion: r ? `Cuenta de cobro #${r.consecutivo} (${r.cliente}) modificada — campos: ${campos}` : `Cuenta de cobro modificada (campos: ${campos})`,
      entidad: "cuenta_cobro", entidad_id: r?.consecutivo ?? body.id, detalle: { cambios: datos, cuenta: r },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// Borrar una cuenta de cobro (y sus facturas por cascade).
export async function DELETE(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    const sb = supabaseAdmin();
    const r = await resumenCuenta(sb, id); // snapshot ANTES de borrar
    const { error } = await sb.from("cuentas_cobro").delete().eq("id", id);
    if (error) throw error;
    await logActividad({
      tipo: "Cuenta eliminada",
      descripcion: r
        ? `Cuenta de cobro #${r.consecutivo} eliminada — ${r.cliente}${r.mes ? ` · ${r.mes}/${r.anio}` : ""} · ${fmtPesosLog(r.valor)} (${r.tipo})`
        : "Cuenta de cobro eliminada",
      entidad: "cuenta_cobro", entidad_id: r?.consecutivo ?? id, detalle: r,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
