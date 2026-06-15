"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtPesos, fmtFecha } from "../../lib/format";

const CUAT = { 1: "1° cuat (Ene–Abr)", 2: "2° cuat (May–Ago)", 3: "3° cuat (Sep–Dic)" };
const cuatDeMes = (m) => (m ? Math.ceil(m / 4) : 0);

export default function FacturasVenta() {
  const [cuentas, setCuentas] = useState([]);
  const [params, setParams] = useState({ iva: 0.19, admin_socia: 0.13, admin_no_socia: 0.17 });
  const [err, setErr] = useState("");
  const [fAnio, setFAnio] = useState("");
  const [filtros, setFiltros] = useState({});
  const setF = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch("/api/facturas-venta", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setCuentas(d.cuentas || []); if (d.params) setParams(d.params); })
      .catch((e) => setErr(e.message));
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
    return { ...c, base, iva, admin, reserva, cuat, cuatAuto: cuatDeMes(mesDe(c)) };
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
  const totIva = filtradas.reduce((s, f) => s + f.iva, 0);
  const totReserva = filtradas.reduce((s, f) => s + f.reserva, 0);

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

      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="fld">Año
          <select value={fAnio} onChange={(e) => setFAnio(e.target.value)}>
            <option value="">Todos</option>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <div style={{ fontSize: 12, color: "#64748b", alignSelf: "center" }}>Usa los filtros bajo cada columna para afinar la búsqueda.</div>
      </div>

      <div className="cards">
        {resumen.map((r) => (
          <div className={"kpi cuat-" + r.cuat} key={r.cuat}>
            <div className="label">{CUAT[r.cuat]}</div>
            <div className="value">{fmtPesos(r.iva)}</div>
            <div className="sub">IVA · {r.n} cuentas · base {fmtPesos(r.base)}</div>
          </div>
        ))}
        <div className="kpi"><div className="label">Total IVA</div><div className="value">{fmtPesos(totIva)}</div></div>
        <div className="kpi"><div className="label">Total reserva</div><div className="value">{fmtPesos(totReserva)}</div></div>
      </div>

      <div className="card">
        <h2>Por cliente / intermediario ({filtradas.length})</h2>
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
              {filtradas.map((f) => (
                <tr key={f.id} className={"cuat-row-" + f.cuat}>
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
                  <td className={"num iva-cell cuat-" + f.cuat}>{fmtPesos(f.iva)}</td>
                  <td className="num">{f.esMutual ? fmtPesos(f.admin) : "—"}</td>
                  <td className="num"><b>{f.esMutual ? fmtPesos(f.reserva) : "—"}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .fld{display:flex;flex-direction:column;font-size:12px;font-weight:600;color:#334155;gap:5px}
        .fld select{padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;font-weight:400;min-width:140px}
        tr.filtros th{background:#eef2f7;position:sticky;top:31px;padding:4px 6px;z-index:1}
        tr.filtros input,tr.filtros select{width:100%;min-width:60px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;font-size:11px;font-weight:400;color:#1a1a2e}
        .kpi.cuat-1{border-left:5px solid #3b82f6}
        .kpi.cuat-2{border-left:5px solid #f97316}
        .kpi.cuat-3{border-left:5px solid #22c55e}
        .cuat-sel{border:1px solid #cbd5e1;border-radius:6px;padding:2px 4px;font-size:11px;font-weight:700;color:#fff;cursor:pointer}
        .cuat-sel.cuat-1{background:#3b82f6}.cuat-sel.cuat-2{background:#f97316}.cuat-sel.cuat-3{background:#22c55e}.cuat-sel.cuat-0{background:#94a3b8}
        .cuat-row-1{background:#eff6ff !important}
        .cuat-row-2{background:#fff7ed !important}
        .cuat-row-3{background:#f0fdf4 !important}
        /* Columna IVA con color más fuerte */
        td.iva-cell.cuat-1{background:#bfdbfe;font-weight:700}
        td.iva-cell.cuat-2{background:#fed7aa;font-weight:700}
        td.iva-cell.cuat-3{background:#bbf7d0;font-weight:700}
        td.iva-cell.cuat-0{background:#e2e8f0}
      `}</style>
    </div>
  );
}
