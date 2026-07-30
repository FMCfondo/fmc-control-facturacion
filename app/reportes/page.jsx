"use client";
import { useEffect, useState } from "react";
// xlsx-js-style se carga bajo demanda (import dinámico) para no inflar el bundle inicial.

const HOY = () => new Date().toISOString().slice(0, 10);
const fmtF = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("es-CO") : "");
const TIPO_BACKUP = "Respaldo BD";
const DIAS_AVISO = 40; // el respaldo es mensual: pasados ~40 días se avisa

export default function Reportes() {
  const [cargando, setCargando] = useState("");
  const [msg, setMsg] = useState("");
  const [lotes, setLotes] = useState([]);
  const [bajando, setBajando] = useState(null);
  const [diasBackup, setDiasBackup] = useState(null); // días desde el último respaldo de BD

  useEffect(() => {
    fetch("/api/archivos", { cache: "no-store" }).then((r) => r.json()).then((d) => setLotes(d.lotes || [])).catch(() => {});
    // ¿Hace cuánto no se respalda la base de datos? (se lee de la bitácora)
    fetch("/api/actividad", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      const ult = (d.actividad || []).find((a) => a.tipo === TIPO_BACKUP);
      setDiasBackup(ult ? Math.floor((Date.now() - new Date(ult.creado_en)) / 86400000) : -1);
    }).catch(() => {});
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
  const hoja = (XLSX, arr) => XLSX.utils.json_to_sheet(arr.length ? arr : [{ vacio: "sin datos" }]);

  async function respaldoCompleto() {
    setCargando("full"); setMsg("");
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const d = await traer();
      const wb = XLSX.utils.book_new();
      const hojas = {
        "Cuentas de cobro": d.cuentas_cobro, "Facturas": d.facturas_siigo, "Pagos": d.pagos,
        "Mutuales": d.mutuales, "Items": d.items_cuenta_cobro, "Config": d.config, "Parametros": d.parametros,
      };
      Object.entries(hojas).forEach(([n, arr]) => XLSX.utils.book_append_sheet(wb, hoja(XLSX, arr || []), n.slice(0, 31)));
      XLSX.writeFile(wb, `Respaldo FMC - ${HOY()}.xlsx`);
      logDescarga("Respaldo completo descargado");
    } catch (e) { setMsg("✗ " + e.message); }
    setCargando("");
  }

  async function tabla(clave, nombre) {
    setCargando(clave); setMsg("");
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const d = await traer();
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, hoja(XLSX, d[clave] || []), nombre.slice(0, 31));
      XLSX.writeFile(wb, `${nombre} - ${HOY()}.xlsx`);
      logDescarga(`Reporte "${nombre}" descargado`);
    } catch (e) { setMsg("✗ " + e.message); }
    setCargando("");
  }

  // Respaldo restaurable de la BD: estructura + datos en un solo archivo .sql.
  // Se arma en el navegador (así no topa con los límites de tamaño de Vercel).
  async function respaldoBD() {
    setCargando("bd"); setMsg("");
    try {
      const { generarBackupSQL } = await import("../../lib/backup");
      const d = await traer();
      const { sql, resumen } = generarBackupSQL(d);
      const total = resumen.reduce((s, [, n]) => s + n, 0);
      const url = URL.createObjectURL(new Blob([sql], { type: "application/sql;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = `Respaldo BD FMC - ${HOY()}.sql`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await fetch("/api/actividad", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: TIPO_BACKUP,
          descripcion: `Respaldo de base de datos descargado (${total.toLocaleString("es-CO")} filas)`,
          detalle: Object.fromEntries(resumen),
        }),
      }).catch(() => {});
      setDiasBackup(0);
      setMsg(`✓ Respaldo generado: ${total.toLocaleString("es-CO")} filas. Guárdalo en Drive.`);
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

      {/* Aviso: el plan Free de Supabase no hace backups; el respaldo depende de este botón */}
      {diasBackup !== null && (diasBackup < 0 || diasBackup >= DIAS_AVISO) && (
        <div className="aviso-backup">
          <b>{diasBackup < 0 ? "Nunca has respaldado la base de datos." : `Último respaldo de la base de datos: hace ${diasBackup} días.`}</b>
          {" "}Supabase (plan Free) no hace copias automáticas: la única copia restaurable es la que descargues aquí.
        </div>
      )}

      <div className="card">
        <h2>Respaldo de la base de datos</h2>
        <p style={{ fontSize: 13, color: "var(--gris)", marginBottom: 14 }}>
          Archivo <code>.sql</code> con la <b>estructura y todos los datos</b>. Es el respaldo que sirve para
          <b> reconstruir el sistema completo</b> si se pierde el proyecto: se pega en el editor SQL de un
          proyecto nuevo y queda todo igual. Descárgalo cada mes y guárdalo en Drive.
          {diasBackup > 0 && diasBackup < DIAS_AVISO && <><br /><span style={{ color: "#166534" }}>Último respaldo: hace {diasBackup} día(s).</span></>}
        </p>
        <Btn id="bd" onClick={respaldoBD} primary>⬇ Descargar respaldo de base de datos (.sql)</Btn>
        <p style={{ fontSize: 11.5, color: "var(--gris)", marginTop: 10 }}>
          Contiene datos personales de los asociados: guárdalo en un lugar privado, nunca en repositorios públicos.
        </p>
      </div>

      <div className="card">
        <h2>Respaldo en Excel (para consultar)</h2>
        <p style={{ fontSize: 13, color: "var(--gris)", marginBottom: 14 }}>Un solo archivo Excel con todas las tablas (cuentas, facturas, pagos, mutuales, ítems, configuración). Útil para revisar o compartir información; <b>no</b> sirve para restaurar el sistema.</p>
        <Btn id="full" onClick={respaldoCompleto}>⬇ Descargar respaldo en Excel</Btn>
      </div>

      <div className="card">
        <h2>Reportes por tabla</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn id="cuentas_cobro" onClick={() => tabla("cuentas_cobro", "Cuentas de cobro")}>⬇ Cuentas de cobro</Btn>
          <Btn id="facturas_siigo" onClick={() => tabla("facturas_siigo", "Facturas por asociado")}>⬇ Facturas (asociados)</Btn>
          <Btn id="pagos" onClick={() => tabla("pagos", "Pagos")}>⬇ Pagos</Btn>
          <Btn id="mutuales" onClick={() => tabla("mutuales", "Clientes - Mutuales")}>⬇ Clientes / Mutuales</Btn>
        </div>
        {msg && <div className={msg.startsWith("✓") ? "ok-backup" : "err"} style={{ marginTop: 14 }}>{msg}</div>}
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

      <style>{`
        .aviso-backup{background:#fffbeb;border:1px solid #fde68a;border-left:5px solid var(--dorado);border-radius:10px;padding:13px 16px;font-size:13px;color:#854d0e;margin-bottom:18px;line-height:1.5}
        .ok-backup{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;color:#166534;font-size:13px}
      `}</style>
    </div>
  );
}
