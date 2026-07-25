"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtPesos, fmtFecha } from "../../lib/format";

const CUAT = { 1: "1° cuat (Ene–Abr)", 2: "2° cuat (May–Ago)", 3: "3° cuat (Sep–Dic)" };
const cuatDeMes = (m) => (m ? Math.ceil(m / 4) : 0);
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function FacturasVenta() {
  const [cuentas, setCuentas] = useState([]);
  const [params, setParams] = useState({ iva: 0.19, admin_socia: 0.13, admin_no_socia: 0.17 });
  const [err, setErr] = useState("");
  const [cargando, setCargando] = useState(true);
  const [fAnio, setFAnio] = useState("");
  const [fMes, setFMes] = useState("");
  const [filtros, setFiltros] = useState({});
  const setF = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch("/api/facturas-venta", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setCuentas(d.cuentas || []); if (d.params) setParams(d.params); })
      .catch((e) => setErr(e.message))
      .finally(() => setCargando(false));
  }, []);

  // Mes efectivo: del campo mes o derivado de la fecha (para el histórico).
  const mesDe = (c) => c.mes || (c.fecha ? parseInt(String(c.fecha).slice(5, 7)) : 0);

  const filas = useMemo(() => cuentas.map((c) => {
    const base = c.valor / (1 + params.iva);
    const iva = c.valor - base;
    const pctAdmin = c.es_socia ? params.admin_socia : params.admin_no_socia;
    const admin = c.esMutual ? base * pctAdmin : 0;
    const reserva = c.esMutual ? base - admin : 0;
    const cuat = c.cuatrimestreManual || cuatDeMes(mesDe(c)); // override manual o derivado
    return { ...c, base, iva, admin, reserva, cuat, cuatAuto: cuatDeMes(mesDe(c)), mesNum: mesDe(c) };
  }), [cuentas, params]);

  const anios = [...new Set(filas.map((f) => f.anio).filter(Boolean))].sort((a, b) => b - a);

  // Filtro por columna (contains) + año + cuatrimestre
  const txt = (f, k) => {
    switch (k) {
      case "cc": return f.cc; case "fecha": return fmtFecha(f.fecha); case "cliente": return f.cliente;
      case "rango": return f.fi && f.ff ? `${f.fi}-${f.ff}` : ""; case "valor": return f.valor;
      case "base": return f.base; case "iva": return f.iva; case "admin": return f.admin; case "reserva": return f.reserva;
      default: return "";
    }
  };
  const filtradas = filas.filter((f) =>
    (!fAnio || String(f.anio) === fAnio) &&
    (!fMes || String(f.mesNum) === fMes) &&
    (!filtros.cuat || String(f.cuat) === filtros.cuat) &&
    Object.entries(filtros).every(([k, v]) => {
      if (!v || k === "cuat") return true;
      return String(txt(f, k)).toLowerCase().includes(String(v).toLowerCase());
    })
  );

  const resumen = [1, 2, 3].map((c) => {
    const g = filtradas.filter((f) => f.cuat === c);
    return { cuat: c, n: g.length, base: g.reduce((s, f) => s + f.base, 0), iva: g.reduce((s, f) => s + f.iva, 0), reserva: g.reduce((s, f) => s + f.reserva, 0) };
  });
  const suma = (k) => filtradas.reduce((s, f) => s + (f[k] || 0), 0);
  const totFacturado = suma("valor"), totBase = suma("base");
  const totIva = suma("iva"), totAdmin = suma("admin"), totReserva = suma("reserva");

  async function cambiarCuat(id, val) {
    const cuatrimestre = val ? Number(val) : null;
    setCuentas((cs) => cs.map((c) => (c.id === id ? { ...c, cuatrimestreManual: cuatrimestre } : c)));
    await fetch("/api/cuenta-cobro", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, cuatrimestre }),
    });
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Facturas de venta</h1>
        <p>Reserva e IVA por cliente/intermediario (control contable)</p>
      </div>

      {err && <div className="err">Error: {err}</div>}

      <div className="card filtro-bar">
        <div className="fgrupo">
          <span className="flab">Año</span>
          <div className="chips">
            <button className={"chip" + (!fAnio ? " on" : "")} onClick={() => setFAnio("")}>Todos</button>
            {anios.map((a) => (
              <button key={a} className={"chip" + (fAnio === String(a) ? " on" : "")} onClick={() => setFAnio(String(a))}>{a}</button>
            ))}
          </div>
        </div>
        <div className="fgrupo">
          <span className="flab">Mes</span>
          <div className="chips">
            <button className={"chip" + (!fMes ? " on" : "")} onClick={() => setFMes("")}>Todos</button>
            {MESES.map((m, i) => (
              <button key={m} className={"chip chip-mes mes-row-" + (i + 1) + (fMes === String(i + 1) ? " on" : "")}
                onClick={() => setFMes(fMes === String(i + 1) ? "" : String(i + 1))}>{m}</button>
            ))}
          </div>
        </div>
        <div className="fgrupo">
          <span className="flab">Cuatrimestre</span>
          <div className="chips">
            <button className={"chip" + (!filtros.cuat ? " on" : "")} onClick={() => setF("cuat", "")}>Todos</button>
            {[1, 2, 3].map((c) => (
              <button key={c} className={"chip chip-cuat cuat-" + c + (filtros.cuat === String(c) ? " on" : "")}
                onClick={() => setF("cuat", filtros.cuat === String(c) ? "" : String(c))}>{c}°</button>
            ))}
          </div>
        </div>
        {(fAnio || fMes || filtros.cuat) && (
          <button className="logout" onClick={() => { setFAnio(""); setFMes(""); setF("cuat", ""); }}>Limpiar filtros</button>
        )}
      </div>

      {/* Totales del periodo seleccionado */}
      <div className="cards">
        <div className="kpi destacado">
          <div className="label">Total facturado (c/IVA)</div>
          <div className="value">{fmtPesos(totFacturado)}</div>
          <div className="sub">{filtradas.length} cuenta(s) de cobro</div>
        </div>
        <div className="kpi"><div className="label">Base (sin IVA)</div><div className="value">{fmtPesos(totBase)}</div></div>
        <div className="kpi"><div className="label">Total IVA</div><div className="value">{fmtPesos(totIva)}</div></div>
        <div className="kpi"><div className="label">Administración</div><div className="value">{fmtPesos(totAdmin)}</div></div>
        <div className="kpi"><div className="label">Total reserva</div><div className="value">{fmtPesos(totReserva)}</div></div>
      </div>

      {/* IVA por cuatrimestre */}
      <div className="cards">
        {resumen.map((r) => (
          <div className={"kpi cuat-" + r.cuat} key={r.cuat}>
            <div className="label">{CUAT[r.cuat]}</div>
            <div className="value">{fmtPesos(r.iva)}</div>
            <div className="sub">IVA · {r.n} cuentas · base {fmtPesos(r.base)}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2>Por cliente / intermediario ({filtradas.length})</h2>
        <div className="leyenda">
          {["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"].map((m, i) => (
            <span key={m} className={"mes-row-" + (i + 1)}>{m}</span>
          ))}
        </div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>CC</th><th>Fecha</th><th>Cuat.</th><th>Cliente / Mutual</th><th>Rango facturas</th>
                <th>Valor c/IVA</th><th>Base</th><th>IVA</th><th>Admin</th><th>Reserva</th>
              </tr>
              <tr className="filtros">
                <th><input value={filtros.cc || ""} onChange={(e) => setF("cc", e.target.value)} placeholder="🔍" /></th>
                <th><input value={filtros.fecha || ""} onChange={(e) => setF("fecha", e.target.value)} placeholder="dd/mm/aaaa" /></th>
                <th>
                  <select value={filtros.cuat || ""} onChange={(e) => setF("cuat", e.target.value)}>
                    <option value="">Todos</option><option value="1">1°</option><option value="2">2°</option><option value="3">3°</option>
                  </select>
                </th>
                <th><input value={filtros.cliente || ""} onChange={(e) => setF("cliente", e.target.value)} placeholder="🔍" /></th>
                <th><input value={filtros.rango || ""} onChange={(e) => setF("rango", e.target.value)} placeholder="🔍" /></th>
                <th><input value={filtros.valor || ""} onChange={(e) => setF("valor", e.target.value)} placeholder="🔍" /></th>
                <th><input value={filtros.base || ""} onChange={(e) => setF("base", e.target.value)} placeholder="🔍" /></th>
                <th><input value={filtros.iva || ""} onChange={(e) => setF("iva", e.target.value)} placeholder="🔍" /></th>
                <th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--gris)", padding: 24 }}>Cargando…</td></tr>}
              {!cargando && filtradas.length === 0 && <tr><td colSpan={10} style={{ color: "var(--gris)", padding: 16 }}>Sin datos.</td></tr>}
              {filtradas.map((f) => (
                <tr key={f.id} className={"mes-row-" + f.mesNum}>
                  <td>{f.cc}</td>
                  <td>{fmtFecha(f.fecha)}</td>
                  <td>
                    <select className={"cuat-sel cuat-" + f.cuat} value={f.cuatrimestreManual || ""} onChange={(e) => cambiarCuat(f.id, e.target.value)} title={f.cuatrimestreManual ? "Manual" : "Auto (" + (f.cuatAuto || "—") + ")"}>
                      <option value="">Auto {f.cuatAuto ? `(${f.cuatAuto}°)` : ""}</option>
                      <option value="1">1°</option><option value="2">2°</option><option value="3">3°</option>
                    </select>
                  </td>
                  <td>{f.cliente}</td>
                  <td>{f.fi && f.ff ? `${f.fi}–${f.ff}` : "—"}</td>
                  <td className="num">{fmtPesos(f.valor)}</td>
                  <td className="num">{fmtPesos(f.base)}</td>
                  <td className={"num colcuat ivastrong cuat-" + f.cuat}>{fmtPesos(f.iva)}</td>
                  <td className={"num colcuat cuat-" + f.cuat}>{f.esMutual ? fmtPesos(f.admin) : "—"}</td>
                  <td className={"num colcuat cuat-" + f.cuat}><b>{f.esMutual ? fmtPesos(f.reserva) : "—"}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .fld{display:flex;flex-direction:column;font-size:12px;font-weight:600;color:#334155;gap:5px}
        .fld select{padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;font-weight:400;min-width:140px}
        /* ── Barra de filtros con chips ── */
        .filtro-bar{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
        .fgrupo{display:flex;flex-direction:column;gap:6px}
        .flab{font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--gris)}
        .chips{display:flex;flex-wrap:wrap;gap:5px}
        .chip{border:1px solid var(--borde);background:#fff;color:var(--gris-osc);border-radius:8px;padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;transition:all .12s;font-family:inherit}
        .chip:hover{border-color:var(--azul);color:var(--azul-osc)}
        .chip.on{background:var(--azul-osc);border-color:var(--azul-osc);color:#fff}
        /* El chip de mes conserva su color de mes (igual que las filas); el activo se marca con anillo dorado */
        .chip-mes{color:var(--gris-osc)}
        .chip-mes.on{box-shadow:inset 0 0 0 2px var(--dorado);color:var(--azul-osc);font-weight:700}
        .chip-cuat.cuat-1{border-color:#93c5fd}.chip-cuat.cuat-2{border-color:#fdba74}.chip-cuat.cuat-3{border-color:#86efac}
        .chip-cuat.cuat-1.on{background:#3b82f6;border-color:#3b82f6}
        .chip-cuat.cuat-2.on{background:#f97316;border-color:#f97316}
        .chip-cuat.cuat-3.on{background:#22c55e;border-color:#22c55e}
        .kpi.destacado{border-left:5px solid var(--dorado);background:linear-gradient(180deg,#fffdf7,#fff)}
        tr.filtros th{background:#eef2f7;position:sticky;top:31px;padding:4px 6px;z-index:1}
        tr.filtros input,tr.filtros select{width:100%;min-width:60px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;font-size:11px;font-weight:400;color:#1a1a2e}
        .kpi.cuat-1{border-left:5px solid #3b82f6}
        .kpi.cuat-2{border-left:5px solid #f97316}
        .kpi.cuat-3{border-left:5px solid #22c55e}
        .cuat-sel{border:1px solid #cbd5e1;border-radius:6px;padding:2px 4px;font-size:11px;font-weight:700;color:#fff;cursor:pointer}
        .cuat-sel.cuat-1{background:#3b82f6}.cuat-sel.cuat-2{background:#f97316}.cuat-sel.cuat-3{background:#22c55e}.cuat-sel.cuat-0{background:#94a3b8}
        /* Color de fila por mes (tonos serios y empresariales) */
        .mes-row-1{background:#dde6f2 !important}   /* Ene · azul marino */
        .mes-row-2{background:#e1ebe0 !important}   /* Feb · verde militar */
        .mes-row-3{background:#f0dfe3 !important}   /* Mar · vinotinto */
        .mes-row-4{background:#e3e8ee !important}   /* Abr · gris azulado */
        .mes-row-5{background:#f1e8d4 !important}   /* May · ocre */
        .mes-row-6{background:#d9eae9 !important}   /* Jun · petróleo */
        .mes-row-7{background:#e8e0f0 !important}   /* Jul · púrpura */
        .mes-row-8{background:#f0e3d8 !important}   /* Ago · terracota */
        .mes-row-9{background:#dceadf !important}   /* Sep · verde bosque */
        .mes-row-10{background:#e0e2f1 !important}  /* Oct · índigo */
        .mes-row-11{background:#ece1d4 !important}  /* Nov · canela */
        .mes-row-12{background:#e2e6ea !important}  /* Dic · pizarra */
        /* Las 3 columnas IVA/Admin/Reserva conservan su color por cuatrimestre */
        td.colcuat.cuat-1{background:#eaf2fd}
        td.colcuat.cuat-2{background:#fdf0e3}
        td.colcuat.cuat-3{background:#eafaef}
        td.colcuat.cuat-0{background:#eef1f6}
        td.colcuat.ivastrong{font-weight:700}
        td.colcuat.ivastrong.cuat-1{background:#bfdbfe}
        td.colcuat.ivastrong.cuat-2{background:#fed7aa}
        td.colcuat.ivastrong.cuat-3{background:#bbf7d0}
        /* Leyenda de meses */
        .leyenda{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
        .leyenda span{font-size:11px;padding:3px 9px;border-radius:6px;font-weight:600;color:#334155}
      `}</style>
    </div>
  );
}
