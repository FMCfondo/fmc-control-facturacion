"use client";
import { useEffect, useState } from "react";

const VACIA = { nombre: "", nombre_corto: "", nit: "", dv: "", representante: "", direccion: "", ciudad: "", telefono: "", correo: "", correos_envio: "", correos_cc: "", es_socia: false, activa: true };

export default function Clientes() {
  const [mutuales, setMutuales] = useState([]);
  const [fondo, setFondo] = useState({});
  const [params, setParams] = useState({});
  const [msg, setMsg] = useState("");
  const [msgP, setMsgP] = useState("");
  const [cargando, setCargando] = useState(true);

  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(VACIA);
  const [editId, setEditId] = useState(null);

  async function cargar() {
    const [m, c, p] = await Promise.all([
      fetch("/api/mutuales", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/config", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/parametros", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setMutuales(m.mutuales || []);
    setFondo(c.config || {});
    setParams(p.parametros || {});
    setCargando(false);
  }
  useEffect(() => { cargar(); }, []);

  async function guardarMora(e) {
    e.preventDefault(); setMsgP("");
    const res = await fetch("/api/parametros", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tasa_mora: params.tasa_mora || 0 }),
    });
    setMsgP(res.ok ? "✓ Guardado" : "✗ Error");
  }

  // ── Fondo ──
  const setFondoK = (k, v) => setFondo((f) => ({ ...f, [k]: v }));
  async function guardarFondo(e) {
    e.preventDefault(); setMsg("");
    const res = await fetch("/api/config", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fondo_nombre: fondo.fondo_nombre, fondo_nit: fondo.fondo_nit, fondo_direccion: fondo.fondo_direccion,
        fondo_correo: fondo.fondo_correo, fondo_telefono: fondo.fondo_telefono, firma_correo: fondo.firma_correo,
      }),
    });
    setMsg(res.ok ? "✓ Datos del Fondo guardados" : "✗ Error al guardar");
  }

  // ── Mutuales ──
  const nueva = () => { setForm(VACIA); setEditId(null); setAbierto(true); };
  const editar = (m) => {
    setForm({ ...VACIA, ...Object.fromEntries(Object.keys(VACIA).map((k) => [k, m[k] ?? VACIA[k]])) });
    setEditId(m.id); setAbierto(true);
  };
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function guardar(e) {
    e.preventDefault();
    const res = await fetch("/api/mutuales", {
      method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editId ? { id: editId, ...form } : form),
    });
    const out = await res.json();
    if (!res.ok) { alert(out.error); return; }
    setAbierto(false); cargar();
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Clientes y configuración</h1>
        <p>Mutuales vinculadas, datos del Fondo y parámetros</p>
      </div>

      {/* Datos del Fondo */}
      <form className="card" onSubmit={guardarFondo}>
        <h2>Datos del Fondo (aparecen en la cuenta de cobro)</h2>
        <div className="grid-f">
          <label>Nombre<input value={fondo.fondo_nombre || ""} onChange={(e) => setFondoK("fondo_nombre", e.target.value)} /></label>
          <label>NIT<input value={fondo.fondo_nit || ""} onChange={(e) => setFondoK("fondo_nit", e.target.value)} /></label>
          <label>Dirección<input value={fondo.fondo_direccion || ""} onChange={(e) => setFondoK("fondo_direccion", e.target.value)} /></label>
          <label>Correo<input value={fondo.fondo_correo || ""} onChange={(e) => setFondoK("fondo_correo", e.target.value)} /></label>
          <label>Teléfono<input value={fondo.fondo_telefono || ""} onChange={(e) => setFondoK("fondo_telefono", e.target.value)} /></label>
          <label style={{ gridColumn: "1 / -1" }}>Firma de correo (HTML — incluye tratamiento de datos)
            <textarea rows={6} value={fondo.firma_correo || ""} onChange={(e) => setFondoK("firma_correo", e.target.value)} placeholder="Pega aquí tu firma (puede ser HTML): nombre, cargo, contacto y la cláusula de tratamiento de datos…" style={{ width: "100%", padding: "9px 11px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontFamily: "monospace" }} />
          </label>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <button className="btn-primary" type="submit">Guardar datos del Fondo</button>
          {msg && <span style={{ fontSize: 13, color: msg.startsWith("✓") ? "#166534" : "#dc2626" }}>{msg}</span>}
        </div>
      </form>

      {/* Parámetros del sistema */}
      <form className="card" onSubmit={guardarMora}>
        <h2>Parámetros del sistema</h2>
        <div className="grid-f">
          <label>Interés de mora (% mensual)
            <input type="number" step="0.01" value={params.tasa_mora ?? ""} onChange={(e) => setParams((p) => ({ ...p, tasa_mora: e.target.value }))} placeholder="Ej: 1" />
          </label>
          <div style={{ fontSize: 12, color: "var(--gris)", alignSelf: "end", paddingBottom: 8 }}>
            IVA: {((params.iva ?? 0.19) * 100).toFixed(0)}% · Admin socia: {((params.admin_socia ?? 0.13) * 100).toFixed(0)}% · Admin no socia: {((params.admin_no_socia ?? 0.17) * 100).toFixed(0)}%
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <button className="btn-primary" type="submit">Guardar parámetros</button>
          {msgP && <span style={{ fontSize: 13, color: msgP.startsWith("✓") ? "#166534" : "#dc2626" }}>{msgP}</span>}
        </div>
      </form>

      {/* Mutuales */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>Mutuales / Clientes ({mutuales.length})</h2>
          <button className="btn-primary" onClick={nueva}>+ Nueva mutual</button>
        </div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Corto</th><th>NIT</th><th>DV</th><th>Socia</th><th>Ciudad</th><th>Teléfono</th><th>Correo</th><th>Activa</th><th></th></tr></thead>
            <tbody>
              {cargando && <tr><td colSpan={10} style={{ textAlign: "center", color: "#64748b", padding: 24 }}>Cargando…</td></tr>}
              {mutuales.map((m) => (
                <tr key={m.id}>
                  <td>{m.nombre}</td><td>{m.nombre_corto}</td><td>{m.nit}</td><td>{m.dv}</td>
                  <td>{m.es_socia ? "Sí" : "No"}</td><td>{m.ciudad || "—"}</td><td>{m.telefono || "—"}</td><td>{m.correo || "—"}</td>
                  <td>{m.activa ? "Sí" : "No"}</td>
                  <td><button className="mini" onClick={() => editar(m)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {abierto && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setAbierto(false)}>
          <form className="modal" onSubmit={guardar}>
            <h3>{editId ? "Editar mutual" : "Nueva mutual"}</h3>
            <div className="grid2">
              <label>Nombre<input value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required /></label>
              <label>Nombre corto<input value={form.nombre_corto} onChange={(e) => set("nombre_corto", e.target.value)} /></label>
              <label>NIT<input value={form.nit} onChange={(e) => set("nit", e.target.value)} /></label>
              <label>Dígito verif.<input value={form.dv} onChange={(e) => set("dv", e.target.value)} /></label>
              <label>Representante<input value={form.representante} onChange={(e) => set("representante", e.target.value)} /></label>
              <label>Ciudad<input value={form.ciudad} onChange={(e) => set("ciudad", e.target.value)} /></label>
              <label style={{ gridColumn: "1 / -1" }}>Dirección<input value={form.direccion} onChange={(e) => set("direccion", e.target.value)} /></label>
              <label>Teléfono<input value={form.telefono} onChange={(e) => set("telefono", e.target.value)} /></label>
              <label>Correo (principal)<input value={form.correo} onChange={(e) => set("correo", e.target.value)} /></label>
              <label style={{ gridColumn: "1 / -1" }}>Correos de envío (separa con coma)<input value={form.correos_envio} onChange={(e) => set("correos_envio", e.target.value)} placeholder="facturacion@mutual.com, gerencia@mutual.com" /></label>
              <label style={{ gridColumn: "1 / -1" }}>Copias CC (separa con coma)<input value={form.correos_cc} onChange={(e) => set("correos_cc", e.target.value)} placeholder="contador@mutual.com" /></label>
              <label className="chk"><input type="checkbox" checked={!!form.es_socia} onChange={(e) => set("es_socia", e.target.checked)} /> Es socia (admin 13%)</label>
              <label className="chk"><input type="checkbox" checked={!!form.activa} onChange={(e) => set("activa", e.target.checked)} /> Activa</label>
            </div>
            <div className="modal-acc">
              <span style={{ flex: 1 }} />
              <button type="button" className="logout" onClick={() => setAbierto(false)}>Cancelar</button>
              <button type="submit" className="btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .grid-f{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .grid-f label,.grid2 label{display:flex;flex-direction:column;font-size:12px;font-weight:600;color:#334155;gap:5px}
        .grid-f input,.grid2 input{padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;font-weight:400}
        .mini{background:#eff6ff;color:#1e40af;border:1px solid #93c5fd;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer}
        .modal-bg{position:fixed;inset:0;background:rgba(10,22,40,.5);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}
        .modal{background:#fff;border-radius:12px;padding:24px;width:100%;max-width:620px;max-height:90vh;overflow:auto}
        .modal h3{margin-bottom:16px;color:#0a1628}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .chk{flex-direction:row !important;align-items:center;gap:8px}
        .modal-acc{display:flex;align-items:center;gap:8px;margin-top:18px}
      `}</style>
    </div>
  );
}
