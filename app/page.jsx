import { unstable_noStore as noStore } from "next/cache";
import { supabaseAdmin } from "../lib/supabase";
import CuentasManager from "./CuentasManager";

// Server component: lee directo de Supabase en el servidor (service role, nunca llega al navegador).
// Cuando agreguemos Supabase Auth, esto pasará a usar la sesión del usuario.
export const dynamic = "force-dynamic";

async function getData() {
  noStore();
  const sb = supabaseAdmin();
  const [ccRes, mutRes] = await Promise.all([
    sb.from("cuentas_cobro").select("*")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false, nullsFirst: false })
      .order("consecutivo", { ascending: false }),
    sb.from("mutuales").select("id,nombre,nombre_corto,es_socia").order("nombre"),
  ]);
  if (ccRes.error) throw ccRes.error;
  return { cuentas: ccRes.data || [], mutuales: mutRes.data || [] };
}

export default async function Dashboard() {
  let data, error;
  try { data = await getData(); } catch (e) { error = e.message; }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Tablero</h1>
        <p>Cuentas de cobro · seguimiento de cartera</p>
      </div>

      {error && (
        <div className="err">
          <strong>No se pudo conectar a la base de datos.</strong><br />
          {error}<br /><br />
          Verifica que las variables <code>NEXT_PUBLIC_SUPABASE_URL</code> y
          <code> SUPABASE_SERVICE_ROLE_KEY</code> estén configuradas y que ya hayas ejecutado
          los SQL (schema + seed + migración).
        </div>
      )}

      {data && <Contenido {...data} />}
    </div>
  );
}

function Contenido({ cuentas, mutuales }) {
  return <CuentasManager cuentas={cuentas} mutuales={mutuales} />;
}
