import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

// GET ?cuenta_cobro_id=... → lista de pagos de esa cuenta
export async function GET(request) {
  try {
    const id = new URL(request.url).searchParams.get("cuenta_cobro_id");
    if (!id) return NextResponse.json({ error: "Falta cuenta_cobro_id" }, { status: 400 });
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("pagos").select("*").eq("cuenta_cobro_id", id).order("fecha");
    if (error) throw error;
    return NextResponse.json({ pagos: data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST → registra un pago (el trigger recalcula valor_recibido y estado)
export async function POST(request) {
  try {
    const b = await request.json();
    if (!b.cuenta_cobro_id || !b.fecha || b.valor == null)
      return NextResponse.json({ error: "Faltan datos del pago (fecha y valor)" }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from("pagos").insert({
      cuenta_cobro_id: b.cuenta_cobro_id, fecha: b.fecha, valor: Number(b.valor),
      metodo: b.metodo || null, notas: b.notas || null,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE → elimina un pago (el trigger recalcula)
export async function DELETE(request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from("pagos").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
