"use client";
import { useState } from "react";
import * as XLSX from "xlsx-js-style";

const HOY = () => new Date().toISOString().slice(0, 10);

export default function Reportes() {
  const [cargando, setCargando] = useState("");
  const [msg, setMsg] = useState("");

  async function traer() {
    const r = await fetch("/api/export", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Error");
    return d;
  }

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
        <h2>Archivos SIIGO de cada lote</h2>
        <p style={{ fontSize: 13, color: "var(--gris)" }}>
          La re-descarga de los 3 archivos SIIGO (Terceros, Facturas, Comprobantes) de cada lote generado se habilitará con el
          archivado en la nube (próximo paso). Aplicará para los lotes generados de este mes en adelante.
        </p>
      </div>
    </div>
  );
}
