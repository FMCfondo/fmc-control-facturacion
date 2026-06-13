import { supabaseAdmin } from "../lib/supabase";
import { fmtPesos, fmtFecha } from "../lib/format";
import LogoutButton from "./LogoutButton";

// Server component: lee directo de Supabase en el servidor (service role, nunca llega al navegador).
// Cuando agreguemos Supabase Auth, esto pasará a usar la sesión del usuario.
export const dynamic = "force-dynamic";

async function getData() {
  const sb = supabaseAdmin();
  const [ccRes, mutRes] = await Promise.all([
    sb.from("cuentas_cobro").select("*")
      .order("anio", { ascending: false })
      .order("mes", { ascending: false, nullsFirst: false })
      .order("consecutivo", { ascending: false }),
    sb.from("mutuales").select("nombre,nombre_corto,es_socia"),
  ]);
  if (ccRes.error) throw ccRes.error;
  return { cuentas: ccRes.data || [], mutuales: mutRes.data || [] };
}

export default async function Dashboard() {
  let data, error;
  try { data = await getData(); } catch (e) { error = e.message; }

  return (
    <div className="wrap">
      <div className="header">
        <div className="header-row">
          <div>
            <h1>Control de Facturación</h1>
            <p>Fondo Mutuo de Cobertura S.A.S — Tablero de cuentas de cobro</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a className="btn-primary" href="/generar">+ Generar facturación</a>
            <LogoutButton />
          </div>
        </div>
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
  const total = cuentas.reduce((s, c) => s + (Number(c.valor_facturado) || 0), 0);
  const recibido = cuentas.reduce((s, c) => s + (Number(c.valor_recibido) || 0), 0);
  const saldo = total - recibido;
  const pendientes = cuentas.filter((c) => c.estado !== "pago").length;
  const sociasMap = Object.fromEntries((mutuales || []).map((m) => [m.nombre, m.es_socia]));

  return (
    <>
      <div className="cards">
        <Kpi label="Cuentas de cobro" value={cuentas.length} sub="registros migrados" />
        <Kpi label="Total facturado" value={fmtPesos(total)} />
        <Kpi label="Total recibido" value={fmtPesos(recibido)} />
        <Kpi label="Saldo pendiente" value={fmtPesos(saldo)} sub={`${pendientes} sin saldar`} />
        <Kpi label="Mutuales" value={mutuales.length} />
      </div>

      <div className="card">
        <h2>Cuentas de cobro ({cuentas.length})</h2>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>CC #</th><th>Tipo</th><th>Cliente / Mutual</th><th>Mes</th><th>Año</th>
                <th>Fecha</th><th>Rango facturas</th><th>N°</th>
                <th>Facturado</th><th>Recibido</th><th>Saldo</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => (
                <tr key={c.id}>
                  <td>{c.consecutivo}</td>
                  <td><span className={"tag " + (c.tipo === "irregular" ? "irregular" : "")}>{c.tipo}</span></td>
                  <td>{c.cliente_nombre || c.documento_nombre?.split("MUTUAL ")[1] || "—"}</td>
                  <td>{c.mes ?? ""}</td>
                  <td>{c.anio}</td>
                  <td>{fmtFecha(c.fecha_elaboracion)}</td>
                  <td>{c.factura_inicial && c.factura_final ? `${c.factura_inicial}–${c.factura_final}` : "—"}</td>
                  <td className="num">{c.num_facturas ?? ""}</td>
                  <td className="num">{fmtPesos(c.valor_facturado)}</td>
                  <td className="num">{fmtPesos(c.valor_recibido)}</td>
                  <td className="num">{fmtPesos(c.saldo)}</td>
                  <td><span className={"badge " + c.estado}>{c.estado}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, sub }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
