"use client";
import { useEffect, useMemo, useState } from "react";

const COLOR = {
  "Lote generado": "#1a3a8f", "Cuenta creada": "#0e7490", "Cuenta modificada": "#b45309",
  "Cuenta eliminada": "#dc2626", "Pago registrado": "#166534", "Correo enviado": "#7e22ce", "Descarga": "#475569",
};
const fmt = (d) => new Date(d).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

export default function Actividad() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/actividad", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setItems(d.actividad || []); })
      .catch((e) => setErr(e.message));
  }, []);

  const tipos = useMemo(() => [...new Set(items.map((i) => i.tipo))], [items]);
  const filtrados = items.filter((i) =>
    (!fTipo || i.tipo === fTipo) &&
    (!q || (i.descripcion || "").toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Control de actividad</h1>
        <p>Bitácora de todo lo que ocurre en el sistema: lotes generados, cambios, pagos, correos y descargas.</p>
      </div>

      {err && <div className="err">Error: {err}</div>}

      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="fld">Tipo
          <select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="">Todos</option>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="fld" style={{ flex: 1, minWidth: 200 }}>Buscar
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 descripción…" />
        </label>
      </div>

      <div className="card">
        <h2>Eventos ({filtrados.length})</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Descripción</th></tr></thead>
            <tbody>
              {filtrados.map((i) => (
                <tr key={i.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmt(i.creado_en)}</td>
                  <td><span style={{ background: (COLOR[i.tipo] || "#475569") + "22", color: COLOR[i.tipo] || "#475569", padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{i.tipo}</span></td>
                  <td style={{ whiteSpace: "normal" }}>{i.descripcion}</td>
                </tr>
              ))}
              {filtrados.length === 0 && <tr><td colSpan={3} style={{ color: "#64748b" }}>Sin eventos todavía.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .fld{display:flex;flex-direction:column;font-size:12px;font-weight:600;color:#334155;gap:5px}
        .fld select,.fld input{padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;font-weight:400}
      `}</style>
    </div>
  );
}
