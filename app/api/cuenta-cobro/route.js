import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

// Campos que se permiten crear/editar manualmente.
const CAMPOS = [
  "consecutivo", "tipo", "mutual_id", "cliente_nombre", "cliente_nit",
  "cliente_direccion", "cliente_correo", "mes", "anio", "fecha_elaboracion",
  "fecha_vencimiento", "factura_inicial", "factura_final", "num_facturas",
  "valor_facturado", "valor_recibido", "reserva_individual", "administracion",
  "iva", "estado", "documento_nombre", "notas",
];

function limpiar(body) {
  const o = {};
  for (const k of CAMPOS) if (body[k] !== undefined) o[k] = body[k] === "" ? null : body[k];
  return o;
}

// Crear una cuenta de cobro manual.
export async function POST(request) {
  try {
    const body = await request.json();
    const datos = limpiar(body);
    datos.origen = "manual";
    if (!datos.consecutivo) return NextResponse.json({ error: "Falta el consecutivo" }, { status: 400 });
    const sb = supabaseAdmin();
    const { data: existe } = await sb.from("cuentas_cobro").select("id").eq("consecutivo", datos.consecutivo).maybeSingle();
    if (existe) return NextResponse.json({ error: `El consecutivo ${datos.consecutivo} ya existe.` }, { status: 409 });
    const { data, error } = await sb.from("cuentas_cobro").insert(datos).select("id").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Editar una cuenta de cobro existente.
export async function PATCH(request) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    const datos = limpiar(body);
    const sb = supabaseAdmin();
    const { error } = await sb.from("cuentas_cobro").update(datos).eq("id", body.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Borrar una cuenta de cobro (y sus facturas por cascade).
export async function DELETE(request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from("cuentas_cobro").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
