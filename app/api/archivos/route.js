import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad } from "../../../lib/actividad";

export const dynamic = "force-dynamic";
const BUCKET = "archivos";

// GET           → lista de lotes (cuentas generadas por la app) con sus datos.
// GET ?cc=N     → URLs firmadas de los archivos de ese lote (y registra la descarga).
export async function GET(request) {
  try {
    const cc = new URL(request.url).searchParams.get("cc");
    const sb = supabaseAdmin();

    if (cc) {
      const ccNum = Number(cc);
      if (!Number.isInteger(ccNum) || ccNum <= 0) return NextResponse.json({ error: "cc inválido" }, { status: 400 });
      const { data: files, error } = await sb.storage.from(BUCKET).list(`lotes/${ccNum}`);
      if (error) throw error;
      const archivos = [];
      for (const f of files || []) {
        const { data } = await sb.storage.from(BUCKET).createSignedUrl(`lotes/${ccNum}/${f.name}`, 600);
        if (data?.signedUrl) archivos.push({ name: f.name, url: data.signedUrl });
      }
      await logActividad({ tipo: "Descarga", descripcion: `Descarga de archivos SIIGO del lote #${ccNum}`, entidad: "cuenta_cobro", entidad_id: ccNum });
      return NextResponse.json({ archivos });
    }

    const { data, error } = await sb.from("cuentas_cobro")
      .select("consecutivo,fecha_elaboracion,anio,mes,mutuales(nombre)")
      .eq("origen", "app").order("consecutivo", { ascending: false });
    if (error) throw error;
    const lotes = (data || []).map((c) => ({
      cc: c.consecutivo, fecha: c.fecha_elaboracion, anio: c.anio, mes: c.mes,
      cliente: c.mutuales?.nombre || "—",
    }));
    return NextResponse.json({ lotes });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
