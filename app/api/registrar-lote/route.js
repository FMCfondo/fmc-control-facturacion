import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad } from "../../../lib/actividad";

// Columnas que se permiten insertar (evita mass assignment desde el cliente).
const CAMPOS_CUENTA = [
  "consecutivo", "tipo", "mutual_id", "cliente_nombre", "cliente_nit", "cliente_direccion",
  "cliente_correo", "mes", "anio", "fecha_elaboracion", "fecha_vencimiento", "factura_inicial",
  "factura_final", "num_facturas", "valor_facturado", "valor_recibido", "reserva_individual",
  "administracion", "iva", "anticipos", "cuatrimestre", "estado", "documento_nombre", "notas", "origen",
];
const CAMPOS_FACTURA = ["consecutivo", "cedula", "nombre", "email", "telefono", "ciudad_depto", "cod_ciudad", "valor_comision", "valor_base"];
const pick = (obj, campos) => { const o = {}; for (const k of campos) if (obj?.[k] !== undefined) o[k] = obj[k]; return o; };

// POST → crea la cuenta de cobro + sus facturas (detalle por asociado) en una operación.
// Body: { cuenta: {...}, facturas: [...] }
export async function POST(request) {
  try {
    const { cuenta, facturas } = await request.json();
    if (!cuenta || !cuenta.consecutivo) {
      return NextResponse.json({ error: "Faltan datos de la cuenta de cobro" }, { status: 400 });
    }
    const datosCuenta = pick(cuenta, CAMPOS_CUENTA);
    const sb = supabaseAdmin();

    // Evitar duplicar el consecutivo (por si dos personas generan a la vez).
    const { data: existe } = await sb
      .from("cuentas_cobro").select("id").eq("consecutivo", cuenta.consecutivo).maybeSingle();
    if (existe) {
      return NextResponse.json(
        { error: `El consecutivo de cuenta de cobro ${cuenta.consecutivo} ya existe. Refresca para tomar el siguiente.` },
        { status: 409 }
      );
    }

    const { data: cc, error: e1 } = await sb
      .from("cuentas_cobro").insert(datosCuenta).select("id").single();
    if (e1) throw e1;

    if (Array.isArray(facturas) && facturas.length) {
      const filas = facturas.map((f) => ({ ...pick(f, CAMPOS_FACTURA), cuenta_cobro_id: cc.id }));
      const { error: e2 } = await sb.from("facturas_siigo").insert(filas);
      if (e2) {
        // rollback manual de la cuenta si fallan las facturas
        await sb.from("cuentas_cobro").delete().eq("id", cc.id);
        throw e2;
      }
    }
    await logActividad({
      tipo: "Lote generado",
      descripcion: `Cuenta de cobro #${cuenta.consecutivo} generada con ${facturas?.length || 0} factura(s)`,
      entidad: "cuenta_cobro", entidad_id: cuenta.consecutivo,
      detalle: { facturas: facturas?.length || 0, valor: cuenta.valor_facturado },
    });
    return NextResponse.json({ ok: true, cuenta_cobro_id: cc.id });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
