import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad } from "../../../lib/actividad";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

// GET ?cuenta_cobro_id=... → lista de pagos de esa cuenta
export async function GET(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const id = new URL(request.url).searchParams.get("cuenta_cobro_id");
    if (!id) return NextResponse.json({ error: "Falta cuenta_cobro_id" }, { status: 400 });
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("pagos").select("*").eq("cuenta_cobro_id", id).order("fecha");
    if (error) throw error;
    return NextResponse.json({ pagos: data });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// POST → registra un pago (el trigger recalcula valor_recibido y estado)
export async function POST(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const b = await request.json();
    if (!b.cuenta_cobro_id || !b.fecha || b.valor == null)
      return NextResponse.json({ error: "Faltan datos del pago (fecha y valor)" }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from("pagos").insert({
      cuenta_cobro_id: b.cuenta_cobro_id, fecha: b.fecha, valor: Number(b.valor),
      metodo: b.metodo || null, notas: b.notas || null,
    });
    if (error) throw error;
    await logActividad({ tipo: "Pago registrado", descripcion: `Pago de ${Number(b.valor).toLocaleString("es-CO")} registrado`, entidad: "pago", entidad_id: b.cuenta_cobro_id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

// DELETE → elimina un pago (por id) o TODOS los de una cuenta (por cuenta_cobro_id).
// El trigger recalcula el recibido/estado.
export async function DELETE(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const b = await request.json();
    const sb = supabaseAdmin();
    if (b.cuenta_cobro_id) {
      const { error } = await sb.from("pagos").delete().eq("cuenta_cobro_id", b.cuenta_cobro_id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (!b.id) return NextResponse.json({ error: "Falta el id o cuenta_cobro_id" }, { status: 400 });
    const { error } = await sb.from("pagos").delete().eq("id", b.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
