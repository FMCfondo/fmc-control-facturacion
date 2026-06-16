"use client";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx-js-style";

const HOY = () => new Date().toISOString().slice(0, 10);
const fmtF = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("es-CO") : "");

export default function Reportes() {
  const [cargando, setCargando] = useState("");
  const [msg, setMsg] = useState("");
  const [lotes, setLotes] = useState([]);
  const [bajando, setBajando] = useState(null);

  useEffect(() => {
    fetch("/api/archivos", { cache: "no-store" }).then((r) => r.json()).then((d) => setLotes(d.lotes || [])).catch(() => {});
  }, []);

  async function descargarLote(cc) {
    setBajando(cc);
    try {
      const r = await fetch(`/api/archivos?cc=${cc}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!d.archivos?.length) { alert("Este lote no tiene archivos guardados (se generó antes del archivado en la nube)."); return; }
      d.archivos.forEach((a, i) => setTimeout(() => window.open(a.url, "_blank"), i * 400));
    } catch (e) { alert("Error: " + e.message); }
    setBajando(null);
  }

  async function traer() {
    const r = await fetch("/api/export", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Error");
    return d;
  }

  const logDescarga = (descripcion) =>
    fetch("/api/actividad", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: "Descarga", descripcion }) }).catch(() => {});

  // Construye una hoja desde un arreglo de objetos.
  const hoja = (arr) => XLSX.utils.json_to_sheet(arr.length ? arr : [{ vacio: "sin datos" }]);

  async function respaldoCompleto() {
    setCargando("full"); setMsg("");
    try {
      const d = await traer();
      const wb = XLSX.utils.book_new();
      const hojas = {
        "Cuentas de cobro": d.cuentas_cobro, "Facturas": d.facturas_siigo, "Pagos": d.pagos,
        "Mutuales": d.mutuales, "Items": d.items_cuenta_cobro, "Config": d.config, "Parametros": d.parametros,
      };
      Object.entries(hojas).forEach(([n, arr]) => XLSX.utils.book_append_sheet(wb, hoja(arr || []), n.slice(0, 31)));
      XLSX.writeFile(wb, `Respaldo FMC - ${HOY()}.xlsx`);
      logDescarga("Respaldo completo descargado");
    } catch (e) { setMsg("✗ " + e.message); }
    setCargando("");
  }

  async function tabla(clave, nombre) {
    setCargando(clave); setMsg("");
    try {
      const d = await traer();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, hoja(d[clave] || []), nombre.slice(0, 31));
      XLSX.writeFile(wb, `${nombre} - ${HOY()}.xlsx`);
      logDescarga(`Reporte "${nombre}" descargado`);
    } catch (e) { setMsg("✗ " + e.message); }
    setCargando("");
  }

  const Btn = ({ id, onClick, children, primary }) => (
    <button className={primary ? "btn-primary" : "logout"} disabled={!!cargando} onClick={onClick} style={{ minWidth: 220, justifyContent: "center" }}>
      {cargando === id ? "Generando…" : children}
    </button>
  );

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Reportes y respaldo</h1>
        <p>Descarga tu información en Excel. Guarda el respaldo periódicamente como copia de seguridad.</p>
      </div>

      <div className="card">
        <h2>Respaldo completo</h2>
        <p style={{ fontSize: 13, color: "var(--gris)", marginBottom: 14 }}>Un solo archivo Excel con todas las tablas (cuentas, facturas, pagos, mutuales, ítems, configuración). Recomendado guardarlo cada mes en tu computador o Drive.</p>
        <Btn id="full" onClick={respaldoCompleto} primary>⬇ Descargar respaldo completo</Btn>
      </div>

      <div className="card">
        <h2>Reportes por tabla</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn id="cuentas_cobro" onClick={() => tabla("cuentas_cobro", "Cuentas de cobro")}>⬇ Cuentas de cobro</Btn>
          <Btn id="facturas_siigo" onClick={() => tabla("facturas_siigo", "Facturas por asociado")}>⬇ Facturas (asociados)</Btn>
          <Btn id="pagos" onClick={() => tabla("pagos", "Pagos")}>⬇ Pagos</Btn>
          <Btn id="mutuales" onClick={() => tabla("mutuales", "Clientes - Mutuales")}>⬇ Clientes / Mutuales</Btn>
        </div>
        {msg && <div className="err" style={{ marginTop: 14 }}>{msg}</div>}
      </div>

      <div className="card">
        <h2>Archivos SIIGO por lote</h2>
        <p style={{ fontSize: 13, color: "var(--gris)", marginBottom: 14 }}>
          Re-descarga los 3 archivos (Terceros, Facturas, Comprobantes) de cada lote generado por el sistema.
          Disponible para lotes generados de este mes en adelante (los anteriores están en tu Excel/carpetas).
        </p>
        <div className="tbl-wrap" style={{ maxHeight: 400 }}>
          <table>
            <thead><tr><th>CC #</th><th>Cliente / Mutual</th><th>Fecha</th><th></th></tr></thead>
            <tbody>
              {lotes.map((l) => (
                <tr key={l.cc}>
                  <td>{l.cc}</td><td>{l.cliente}</td><td>{fmtF(l.fecha)}</td>
                  <td><button className="logout" disabled={bajando === l.cc} onClick={() => descargarLote(l.cc)}>{bajando === l.cc ? "Abriendo…" : "⬇ Archivos SIIGO"}</button></td>
                </tr>
              ))}
              {lotes.length === 0 && <tr><td colSpan={4} style={{ color: "var(--gris)" }}>Aún no hay lotes generados por el sistema.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
