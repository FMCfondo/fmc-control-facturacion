import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

const CAMPOS = ["nombre", "nombre_corto", "nit", "dv", "representante", "direccion", "ciudad", "telefono", "correo", "correos_envio", "correos_cc", "es_socia", "activa"];
const limpiar = (b) => {
  const o = {};
  for (const k of CAMPOS) if (b[k] !== undefined) o[k] = b[k] === "" ? null : b[k];
  return o;
};

export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("mutuales").select("*").order("nombre");
    if (error) throw error;
    return NextResponse.json({ mutuales: data });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const b = await request.json();
    const datos = limpiar(b);
    if (!datos.nombre) return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
    if (datos.activa === undefined) datos.activa = true;
    const sb = supabaseAdmin();
    const { data, error } = await sb.from("mutuales").insert(datos).select("id").single();
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const b = await request.json();
    if (!b.id) return NextResponse.json({ error: "Falta el id" }, { status: 400 });
    const sb = supabaseAdmin();
    const { error } = await sb.from("mutuales").update(limpiar(b)).eq("id", b.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
