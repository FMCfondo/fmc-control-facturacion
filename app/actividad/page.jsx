"use client";
import { useEffect, useMemo, useState, Fragment } from "react";

const COLOR = {
  "Lote generado": "#1a3a8f", "Cuenta creada": "#0e7490", "Cuenta modificada": "#b45309",
  "Cuenta eliminada": "#dc2626", "Pago registrado": "#166534", "Pago eliminado": "#b91c1c",
  "Pagos eliminados": "#b91c1c", "Correo enviado": "#7e22ce", "Descarga": "#475569",
  "Mutual creada": "#0891b2", "Mutual modificada": "#a16207", "Config actualizada": "#7c3aed", "Parámetros": "#0f766e",
};
const fmt = (d) => new Date(d).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

// Etiquetas legibles para las claves del detalle.
const ETIQUETAS = {
  consecutivo: "CC #", cliente: "Cliente / mutual", valor: "Valor", mes: "Mes", anio: "Año", tipo: "Tipo",
  cambios: "Campos cambiados", cuenta: "Cuenta", facturas: "Facturas", rango: "Rango facturas", fecha: "Fecha",
  metodo: "Método", notas: "Notas", cantidad: "Cantidad de pagos", total: "Total", pago: "Pago", para: "Para",
  cc: "Copia (CC)", periodo: "Periodo", email: "Correo", cuenta_cobro_id: "ID cuenta", valor_facturado: "Valor facturado",
};
const etiqueta = (k) => ETIQUETAS[k] || k;
const ES_MONEDA = ["valor", "total", "valor_facturado"];

function Detalle({ d, nivel = 0 }) {
  if (d === null || typeof d !== "object") return <span>{String(d ?? "—")}</span>;
  const entries = Object.entries(d).filter(([, v]) => v !== undefined);
  if (!entries.length) return <span style={{ color: "var(--gris)" }}>—</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "3px 14px", fontSize: 12.5, marginLeft: nivel ? 10 : 0 }}>
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <div style={{ color: "var(--gris)", fontWeight: 600 }}>{etiqueta(k)}</div>
          <div style={{ color: "#2b3447", minWidth: 0, wordBreak: "break-word" }}>
            {v && typeof v === "object"
              ? (Array.isArray(v) ? (v.length ? v.join(", ") : "—") : <Detalle d={v} nivel={nivel + 1} />)
              : (ES_MONEDA.includes(k) && typeof v === "number" ? "$" + v.toLocaleString("es-CO") : (v === null || v === "" ? "—" : String(v)))}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export default function Actividad() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [cargando, setCargando] = useState(true);
  const [fTipo, setFTipo] = useState("");
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    fetch("/api/actividad", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setItems(d.actividad || []); })
      .catch((e) => setErr(e.message))
      .finally(() => setCargando(false));
  }, []);

  const tipos = useMemo(() => [...new Set(items.map((i) => i.tipo))], [items]);
  const filtrados = items.filter((i) =>
    (!fTipo || i.tipo === fTipo) &&
    (!q || `${i.descripcion || ""} ${i.usuario || ""}`.toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Control de actividad</h1>
        <p>Bitácora de todo lo que ocurre en el sistema. Haz clic en un evento para ver su detalle completo.</p>
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 descripción o usuario…" />
        </label>
      </div>

      <div className="card">
        <h2>Eventos ({filtrados.length})</h2>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th style={{ width: 26 }}></th><th>Fecha y hora</th><th>Usuario</th><th>Tipo</th><th>Descripción</th></tr></thead>
            <tbody>
              {filtrados.map((i) => {
                const tieneDetalle = i.detalle || i.entidad;
                const open = abierto === i.id;
                return (
                  <Fragment key={i.id}>
                    <tr onClick={() => tieneDetalle && setAbierto(open ? null : i.id)} style={{ cursor: tieneDetalle ? "pointer" : "default" }}>
                      <td style={{ textAlign: "center", color: "var(--gris)" }}>{tieneDetalle ? (open ? "▾" : "▸") : ""}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{fmt(i.creado_en)}</td>
                      <td style={{ whiteSpace: "nowrap", color: "var(--gris-osc)" }}>{i.usuario || "—"}</td>
                      <td><span style={{ background: (COLOR[i.tipo] || "#475569") + "22", color: COLOR[i.tipo] || "#475569", padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{i.tipo}</span></td>
                      <td style={{ whiteSpace: "normal" }}>{i.descripcion}</td>
                    </tr>
                    {open && (
                      <tr>
                        <td></td>
                        <td colSpan={4} style={{ background: "#f8fafc", padding: "12px 16px", whiteSpace: "normal" }}>
                          <Detalle d={i.detalle} />
                          {(i.entidad || i.entidad_id) && (
                            <div style={{ marginTop: 10, fontSize: 11, color: "var(--gris)" }}>
                              Referencia: {i.entidad || "—"}{i.entidad_id ? ` #${i.entidad_id}` : ""}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {cargando && <tr><td colSpan={5} style={{ textAlign: "center", color: "#64748b", padding: 24 }}>Cargando…</td></tr>}
              {!cargando && filtrados.length === 0 && <tr><td colSpan={5} style={{ color: "#64748b" }}>Sin eventos todavía.</td></tr>}
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
