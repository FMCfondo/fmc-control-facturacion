"use client";
import { useEffect, useMemo, useState } from "react";
import LogoutButton from "../LogoutButton";
import { fmtPesos, fmtFecha } from "../../lib/format";

const CUAT = { 1: "1° cuat (Ene–Abr)", 2: "2° cuat (May–Ago)", 3: "3° cuat (Sep–Dic)" };
const cuatDe = (mes) => (mes ? Math.ceil(mes / 4) : 0);

export default function FacturasVenta() {
  const [cuentas, setCuentas] = useState([]);
  const [params, setParams] = useState({ iva: 0.19, admin_socia: 0.13, admin_no_socia: 0.17 });
  const [err, setErr] = useState("");

  const [fAnio, setFAnio] = useState("");
  const [fCliente, setFCliente] = useState("");
  const [fCuat, setFCuat] = useState("");

  useEffect(() => {
    fetch("/api/facturas-venta", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setCuentas(d.cuentas || []); if (d.params) setParams(d.params); })
      .catch((e) => setErr(e.message));
  }, []);

  // Desglose por cuenta de cobro (cliente/intermediario)
  const filas = useMemo(() => cuentas.map((c) => {
    const base = c.valor / (1 + params.iva);
    const iva = c.valor - base;
    const pctAdmin = c.es_socia ? params.admin_socia : params.admin_no_socia;
    const admin = c.esMutual ? base * pctAdmin : 0;
    const reserva = c.esMutual ? base - admin : 0;
    return { ...c, base, iva, admin, reserva, cuat: cuatDe(c.mes) };
  }), [cuentas, params]);

  const anios = [...new Set(filas.map((f) => f.anio).filter(Boolean))].sort((a, b) => b - a);
  const clientes = [...new Set(filas.map((f) => f.cliente))].sort();

  const filtradas = filas.filter((f) =>
    (!fAnio || String(f.anio) === fAnio) &&
    (!fCliente || f.cliente === fCliente) &&
    (!fCuat || String(f.cuat) === fCuat)
  );

  // Resumen IVA por cuatrimestre
  const resumen = [1, 2, 3].map((c) => {
    const g = filtradas.filter((f) => f.cuat === c);
    return { cuat: c, n: g.length, base: g.reduce((s, f) => s + f.base, 0), iva: g.reduce((s, f) => s + f.iva, 0), reserva: g.reduce((s, f) => s + f.reserva, 0) };
  });
  const totIva = filtradas.reduce((s, f) => s + f.iva, 0);
  const totReserva = filtradas.reduce((s, f) => s + f.reserva, 0);

  return (
    <div className="wrap">
      <div className="header">
        <div className="header-row">
          <div><h1>Facturas de venta</h1><p>Reserva e IVA por cliente/intermediario (control contable)</p></div>
          <div style={{ display: "flex", gap: 8 }}>
            <a className="logout" href="/">← Tablero</a>
            <LogoutButton />
          </div>
        </div>
      </div>

      {err && <div className="err">Error: {err}</div>}

      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="fld">Año
          <select value={fAnio} onChange={(e) => setFAnio(e.target.value)}>
            <option value="">Todos</option>
            {anios.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="fld">Cliente / Mutual
          <select value={fCliente} onChange={(e) => setFCliente(e.target.value)}>
            <option value="">Todos</option>
            {clientes.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="fld">Cuatrimestre
          <select value={fCuat} onChange={(e) => setFCuat(e.target.value)}>
            <option value="">Todos</option>
            <option value="1">1° (Ene–Abr)</option><option value="2">2° (May–Ago)</option><option value="3">3° (Sep–Dic)</option>
          </select>
        </label>
      </div>

      {/* Resumen IVA por cuatrimestre */}
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

      {/* Detalle por cliente/intermediario */}
      <div className="card">
        <h2>Por cliente / intermediario ({filtradas.length})</h2>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr><th>CC</th><th>Fecha</th><th>Cuat.</th><th>Cliente / Mutual</th><th>Rango facturas</th><th>N°</th><th>Valor c/IVA</th><th>Base</th><th>IVA</th><th>Admin</th><th>Reserva</th></tr>
            </thead>
            <tbody>
              {filtradas.map((f) => (
                <tr key={f.id} className={"cuat-row-" + f.cuat}>
                  <td>{f.cc}</td>
                  <td>{fmtFecha(f.fecha)}</td>
                  <td><span className={"cuat-tag cuat-" + f.cuat}>{f.cuat || "—"}</span></td>
                  <td>{f.cliente}</td>
                  <td>{f.fi && f.ff ? `${f.fi}–${f.ff}` : "—"}</td>
                  <td className="num">{f.num ?? ""}</td>
                  <td className="num">{fmtPesos(f.valor)}</td>
                  <td className="num">{fmtPesos(f.base)}</td>
                  <td className="num">{fmtPesos(f.iva)}</td>
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
        .fld select{padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;font-weight:400;min-width:160px}
        .kpi.cuat-1{border-left:5px solid #3b82f6}
        .kpi.cuat-2{border-left:5px solid #f97316}
        .kpi.cuat-3{border-left:5px solid #22c55e}
        .cuat-tag{display:inline-block;width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;font-size:11px;font-weight:700;color:#fff}
        .cuat-tag.cuat-1{background:#3b82f6}.cuat-tag.cuat-2{background:#f97316}.cuat-tag.cuat-3{background:#22c55e}
        .cuat-row-1{background:#eff6ff !important}
        .cuat-row-2{background:#fff7ed !important}
        .cuat-row-3{background:#f0fdf4 !important}
      `}</style>
    </div>
  );
}
