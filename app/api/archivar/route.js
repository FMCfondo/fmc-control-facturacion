import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "archivos";
const CT = {
  xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

// POST { cc, files:[{name, base64, bookType}] } → sube los archivos del lote a Storage.
export async function POST(request) {
  try {
    const { cc, files } = await request.json();
    if (!cc || !Array.isArray(files)) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    const ccNum = Number(cc);
    if (!Number.isInteger(ccNum) || ccNum <= 0) return NextResponse.json({ error: "cc inválido" }, { status: 400 });
    const sb = supabaseAdmin();
    // Asegurar el bucket (ignora error si ya existe).
    try { await sb.storage.createBucket(BUCKET, { public: false }); } catch (_) {}

    for (const f of files) {
      const nombre = String(f.name || "");
      // Evitar path traversal: el nombre debe ser un archivo simple, sin rutas.
      if (!nombre || /[\\/]|\.\./.test(nombre)) return NextResponse.json({ error: "Nombre de archivo inválido" }, { status: 400 });
      const buf = Buffer.from(String(f.base64).split(",").pop(), "base64");
      const { error } = await sb.storage.from(BUCKET).upload(`lotes/${ccNum}/${nombre}`, buf, {
        contentType: CT[f.bookType] || CT.xlsx, upsert: true,
      });
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
