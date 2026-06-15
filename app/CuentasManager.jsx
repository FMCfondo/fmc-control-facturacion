"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtPesos, fmtFecha } from "../lib/format";

const VACIA = {
  tipo: "regular", mutual_id: "", cliente_nombre: "", consecutivo: "",
  mes: "", anio: new Date().getFullYear(), fecha_elaboracion: "",
  factura_inicial: "", factura_final: "", valor_facturado: "", valor_recibido: "",
  estado: "pendiente", notas: "",
};

export default function CuentasManager({ cuentas, mutuales }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(VACIA);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);

  const mapNombre = Object.fromEntries(mutuales.map((m) => [m.id, m.nombre]));
  const nombreCliente = (c) =>
    c.tipo === "irregular" ? (c.cliente_nombre || "—") : (mapNombre[c.mutual_id] || c.cliente_nombre || "—");

  function nueva() {
    setForm(VACIA); setEditId(null); setMsg(""); setAbierto(true);
  }
  function editar(c) {
    setForm({
      tipo: c.tipo || "regular", mutual_id: c.mutual_id || "", cliente_nombre: c.cliente_nombre || "",
      consecutivo: c.consecutivo ?? "", mes: c.mes ?? "", anio: c.anio ?? "",
      fecha_elaboracion: c.fecha_elaboracion || "", factura_inicial: c.factura_inicial ?? "",
      factura_final: c.factura_final ?? "", valor_facturado: c.valor_facturado ?? "",
      valor_recibido: c.valor_recibido ?? "", estado: c.estado || "pendiente", notas: c.notas || "",
    });
    setEditId(c.id); setMsg(""); setAbierto(true);
  }

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  // Actualiza el estado directamente desde la lista desplegable de la fila.
  async function cambiarEstado(id, estado) {
    try {
      const res = await fetch("/api/cuenta-cobro", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, estado }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      router.refresh();
    } catch (e) {
      alert("No se pudo cambiar el estado: " + e.message);
    }
  }

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true); setMsg("");
    try {
      const body = { ...form };
      // normalizar números/relaciones
      ["consecutivo","mes","anio","factura_inicial","factura_final","valor_facturado","valor_recibido"]
        .forEach((k) => { body[k] = body[k] === "" ? null : Number(body[k]); });
      if (body.tipo === "irregular") body.mutual_id = null;
      else body.cliente_nombre = null;
      const res = await fetch("/api/cuenta-cobro", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { id: editId, ...body } : body),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setMsg("✗ " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!editId) return;
    if (!confirm("¿Borrar esta cuenta de cobro y sus facturas? Esta acción no se puede deshacer.")) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/cuenta-cobro", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setAbierto(false);
      router.refresh();
    } catch (e) {
      setMsg("✗ " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Cuentas de cobro ({cuentas.length})</h2>
        <button className="btn-primary" onClick={nueva}>+ Nueva manual</button>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>CC #</th><th>Tipo</th><th>Cliente / Mutual</th><th>Mes</th><th>Año</th>
              <th>Fecha</th><th>Rango facturas</th><th>Facturado</th><th>Recibido</th><th>Saldo</th><th>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {cuentas.map((c) => (
              <tr key={c.id}>
                <td>{c.consecutivo}</td>
                <td><span className={"tag " + (c.tipo === "irregular" ? "irregular" : "")}>{c.tipo}</span></td>
                <td>{nombreCliente(c)}</td>
                <td>{c.mes ?? ""}</td>
                <td>{c.anio}</td>
                <td>{fmtFecha(c.fecha_elaboracion)}</td>
                <td>{c.factura_inicial && c.factura_final ? `${c.factura_inicial}–${c.factura_final}` : "—"}</td>
                <td className="num">{fmtPesos(c.valor_facturado)}</td>
                <td className="num">{fmtPesos(c.valor_recibido)}</td>
                <td className="num">{fmtPesos(c.saldo)}</td>
                <td>
                  <select className={"estado-sel " + c.estado} value={c.estado}
                    onChange={(e) => cambiarEstado(c.id, e.target.value)}>
                    <option value="pendiente">pendiente</option>
                    <option value="parcial">parcial</option>
                    <option value="pago">pago</option>
                  </select>
                </td>
                <td><button className="mini" onClick={() => editar(c)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abierto && (
        <div className="modal-bg" onClick={(e) => e.target.className === "modal-bg" && setAbierto(false)}>
          <form className="modal" onSubmit={guardar}>
            <h3>{editId ? "Editar cuenta de cobro" : "Nueva cuenta de cobro manual"}</h3>
            <div className="grid2">
              <label>Tipo
                <select value={form.tipo} onChange={(e) => set("tipo", e.target.value)}>
                  <option value="regular">Regular (mutual)</option>
                  <option value="irregular">Irregular (otro cliente)</option>
                </select>
              </label>
              {form.tipo === "regular" ? (
                <label>Mutual
                  <select value={form.mutual_id} onChange={(e) => set("mutual_id", e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {mutuales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  </select>
                </label>
              ) : (
                <label>Cliente
                  <input value={form.cliente_nombre} onChange={(e) => set("cliente_nombre", e.target.value)} placeholder="Nombre del cliente" />
                </label>
              )}
              <label>Cuenta de cobro #<input type="number" value={form.consecutivo} onChange={(e) => set("consecutivo", e.target.value)} required /></label>
              <label>Fecha<input type="date" value={form.fecha_elaboracion || ""} onChange={(e) => set("fecha_elaboracion", e.target.value)} /></label>
              <label>Mes<input type="number" min="1" max="12" value={form.mes} onChange={(e) => set("mes", e.target.value)} /></label>
              <label>Año<input type="number" value={form.anio} onChange={(e) => set("anio", e.target.value)} required /></label>
              <label>Factura inicial<input type="number" value={form.factura_inicial} onChange={(e) => set("factura_inicial", e.target.value)} /></label>
              <label>Factura final<input type="number" value={form.factura_final} onChange={(e) => set("factura_final", e.target.value)} /></label>
              <label>Valor facturado<input type="number" step="0.01" value={form.valor_facturado} onChange={(e) => set("valor_facturado", e.target.value)} /></label>
              <label>Valor recibido<input type="number" step="0.01" value={form.valor_recibido} onChange={(e) => set("valor_recibido", e.target.value)} /></label>
              <label>Estado
                <select value={form.estado} onChange={(e) => set("estado", e.target.value)}>
                  <option value="pendiente">Pendiente</option>
                  <option value="parcial">Parcial</option>
                  <option value="pago">Pago</option>
                </select>
              </label>
              <label style={{ gridColumn: "1 / -1" }}>Notas<input value={form.notas} onChange={(e) => set("notas", e.target.value)} /></label>
            </div>
            {msg && <div className="err" style={{ marginTop: 10 }}>{msg}</div>}
            <div className="modal-acc">
              {editId && <button type="button" className="del" onClick={borrar} disabled={guardando}>Borrar</button>}
              <span style={{ flex: 1 }} />
              <button type="button" className="logout" onClick={() => setAbierto(false)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .mini{background:#eff6ff;color:#1e40af;border:1px solid #93c5fd;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer}
        .estado-sel{border:1px solid #cbd5e1;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer}
        .estado-sel.pago{background:#dcfce7;color:#166534;border-color:#86efac}
        .estado-sel.pendiente{background:#fef9c3;color:#854d0e;border-color:#fde68a}
        .estado-sel.parcial{background:#dbeafe;color:#1e40af;border-color:#93c5fd}
        .modal-bg{position:fixed;inset:0;background:rgba(10,22,40,.5);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}
        .modal{background:#fff;border-radius:12px;padding:24px;width:100%;max-width:620px;max-height:90vh;overflow:auto}
        .modal h3{margin-bottom:16px;color:#0a1628}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .modal label{display:flex;flex-direction:column;font-size:12px;font-weight:600;color:#334155;gap:5px}
        .modal input,.modal select{padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;font-weight:400}
        .modal-acc{display:flex;align-items:center;gap:8px;margin-top:18px}
        .del{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer}
      `}</style>
    </div>
  );
}
