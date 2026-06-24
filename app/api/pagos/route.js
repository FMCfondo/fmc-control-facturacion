import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad, resumenCuenta, fmtPesosLog } from "../../../lib/actividad";
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
    if (!Number.isFinite(Number(b.valor)))
      return NextResponse.json({ error: "El valor del pago no es un número válido" }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from("pagos").insert({
      cuenta_cobro_id: b.cuenta_cobro_id, fecha: b.fecha, valor: Number(b.valor),
      metodo: b.metodo || null, notas: b.notas || null,
    });
    if (error) throw error;
    const r = await resumenCuenta(sb, b.cuenta_cobro_id);
    await logActividad({
      tipo: "Pago registrado",
      descripcion: r
        ? `Pago de ${fmtPesosLog(b.valor)} registrado — CC #${r.consecutivo} · ${r.cliente}${b.metodo ? ` · ${b.metodo}` : ""}`
        : `Pago de ${fmtPesosLog(b.valor)} registrado`,
      entidad: "pago", entidad_id: r?.consecutivo ?? b.cuenta_cobro_id,
      detalle: { valor: Number(b.valor), fecha: b.fecha, metodo: b.metodo || null, notas: b.notas || null, cuenta: r },
    });
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
      // Borrado de TODOS los pagos de una cuenta: registrar cuántos y el total.
      const r = await resumenCuenta(sb, b.cuenta_cobro_id);
      const { data: prev } = await sb.from("pagos").select("valor").eq("cuenta_cobro_id", b.cuenta_cobro_id);
      const n = prev?.length || 0;
      const tot = (prev || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
      const { error } = await sb.from("pagos").delete().eq("cuenta_cobro_id", b.cuenta_cobro_id);
      if (error) throw error;
      if (n > 0) await logActividad({
        tipo: "Pagos eliminados",
        descripcion: r ? `${n} pago(s) eliminados (total ${fmtPesosLog(tot)}) — CC #${r.consecutivo} · ${r.cliente}` : `${n} pago(s) eliminados`,
        entidad: "pago", entidad_id: r?.consecutivo ?? b.cuenta_cobro_id, detalle: { cantidad: n, total: tot, cuenta: r },
      });
      return NextResponse.json({ ok: true });
    }
    if (!b.id) return NextResponse.json({ error: "Falta el id o cuenta_cobro_id" }, { status: 400 });
    // Borrado de UN pago: registrar valor y cuenta.
    const { data: pago } = await sb.from("pagos").select("cuenta_cobro_id,valor,fecha,metodo").eq("id", b.id).single();
    const r = pago ? await resumenCuenta(sb, pago.cuenta_cobro_id) : null;
    const { error } = await sb.from("pagos").delete().eq("id", b.id);
    if (error) throw error;
    await logActividad({
      tipo: "Pago eliminado",
      descripcion: pago && r ? `Pago de ${fmtPesosLog(pago.valor)} eliminado — CC #${r.consecutivo} · ${r.cliente}` : "Pago eliminado",
      entidad: "pago", entidad_id: r?.consecutivo ?? b.id, detalle: { pago, cuenta: r },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
