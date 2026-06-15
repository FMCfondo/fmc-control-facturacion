"use client";
import { useEffect, useState } from "react";
import { leerExcel, leerHoja, procesarFilas, procesarTexto } from "../../lib/siigo/procesar";
import { generarArchivosSiigo, descargar } from "../../lib/siigo/generar";
import { desglosarComision, round2, round6 } from "../../lib/siigo/utils";
import { fmtPesos } from "../../lib/format";
import LogoutButton from "../LogoutButton";

const MESES_ABBR = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];

export default function Generar() {
  const [mutuales, setMutuales] = useState([]);
  const [cargandoCfg, setCargandoCfg] = useState(true);
  const [cfgErr, setCfgErr] = useState("");

  const [mutualId, setMutualId] = useState("");
  const [fecha, setFecha] = useState("");
  const [cc, setCc] = useState("");
  const [factIni, setFactIni] = useState("");

  const [modo, setModo] = useState("file"); // file | paste
  const [texto, setTexto] = useState("");
  const [fileInfo, setFileInfo] = useState("");
  const [archivoBuf, setArchivoBuf] = useState(null);
  const [hojas, setHojas] = useState([]);
  const [hojaSel, setHojaSel] = useState("");

  const [records, setRecords] = useState(null);
  const [errs, setErrs] = useState([]);
  const [files, setFiles] = useState([]);
  const [registrando, setRegistrando] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/consecutivos")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setMutuales(d.mutuales || []);
        setCc(String(d.proximoCC));
        setFactIni(String(d.proximaFactura));
      })
      .catch((e) => setCfgErr(e.message))
      .finally(() => setCargandoCfg(false));
  }, []);

  const mutual = mutuales.find((m) => m.id === mutualId);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const { hojas, hojaElegida, rows } = leerExcel(buf);
    setArchivoBuf(buf); setHojas(hojas); setHojaSel(hojaElegida);
    setFileInfo(`✓ ${file.name} — ${rows.length} filas`);
    const { records, errs } = procesarFilas(rows);
    setRecords(records); setErrs(errs); setFiles([]); setRegistrado(false); setMsg("");
  }

  function cambiarHoja(nombre) {
    if (!archivoBuf) return;
    setHojaSel(nombre);
    const rows = leerHoja(archivoBuf, nombre);
    setFileInfo(`✓ ${rows.length} filas`);
    const { records, errs } = procesarFilas(rows);
    setRecords(records); setErrs(errs); setFiles([]); setRegistrado(false); setMsg("");
  }

  function procesarPegado() {
    const { records, errs } = procesarTexto(texto);
    setRecords(records); setErrs(errs); setFiles([]); setRegistrado(false); setMsg("");
  }

  const total = records ? records.reduce((s, r) => s + r.valorComision, 0) : 0;
  const factFin = records && factIni ? Number(factIni) + records.length - 1 : null;

  async function generarYRegistrar() {
    if (!records || !mutual || !fecha || !cc || !factIni) return;
    setRegistrando(true); setMsg("");
    try {
      // 1. Generar y descargar los 3 archivos SIIGO
      const gen = generarArchivosSiigo({
        records,
        mutual: { nombre_corto: mutual.nombre_corto, nit: mutual.nit },
        fechaISO: fecha,
        factIni: Number(factIni),
        cdc: Number(cc),
      });
      gen.forEach(descargar);
      setFiles(gen);

      // 2. Desglose agregado (reserva / administración / IVA)
      let reserva = 0, admin = 0, iva = 0;
      records.forEach((r) => {
        const d = desglosarComision(r.valorComision, mutual.es_socia);
        reserva += d.reservaIndividual; admin += d.administracion; iva += d.iva;
      });

      // 3. Vencimiento (+8 días) y nombre de documento
      const d = new Date(fecha + "T12:00:00");
      const venc = new Date(d); venc.setDate(venc.getDate() + 8);
      const docNombre = `CC-${cc} -- (${MESES_ABBR[d.getMonth()]}${d.getFullYear()}) CUENTA DE COBRO ${mutual.nombre_corto}`;

      // 4. Registrar en la base de datos
      const cuenta = {
        consecutivo: Number(cc), tipo: "regular", mutual_id: mutual.id,
        mes: d.getMonth() + 1, anio: d.getFullYear(),
        fecha_elaboracion: fecha, fecha_vencimiento: venc.toISOString().slice(0, 10),
        factura_inicial: Number(factIni), factura_final: factFin, num_facturas: records.length,
        valor_facturado: round2(total), reserva_individual: round2(reserva),
        administracion: round2(admin), iva: round2(iva),
        documento_nombre: docNombre, origen: "app",
      };
      const facturas = records.map((r, i) => ({
        consecutivo: Number(factIni) + i, cedula: r.id, nombre: r.nombre, email: r.email,
        telefono: r.tel, ciudad_depto: r.ciudadDepto, cod_ciudad: r.geo.cod_ciudad,
        valor_comision: round2(r.valorComision), valor_base: round6(r.valorComision / 1.19),
      }));

      const res = await fetch("/api/registrar-lote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuenta, facturas }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Error al registrar");
      setRegistrado(true);
      setMsg(`✓ Lote registrado: cuenta de cobro #${cc}, facturas ${factIni}–${factFin}.`);
    } catch (e) {
      setMsg("✗ " + e.message);
    } finally {
      setRegistrando(false);
    }
  }

  const listoParaGenerar = records && records.length && mutual && fecha && cc && factIni;

  return (
    <div className="wrap">
      <div className="header">
        <div className="header-row">
          <div>
            <h1>Generar facturación</h1>
            <p>Carga el Excel de la mutual, valida y genera los 3 archivos SIIGO</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a className="logout" href="/">← Tablero</a>
            <LogoutButton />
          </div>
        </div>
      </div>

      {cfgErr && <div className="err">No se pudo cargar la configuración: {cfgErr}</div>}

      {/* Configuración */}
      <div className="card">
        <h2>1. Configuración</h2>
        <div className="cards" style={{ marginBottom: 0 }}>
          <label className="fld">Mutual
            <select value={mutualId} onChange={(e) => setMutualId(e.target.value)} disabled={cargandoCfg}>
              <option value="">Seleccionar…</option>
              {mutuales.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </label>
          <label className="fld">Fecha de elaboración
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="fld">Cuenta de cobro #
            <input type="number" value={cc} onChange={(e) => setCc(e.target.value)} />
          </label>
          <label className="fld">Factura inicial #
            <input type="number" value={factIni} onChange={(e) => setFactIni(e.target.value)} />
          </label>
        </div>
        {!cargandoCfg && <p className="hint">El sistema propuso CC #{cc} y factura #{factIni} (puedes ajustarlos).</p>}
      </div>

      {/* Datos */}
      <div className="card">
        <h2>2. Datos de la plantilla</h2>
        <div className="tabs2">
          <button className={modo === "file" ? "on" : ""} onClick={() => setModo("file")}>📂 Cargar Excel</button>
          <button className={modo === "paste" ? "on" : ""} onClick={() => setModo("paste")}>📋 Pegar</button>
        </div>
        {modo === "file" ? (
          <div>
            <input type="file" accept=".xlsx,.xlsm,.xls" onChange={onFile} />
            {hojas.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <label className="fld" style={{ maxWidth: 320 }}>Hoja a procesar
                  <select value={hojaSel} onChange={(e) => cambiarHoja(e.target.value)}>
                    {hojas.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              </div>
            )}
            {fileInfo && <p className="hint" style={{ color: "#10b981" }}>{fileInfo} {hojaSel && `· hoja: "${hojaSel}"`}</p>}
          </div>
        ) : (
          <div>
            <textarea rows={6} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Pega aquí las filas de Excel (tab-separated)…"
              style={{ width: "100%", fontFamily: "monospace", fontSize: 11, padding: 8, border: "1px solid #cbd5e1", borderRadius: 6 }} />
            <button className="btn-login" style={{ width: "auto", padding: "8px 16px", marginTop: 8 }} onClick={procesarPegado}>Procesar pegado</button>
          </div>
        )}
      </div>

      {/* Validación */}
      {records && (
        <div className="card">
          <h2>3. Validación — {records.length} registros</h2>
          {errs.length > 0 && (
            <div className="err" style={{ marginBottom: 12 }}>
              <strong>⚠ {errs.length} advertencia(s):</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 20, maxHeight: 160, overflow: "auto" }}>
                {errs.slice(0, 60).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          <div className="resumen">
            <span><b>Total (IVA inc.):</b> {fmtPesos(total)}</span>
            <span><b>Antes de IVA:</b> {fmtPesos(total / 1.19)}</span>
            <span><b>Facturas:</b> #{factIni} – #{factFin}</span>
          </div>
          <div className="tbl-wrap" style={{ maxHeight: 320, marginTop: 12 }}>
            <table>
              <thead><tr><th>#</th><th>ID</th><th>DV</th><th>Nombres</th><th>Apellidos</th><th>Correo</th><th>Tel</th><th>Cod</th><th>Valor</th></tr></thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td><td>{r.id}</td><td>{r.dv}</td><td>{r.nombres}</td><td>{r.apellidos}</td>
                    <td className={r.emailOk ? "" : "bad"}>{r.email}</td>
                    <td className={r.telOk ? "" : "bad"}>{r.tel || "⚠"}</td>
                    <td className={r.geo.error ? "bad" : (r.geo.warn ? "warnc" : "")}>{r.geo.cod_ciudad || "⚠"}</td>
                    <td className="num">{fmtPesos(r.valorComision)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className="btn-login" style={{ marginTop: 16 }}
            onClick={generarYRegistrar} disabled={!listoParaGenerar || registrando || registrado}>
            {registrando ? "Generando y registrando…" : registrado ? "✓ Generado" : "Generar archivos y registrar lote"}
          </button>
          {msg && <div className={msg.startsWith("✓") ? "ok-box" : "err"} style={{ marginTop: 12 }}>{msg}</div>}
        </div>
      )}

      {/* Descargas (re-descargar si hace falta) */}
      {files.length > 0 && (
        <div className="card">
          <h2>Archivos generados</h2>
          {files.map((f, i) => (
            <div key={i} className="dl-line">
              <span>{f.icon} {f.label} — <code>{f.name}</code></span>
              <button className="logout" style={{ color: "#1e40af", borderColor: "#93c5fd", background: "#eff6ff" }} onClick={() => descargar(f)}>Descargar</button>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .fld{display:flex;flex-direction:column;font-size:13px;font-weight:600;color:#334155;gap:6px}
        .fld select,.fld input{padding:9px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;font-weight:400}
        .hint{font-size:12px;color:#64748b;margin-top:10px}
        .tabs2{display:flex;gap:6px;margin-bottom:12px}
        .tabs2 button{flex:0 0 auto;padding:8px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;color:#64748b}
        .tabs2 button.on{background:#3b82f6;color:#fff;border-color:#3b82f6}
        .resumen{display:flex;gap:20px;flex-wrap:wrap;padding:10px;background:#f0fdf4;border-radius:8px;font-size:13px}
        .ok-box{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;color:#166534;font-size:13px}
        .dl-line{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px;font-size:12px}
      `}</style>
    </div>
  );
}
