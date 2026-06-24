"use client";
import { useState } from "react";
import { fmtPesos, fmtFecha } from "../lib/format";
import { IVA } from "../lib/siigo/constantes";

const VACIA = {
  tipo: "regular", mutual_id: "", cliente_nombre: "", consecutivo: "",
  mes: "", anio: new Date().getFullYear(), fecha_elaboracion: "", fecha_vencimiento: "",
  factura_inicial: "", factura_final: "", valor_facturado: "", valor_recibido: "",
  anticipos: "", estado: "pendiente", notas: "",
};

export default function CuentasManager({ cuentas, mutuales }) {
  // El tablero (page.jsx) es force-dynamic + noStore, así que estos datos ya
  // llegan frescos del servidor; no hace falta volver a pedirlos al montar.
  const [lista, setLista] = useState(cuentas);

  // Recarga la lista desde la BD tras un cambio (alta/edición/pago/borrado).
  async function recargar() {
    try {
      const r = await fetch("/api/cuenta-cobro", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setLista(d.cuentas || []);
    } catch {}
  }

  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(VACIA);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [modalItems, setModalItems] = useState([]); // ítems para cuentas irregulares

  // Pagos
  const [pagosCuenta, setPagosCuenta] = useState(null); // cuenta seleccionada
  const [pagos, setPagos] = useState([]);
  const [pagoForm, setPagoForm] = useState({ fecha: "", valor: "", metodo: "", notas: "" });
  const [pagoMsg, setPagoMsg] = useState("");

  // Filtros y ordenamiento de la tabla (estilo Excel).
  const [filtros, setFiltros] = useState({});
  const [orden, setOrden] = useState({ campo: null, dir: 1 });
  const setF = (k, v) => setFiltros((f) => ({ ...f, [k]: v }));

  const mapNombre = Object.fromEntries(mutuales.map((m) => [m.id, m.nombre]));
  const nombreCliente = (c) =>
    c.tipo === "irregular" ? (c.cliente_nombre || "—") : (mapNombre[c.mutual_id] || c.cliente_nombre || "—");

  function nueva() {
    setForm(VACIA); setEditId(null); setMsg(""); setModalItems([]); setAbierto(true);
  }
  async function editar(c) {
    setModalItems([]);
    if (c.tipo === "irregular") {
      try {
        const r = await fetch(`/api/documento?id=${c.id}`, { cache: "no-store" });
        const d = await r.json();
        if (r.ok && d.items) setModalItems(d.items.map((it) => ({
          cantidad: it.cantidad, codigo: it.codigo || "", descripcion: it.descripcion, valor_unitario: it.valor_unitario,
        })));
      } catch {}
    }
    setForm({
      tipo: c.tipo || "regular", mutual_id: c.mutual_id || "", cliente_nombre: c.cliente_nombre || "",
      consecutivo: c.consecutivo ?? "", mes: c.mes ?? "", anio: c.anio ?? "",
      fecha_elaboracion: c.fecha_elaboracion || "", fecha_vencimiento: c.fecha_vencimiento || "",
      factura_inicial: c.factura_inicial ?? "",
      factura_final: c.factura_final ?? "", valor_facturado: c.valor_facturado ?? "",
      valor_recibido: c.valor_recibido ?? "", anticipos: c.anticipos ?? "",
      estado: c.estado || "pendiente", notas: c.notas || "",
    });
    setEditId(c.id); setMsg(""); setAbierto(true);
  }

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  // Ítems (cuentas irregulares)
  const addItem = () => setModalItems((x) => [...x, { cantidad: 1, codigo: "", descripcion: "", valor_unitario: "" }]);
  const updItem = (i, k, v) => setModalItems((x) => x.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const delItem = (i) => setModalItems((x) => x.filter((_, j) => j !== i));
  const subtotalItems = modalItems.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.valor_unitario) || 0), 0);

  const borrarTodosPagos = (id) =>
    fetch("/api/pagos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cuenta_cobro_id: id }) });

  // Cambiar estado desde la lista desplegable, ajustando el recibido en consecuencia.
  async function cambiarEstado(id, estado) {
    const c = lista.find((x) => x.id === id);
    if (!c) return;
    const facturado = Number(c.valor_facturado || 0);
    const recibido = Number(c.valor_recibido || 0);
    // Pasar a pendiente/parcial elimina los pagos ya registrados: confirmar si hay dinero recibido.
    if ((estado === "pendiente" || estado === "parcial") && recibido > 0 &&
        !confirm(`Esta cuenta tiene ${fmtPesos(recibido)} en pagos registrados que se eliminarán. ¿Continuar?`)) {
      recargar(); // revierte el desplegable a su valor real
      return;
    }

    try {
      if (estado === "pendiente") {
        // Quitar todo lo recibido → saldo completo pendiente.
        await borrarTodosPagos(id);
        recargar();
        return;
      }
      if (estado === "pago") {
        // Reemplazar pagos por uno que cubra el total (recibido = facturado).
        await borrarTodosPagos(id);
        if (facturado > 0) {
          await fetch("/api/pagos", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              cuenta_cobro_id: id, fecha: new Date().toISOString().slice(0, 10),
              valor: facturado, notas: "Pago total (desde estado)",
            }),
          });
        }
        recargar();
        return;
      }
      if (estado === "parcial") {
        // Reiniciar recibido y abrir el cuadro para ingresar el monto parcial.
        await borrarTodosPagos(id);
        await recargar();
        abrirPagos({ ...c, valor_recibido: 0, estado: "pendiente" });
        return;
      }
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
      ["consecutivo","mes","anio","factura_inicial","factura_final","valor_facturado","valor_recibido","anticipos"]
        .forEach((k) => { body[k] = body[k] === "" ? null : Number(body[k]); });
      if (body.tipo === "irregular") {
        body.mutual_id = null;
        body.items = modalItems;
        // Si hay ítems, el valor facturado = subtotal + IVA (19%).
        if (modalItems.some((it) => it.descripcion)) {
          body.valor_facturado = Math.round(subtotalItems * (1 + IVA) * 100) / 100;
        }
      } else {
        body.cliente_nombre = null;
      }
      // Derivar estado automáticamente según el valor recibido vs facturado.
      const vf = Number(body.valor_facturado) || 0;
      const vr = Number(body.valor_recibido) || 0;
      if (vf > 0) body.estado = vr <= 0 ? "pendiente" : (vr >= vf ? "pago" : "parcial");
      const res = await fetch("/api/cuenta-cobro", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editId ? { id: editId, ...body } : body),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setAbierto(false);
      recargar();
    } catch (e) {
      setMsg("✗ " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  // ─── Pagos ───
  async function abrirPagos(c) {
    setPagosCuenta(c); setPagoMsg(""); setPagos([]);
    setPagoForm({ fecha: new Date().toISOString().slice(0, 10), valor: "", metodo: "", notas: "" });
    const r = await fetch(`/api/pagos?cuenta_cobro_id=${c.id}`);
    const d = await r.json();
    if (!r.ok) { setPagoMsg("✗ " + d.error); return; }
    setPagos(d.pagos || []);
  }
  async function agregarPago(e) {
    e.preventDefault(); setPagoMsg("");
    try {
      const res = await fetch("/api/pagos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuenta_cobro_id: pagosCuenta.id, ...pagoForm }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      const r = await fetch(`/api/pagos?cuenta_cobro_id=${pagosCuenta.id}`);
      setPagos((await r.json()).pagos || []);
      setPagoForm({ fecha: pagoForm.fecha, valor: "", metodo: "", notas: "" });
      recargar();
    } catch (e) { setPagoMsg("✗ " + e.message); }
  }
  async function borrarPago(id) {
    if (!confirm("¿Borrar este pago?")) return;
    await fetch("/api/pagos", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    const r = await fetch(`/api/pagos?cuenta_cobro_id=${pagosCuenta.id}`);
    setPagos((await r.json()).pagos || []);
    recargar();
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
      recargar();
    } catch (e) {
      setMsg("✗ " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  const totFact = lista.reduce((s, c) => s + (Number(c.valor_facturado) || 0), 0);
  const totRec = lista.reduce((s, c) => s + (Number(c.valor_recibido) || 0), 0);
  const pendientes = lista.filter((c) => c.estado !== "pago").length;

  // Valor de cada columna (para filtrar y ordenar).
  const NUMERICAS = ["consecutivo", "mes", "anio", "facturado", "recibido", "saldo"];
  const valorCol = (c, k) => {
    switch (k) {
      case "consecutivo": return c.consecutivo ?? "";
      case "tipo": return c.tipo || "";
      case "cliente": return nombreCliente(c);
      case "mes": return c.mes ?? "";
      case "anio": return c.anio ?? "";
      case "fecha": return fmtFecha(c.fecha_elaboracion);
      case "rango": return c.factura_inicial && c.factura_final ? `${c.factura_inicial}-${c.factura_final}` : "";
      case "facturado": return Number(c.valor_facturado) || 0;
      case "recibido": return Number(c.valor_recibido) || 0;
      case "saldo": return Number(c.saldo) || 0;
      case "estado": return c.estado || "";
      default: return "";
    }
  };
  let filtradas = lista.filter((c) =>
    Object.entries(filtros).every(([k, v]) => {
      if (!v) return true;
      if (k === "estado" || k === "tipo") return valorCol(c, k) === v;
      return String(valorCol(c, k)).toLowerCase().includes(String(v).toLowerCase());
    })
  );
  if (orden.campo) {
    const num = NUMERICAS.includes(orden.campo);
    filtradas = [...filtradas].sort((a, b) => {
      const va = valorCol(a, orden.campo), vb = valorCol(b, orden.campo);
      return (num ? Number(va) - Number(vb) : String(va).localeCompare(String(vb))) * orden.dir;
    });
  }
  const ordenarPor = (k) => setOrden((o) => ({ campo: k, dir: o.campo === k ? -o.dir : 1 }));
  const flecha = (k) => (orden.campo === k ? (orden.dir === 1 ? " ▲" : " ▼") : "");
  const hayFiltros = Object.values(filtros).some(Boolean) || orden.campo;

  return (
    <>
    <div className="cards">
      <div className="kpi"><div className="label">Cuentas de cobro</div><div className="value">{lista.length}</div></div>
      <div className="kpi"><div className="label">Total facturado</div><div className="value">{fmtPesos(totFact)}</div></div>
      <div className="kpi"><div className="label">Total recibido</div><div className="value">{fmtPesos(totRec)}</div></div>
      <div className="kpi"><div className="label">Saldo pendiente</div><div className="value">{fmtPesos(totFact - totRec)}</div><div className="sub">{pendientes} sin saldar</div></div>
      <div className="kpi"><div className="label">Mutuales</div><div className="value">{mutuales.length}</div></div>
    </div>
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 8 }}>
        <h2 style={{ margin: 0 }}>Cuentas de cobro ({filtradas.length}{filtradas.length !== lista.length ? ` de ${lista.length}` : ""})</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {hayFiltros && <button className="logout" onClick={() => { setFiltros({}); setOrden({ campo: null, dir: 1 }); }}>Limpiar filtros</button>}
          <button className="btn-primary" onClick={nueva}>+ Nueva manual</button>
        </div>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th className="sortable" onClick={() => ordenarPor("consecutivo")}>CC #{flecha("consecutivo")}</th>
              <th className="sortable" onClick={() => ordenarPor("tipo")}>Tipo{flecha("tipo")}</th>
              <th className="sortable" onClick={() => ordenarPor("cliente")}>Cliente / Mutual{flecha("cliente")}</th>
              <th className="sortable" onClick={() => ordenarPor("mes")}>Mes{flecha("mes")}</th>
              <th className="sortable" onClick={() => ordenarPor("anio")}>Año{flecha("anio")}</th>
              <th className="sortable" onClick={() => ordenarPor("fecha")}>Fecha{flecha("fecha")}</th>
              <th className="sortable" onClick={() => ordenarPor("rango")}>Rango facturas{flecha("rango")}</th>
              <th className="sortable" onClick={() => ordenarPor("facturado")}>Facturado{flecha("facturado")}</th>
              <th className="sortable" onClick={() => ordenarPor("recibido")}>Recibido{flecha("recibido")}</th>
              <th className="sortable" onClick={() => ordenarPor("saldo")}>Saldo{flecha("saldo")}</th>
              <th className="sortable" onClick={() => ordenarPor("estado")}>Estado{flecha("estado")}</th>
              <th></th>
            </tr>
            <tr className="filtros">
              <th><input value={filtros.consecutivo || ""} onChange={(e) => setF("consecutivo", e.target.value)} placeholder="🔍" /></th>
              <th>
                <select value={filtros.tipo || ""} onChange={(e) => setF("tipo", e.target.value)}>
                  <option value="">Todos</option><option value="regular">regular</option><option value="irregular">irregular</option>
                </select>
              </th>
              <th><input value={filtros.cliente || ""} onChange={(e) => setF("cliente", e.target.value)} placeholder="🔍" /></th>
              <th><input value={filtros.mes || ""} onChange={(e) => setF("mes", e.target.value)} placeholder="🔍" /></th>
              <th><input value={filtros.anio || ""} onChange={(e) => setF("anio", e.target.value)} placeholder="🔍" /></th>
              <th><input value={filtros.fecha || ""} onChange={(e) => setF("fecha", e.target.value)} placeholder="dd/mm/aaaa" /></th>
              <th><input value={filtros.rango || ""} onChange={(e) => setF("rango", e.target.value)} placeholder="🔍" /></th>
              <th><input value={filtros.facturado || ""} onChange={(e) => setF("facturado", e.target.value)} placeholder="🔍" /></th>
              <th><input value={filtros.recibido || ""} onChange={(e) => setF("recibido", e.target.value)} placeholder="🔍" /></th>
              <th><input value={filtros.saldo || ""} onChange={(e) => setF("saldo", e.target.value)} placeholder="🔍" /></th>
              <th>
                <select value={filtros.estado || ""} onChange={(e) => setF("estado", e.target.value)}>
                  <option value="">Todos</option><option value="pendiente">pendiente</option><option value="parcial">parcial</option><option value="pago">pago</option>
                </select>
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((c) => (
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
                <td style={{ whiteSpace: "nowrap" }}>
                  <a className="mini" href={`/cuenta/${c.id}`} target="_blank" rel="noreferrer">Cuenta</a>{" "}
                  <button className="mini" onClick={() => abrirPagos(c)}>Pagos</button>{" "}
                  <button className="mini" onClick={() => editar(c)}>Editar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {abierto && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setAbierto(false)}>
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
              <label>Fecha elaboración<input type="date" value={form.fecha_elaboracion || ""} onChange={(e) => set("fecha_elaboracion", e.target.value)} /></label>
              <label>Fecha vencimiento<input type="date" value={form.fecha_vencimiento || ""} onChange={(e) => set("fecha_vencimiento", e.target.value)} /></label>
              <label>Mes<input type="number" min="1" max="12" value={form.mes} onChange={(e) => set("mes", e.target.value)} /></label>
              <label>Año<input type="number" value={form.anio} onChange={(e) => set("anio", e.target.value)} required /></label>
              <label>Factura inicial<input type="number" value={form.factura_inicial} onChange={(e) => set("factura_inicial", e.target.value)} /></label>
              <label>Factura final<input type="number" value={form.factura_final} onChange={(e) => set("factura_final", e.target.value)} /></label>
              <label>Valor facturado<input type="number" step="0.01" value={form.valor_facturado} onChange={(e) => set("valor_facturado", e.target.value)} /></label>
              <label>Valor recibido<input type="number" step="0.01" value={form.valor_recibido} onChange={(e) => set("valor_recibido", e.target.value)} /></label>
              <label>Anticipos / saldo a favor<input type="number" step="0.01" value={form.anticipos} onChange={(e) => set("anticipos", e.target.value)} /></label>
              <label>Estado
                <select value={form.estado} onChange={(e) => set("estado", e.target.value)}>
                  <option value="pendiente">Pendiente</option>
                  <option value="parcial">Parcial</option>
                  <option value="pago">Pago</option>
                </select>
              </label>
              <label style={{ gridColumn: "1 / -1" }}>Notas<input value={form.notas} onChange={(e) => set("notas", e.target.value)} /></label>
            </div>

            {form.tipo === "irregular" && (
              <div className="items-edit">
                <div className="items-head">
                  <b>Ítems de la cuenta de cobro</b>
                  <button type="button" className="mini" onClick={addItem}>+ Agregar ítem</button>
                </div>
                {modalItems.length === 0 && <p className="hint2">Sin ítems. El valor facturado se calculará como subtotal + IVA 19%.</p>}
                {modalItems.map((it, i) => (
                  <div className="item-row" key={i}>
                    <input style={{ width: 50 }} type="number" placeholder="Cant" value={it.cantidad} onChange={(e) => updItem(i, "cantidad", e.target.value)} />
                    <input style={{ width: 70 }} placeholder="Código" value={it.codigo} onChange={(e) => updItem(i, "codigo", e.target.value)} />
                    <input style={{ flex: 1 }} placeholder="Descripción" value={it.descripcion} onChange={(e) => updItem(i, "descripcion", e.target.value)} />
                    <input style={{ width: 110 }} type="number" step="0.01" placeholder="Vlr unitario" value={it.valor_unitario} onChange={(e) => updItem(i, "valor_unitario", e.target.value)} />
                    <button type="button" className="del" style={{ padding: "4px 8px" }} onClick={() => delItem(i)}>✕</button>
                  </div>
                ))}
                {modalItems.length > 0 && (
                  <div className="items-tot">
                    Subtotal: {fmtPesos(subtotalItems)} · IVA: {fmtPesos(subtotalItems * IVA)} · <b>Total: {fmtPesos(subtotalItems * (1 + IVA))}</b>
                  </div>
                )}
              </div>
            )}

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

      {pagosCuenta && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setPagosCuenta(null)}>
          <div className="modal">
            <h3>Pagos — CC #{pagosCuenta.consecutivo} · {nombreCliente(pagosCuenta)}</h3>
            <div className="resumen-pago">
              <span><b>Facturado:</b> {fmtPesos(pagosCuenta.valor_facturado)}</span>
              <span><b>Recibido:</b> {fmtPesos(pagos.reduce((s, p) => s + Number(p.valor), 0))}</span>
              <span><b>Saldo:</b> {fmtPesos(Number(pagosCuenta.valor_facturado) - pagos.reduce((s, p) => s + Number(p.valor), 0))}</span>
            </div>

            {pagos.length > 0 ? (
              <table style={{ marginTop: 12 }}>
                <thead><tr><th>Fecha</th><th>Valor</th><th>Método</th><th>Notas</th><th></th></tr></thead>
                <tbody>
                  {pagos.map((p) => (
                    <tr key={p.id}>
                      <td>{fmtFecha(p.fecha)}</td>
                      <td className="num">{fmtPesos(p.valor)}</td>
                      <td>{p.metodo || "—"}</td>
                      <td>{p.notas || "—"}</td>
                      <td><button className="del" style={{ padding: "2px 8px" }} onClick={() => borrarPago(p.id)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="hint" style={{ margin: "12px 0" }}>Aún no hay pagos registrados.</p>}

            <form onSubmit={agregarPago} className="form-pago">
              <input type="date" value={pagoForm.fecha} onChange={(e) => setPagoForm({ ...pagoForm, fecha: e.target.value })} required />
              <input type="number" step="0.01" placeholder="Valor" value={pagoForm.valor} onChange={(e) => setPagoForm({ ...pagoForm, valor: e.target.value })} required />
              <input placeholder="Método (opcional)" value={pagoForm.metodo} onChange={(e) => setPagoForm({ ...pagoForm, metodo: e.target.value })} />
              <input placeholder="Notas (opcional)" value={pagoForm.notas} onChange={(e) => setPagoForm({ ...pagoForm, notas: e.target.value })} />
              <button type="submit" className="btn-primary">+ Pago</button>
            </form>
            {pagoMsg && <div className="err" style={{ marginTop: 10 }}>{pagoMsg}</div>}

            <div className="modal-acc">
              <span style={{ flex: 1 }} />
              <button type="button" className="logout" onClick={() => setPagosCuenta(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .resumen-pago{display:flex;gap:20px;flex-wrap:wrap;padding:10px;background:#f8fafc;border-radius:8px;font-size:13px}
        .form-pago{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;align-items:center}
        .form-pago input{padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px}
        .sortable{cursor:pointer;user-select:none;white-space:nowrap}
        .sortable:hover{background:#334155}
        tr.filtros th{background:#eef2f7;position:sticky;top:31px;padding:4px 6px;z-index:1}
        tr.filtros input,tr.filtros select{width:100%;min-width:55px;padding:4px 6px;border:1px solid #cbd5e1;border-radius:5px;font-size:11px;font-weight:400;color:#1a1a2e}
        .mini{background:#eff6ff;color:#1e40af;border:1px solid #93c5fd;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}
        .estado-sel{border:1px solid #cbd5e1;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:600;cursor:pointer}
        .estado-sel.pago{background:#dcfce7;color:#166534;border-color:#86efac}
        .estado-sel.pendiente{background:#fef9c3;color:#854d0e;border-color:#fde68a}
        .estado-sel.parcial{background:#dbeafe;color:#1e40af;border-color:#93c5fd}
        .modal-bg{position:fixed;inset:0;background:rgba(10,22,40,.5);display:flex;align-items:center;justify-content:center;padding:16px;z-index:50}
        .modal{background:#fff;border-radius:12px;padding:24px;width:100%;max-width:620px;max-height:90vh;overflow:auto}
        .modal h3{margin-bottom:16px;color:#0a1628}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .items-edit{margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px}
        .items-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .item-row{display:flex;gap:6px;margin-bottom:6px;align-items:center}
        .item-row input{padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;font-size:12px}
        .items-tot{text-align:right;font-size:12px;margin-top:6px;color:#334155}
        .hint2{font-size:11px;color:#94a3b8;margin:4px 0}
        .modal label{display:flex;flex-direction:column;font-size:12px;font-weight:600;color:#334155;gap:5px}
        .modal input,.modal select{padding:8px 10px;border:1px solid #cbd5e1;border-radius:7px;font-size:13px;font-weight:400}
        .modal-acc{display:flex;align-items:center;gap:8px;margin-top:18px}
        .del{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer}
      `}</style>
    </div>
    </>
  );
}
