import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { leerTodoEstricto } from "../../../lib/db";
import { requireUser } from "../../../lib/requireUser";

export const dynamic = "force-dynamic";

// Tablas del respaldo, con su llave primaria (necesaria para paginar de forma estable).
// `actividad` se incluye para que el respaldo sea completo: la bitácora es parte
// de la trazabilidad del sistema.
const TABLAS = [
  { nombre: "cuentas_cobro", clave: "id", orden: [{ col: "consecutivo" }] },
  { nombre: "facturas_siigo", clave: "id", orden: [{ col: "consecutivo" }] },
  { nombre: "pagos", clave: "id", orden: [{ col: "fecha" }] },
  { nombre: "notas_ajuste", clave: "id", orden: [{ col: "fecha" }] },
  { nombre: "mutuales", clave: "id", orden: [{ col: "nombre" }] },
  { nombre: "items_cuenta_cobro", clave: "id", orden: [] },
  { nombre: "config", clave: "clave", orden: [] },
  { nombre: "parametros", clave: "clave", orden: [] },
  { nombre: "actividad", clave: "id", orden: [{ col: "creado_en" }] },
];

// GET → todas las tablas, COMPLETAS, para respaldo/reportes.
// Usa `leerTodoEstricto`: si alguna tabla no se puede leer entera (por el tope
// "Max rows" de Supabase), devuelve un error en vez de un respaldo parcial que
// parecería completo. Un respaldo truncado en silencio es peor que ninguno.
export async function GET() {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const sb = supabaseAdmin();

    const partes = await Promise.all(
      TABLAS.map(async ({ nombre, clave, orden }) => [
        nombre,
        await leerTodoEstricto(sb, nombre, { clave, orden }),
      ])
    );

    const datos = Object.fromEntries(partes);
    // Conteos verificados: lo que el respaldo puede afirmar sin mentir.
    datos._verificado = Object.fromEntries(partes.map(([n, filas]) => [n, filas.length]));
    return NextResponse.json(datos);
  } catch (e) {
    console.error(e);
    // Este mensaje SÍ se muestra al operador: es accionable y no revela estructura interna.
    const incompleta = String(e?.message || "").startsWith("Lectura incompleta");
    return NextResponse.json(
      { error: incompleta ? e.message : "Error del servidor" },
      { status: incompleta ? 503 : 500 }
    );
  }
}
