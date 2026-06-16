"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FONDO } from "../../../lib/siigo/constantes";
import { fmtPesos, fmtFecha } from "../../../lib/format";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export default function CuentaCobroDoc() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [impr, setImpr] = useState("unido"); // unido | cuenta | anexo
  const imprimir = (m) => { setImpr(m); setTimeout(() => window.print(), 60); };
  const [envioAbierto, setEnvioAbierto] = useState(false);
  const [to, setTo] = useState(""), [cc, setCc] = useState(""), [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false), [envioMsg, setEnvioMsg] = useState("");

  useEffect(() => {
    fetch(`/api/documento?id=${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setData(d); })
      .catch((e) => setErr(e.message));
  }, [id]);

  if (err) return <div style={{ padding: 40 }}>Error: {err}</div>;
  if (!data) return <div style={{ padding: 40 }}>Cargando…</div>;

  const { cuenta, mutual, items, facturas, fondo: cfg } = data;
  // Datos del Fondo: editables desde Clientes (config), con respaldo a la constante.
  const FOND = {
    nombre: cfg?.fondo_nombre || FONDO.nombre,
    nit: cfg?.fondo_nit || FONDO.nit,
    direccion: cfg?.fondo_direccion || FONDO.direccion,
    correo: cfg?.fondo_correo || FONDO.correo,
    telefono: cfg?.fondo_telefono || FONDO.telefono,
  };
  const hayAnexo = facturas && facturas.length > 0;
  const totalAnexo = (facturas || []).reduce((s, f) => s + Number(f.valor_comision || 0), 0);

  function abrirEnvio() {
    setTo(mutual?.correos_envio || mutual?.correo || cuenta.cliente_correo || "");
    setCc(mutual?.correos_cc || "");
    setMensaje(""); setEnvioMsg(""); setEnvioAbierto(true);
  }
  async function enviar() {
    setEnviando(true); setEnvioMsg("");
    try {
      const res = await fetch("/api/enviar-correo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, to, cc, mensaje }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setEnvioMsg("✓ Correo enviado correctamente.");
    } catch (e) { setEnvioMsg("✗ " + e.message); }
    finally { setEnviando(false); }
  }

  // Cliente
  const cli = mutual
    ? { nombre: mutual.nombre, nit: `${mutual.nit}-${mutual.dv}`, dir: mutual.direccion, tel: mutual.telefono, email: mutual.correo }
    : { nombre: cuenta.cliente_nombre, nit: cuenta.cliente_nit, dir: cuenta.cliente_direccion, tel: "", email: cuenta.cliente_correo };

  // Líneas e importes
  let lineas, subtotal;
  if (items && items.length) {
    lineas = items.map((it) => ({ q: it.cantidad, codigo: it.codigo, desc: it.descripcion, unit: Number(it.valor_unitario), sub: Number(it.subtotal) }));
    subtotal = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);
  } else {
    const base = (Number(cuenta.valor_facturado) || 0) / 1.19;
    const desc = mutual
      ? `SERVICIO DE COBERTURA DE CRÉDITOS${cuenta.mes ? ` (${MESES[cuenta.mes - 1]} ${cuenta.anio})` : ""}`
      : (cuenta.notas || "Cuenta de cobro");
    lineas = [{ q: 1, codigo: mutual ? "FMC01" : "", desc, unit: base, sub: base }];
    subtotal = base;
  }
  const iva = subtotal * 0.19;
  const anticipos = Math.abs(Number(cuenta.anticipos) || 0);
  const total = subtotal + iva - anticipos;

  return (
    <div className="doc-wrap">
      <div className="no-print barra">
        <a href="/" className="btn-sec">← Volver</a>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-print" onClick={() => imprimir("unido")}>🖨 Documento unido</button>
          <button className="btn-sec" onClick={() => imprimir("cuenta")}>Solo cuenta</button>
          {hayAnexo && <button className="btn-sec" onClick={() => imprimir("anexo")}>Solo anexo</button>}
          <button className="btn-enviar" onClick={abrirEnvio}>✉ Enviar a la mutual</button>
        </div>
      </div>

      <div id="documento">
      <div className={"hoja " + (impr === "anexo" ? "oculto-print" : "")}>
        <div className="enc">
          <div className="enc-izq">
            <img src="/FMC-LOGO.jpeg" alt="" className="logo" onError={(e) => { e.target.style.display = "none"; }} />
            <div>
              <div className="titulo">CUENTA DE COBRO</div>
              <div className="fondo-nom">{FOND.nombre}</div>
              <div className="fondo-info">
                {FOND.correo}<br />{FOND.direccion}<br />NIT: {FOND.nit}<br />{FOND.telefono}
              </div>
            </div>
          </div>
          <div className="cc-box">
            <div className="cc-label">Cuenta de cobro No.</div>
            <div className="cc-num">{cuenta.consecutivo}</div>
          </div>
        </div>

        <div className="seccion">DATOS DEL CLIENTE</div>
        <div className="cliente">
          <div><b>NOMBRE:</b> {cli.nombre || "—"}</div>
          <div><b>FECHA ELABORACIÓN:</b> {fmtFecha(cuenta.fecha_elaboracion)}</div>
          <div><b>DIRECCIÓN:</b> {cli.dir || "—"}</div>
          <div><b>FECHA VENCIMIENTO:</b> {fmtFecha(cuenta.fecha_vencimiento)}</div>
          <div><b>NIT:</b> {cli.nit || "—"}</div>
          <div><b>VENDEDOR:</b> {FOND.nombre}</div>
          <div><b>TELÉFONO:</b> {cli.tel || "—"}</div>
          <div><b>EMAIL:</b> {cli.email || "—"}</div>
        </div>

        <table className="items">
          <thead>
            <tr><th>Cant.</th><th>Código</th><th>Descripción</th><th>Precio unit.</th><th>Subtotal</th></tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i}>
                <td className="c">{l.q}</td>
                <td className="c">{l.codigo || "—"}</td>
                <td>{l.desc}</td>
                <td className="r">{fmtPesos(l.unit)}</td>
                <td className="r">{fmtPesos(l.sub)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="pie">
          <div className="pago">
            <div><b>Forma de pago:</b> Crédito</div>
            <div><b>Medio de pago:</b> Contado</div>
          </div>
          <table className="tot">
            <tbody>
              <tr><td>SUBTOTAL:</td><td className="r">{fmtPesos(subtotal)}</td></tr>
              <tr><td>IVA 19%:</td><td className="r">{fmtPesos(iva)}</td></tr>
              {anticipos > 0 && <tr><td>ANTICIPOS:</td><td className="r">−{fmtPesos(anticipos)}</td></tr>}
              <tr className="grande"><td>TOTAL:</td><td className="r">{fmtPesos(total)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="firmas">
          <div><div className="linea" />NOMBRE Y FIRMA DEL VENDEDOR</div>
          <div><div className="linea" />NOMBRE Y FIRMA DEL CLIENTE</div>
        </div>
      </div>

      {hayAnexo && (
        <div className={"hoja anexo-hoja " + (impr === "cuenta" ? "oculto-print " : "") + (impr === "unido" ? "con-salto" : "")}>
          <div className="anexo-tit">Ventas</div>
          <div className="fondo-nom">{FOND.nombre}</div>
          <div className="fondo-info">NIT: {FOND.nit}</div>
          <div style={{ fontSize: 12, margin: "10px 0", color: "#475569" }}>
            Relación de facturas — Cuenta de cobro No. {cuenta.consecutivo}
            {cuenta.documento_nombre ? ` · ${cuenta.documento_nombre}` : ""}
          </div>
          <table className="anexo-tbl">
            <thead>
              <tr><th>Tipo de transacción</th><th>Comprobante</th><th>Fecha elaboración</th><th>Identificación</th><th>Cliente</th><th>Total</th></tr>
            </thead>
            <tbody>
              {facturas.map((f) => (
                <tr key={f.id}>
                  <td>Factura de venta / Ingresos</td>
                  <td>FV-2-{f.consecutivo}</td>
                  <td>{fmtFecha(cuenta.fecha_elaboracion)}</td>
                  <td>{f.cedula}</td>
                  <td>{f.nombre}</td>
                  <td className="r">{fmtPesos(f.valor_comision)}</td>
                </tr>
              ))}
              <tr className="anexo-total">
                <td colSpan={5}>Total ({facturas.length} factura{facturas.length !== 1 ? "s" : ""})</td>
                <td className="r">{fmtPesos(totalAnexo)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      </div>{/* #documento */}

      {envioAbierto && (
        <div className="no-print modal-bg" onClick={(e) => e.target.className.includes("modal-bg") && setEnvioAbierto(false)}>
          <div className="modal-env">
            <h3>Enviar cuenta de cobro N° {cuenta.consecutivo}</h3>
            <label>Para (separa con coma)
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="correo@mutual.com" />
            </label>
            <label>Copias CC (opcional)
              <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="copia@mutual.com" />
            </label>
            <label>Mensaje (opcional)
              <textarea rows={3} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Mensaje adicional…" />
            </label>
            {envioMsg && <div className={envioMsg.startsWith("✓") ? "ok-box" : "err"}>{envioMsg}</div>}
            <div className="env-acc">
              <button className="btn-sec" onClick={() => setEnvioAbierto(false)} disabled={enviando}>Cancelar</button>
              <button className="btn-enviar" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Enviar correo"}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .doc-wrap{max-width:800px;margin:0 auto;padding:16px;font-family:"Aptos","Segoe UI",system-ui,sans-serif;color:#1b2440}
        .btn-enviar{background:#c9a14a;color:#102558;border:none;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer}
        .btn-enviar:disabled{opacity:.6;cursor:not-allowed}
        .modal-env{background:#fff;border-radius:12px;padding:24px;width:100%;max-width:460px}
        .modal-env h3{margin-bottom:16px;color:#102558}
        .modal-env label{display:block;font-size:13px;font-weight:600;color:#3a4358;margin-bottom:12px}
        .modal-env input,.modal-env textarea{width:100%;margin-top:5px;padding:9px 11px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-weight:400;font-family:inherit}
        .env-acc{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
        .ok-box{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px;color:#166534;font-size:13px;margin-bottom:10px}
        .barra{display:flex;justify-content:space-between;margin-bottom:16px}
        .btn-print{background:#1a3a8f;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer}
        .btn-sec{background:#eef1f6;color:#334155;border:1px solid #e3e8ef;border-radius:8px;padding:10px 16px;text-decoration:none;font-size:14px;font-weight:600;cursor:pointer}
        .hoja{background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:36px}
        .enc{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c9a14a;padding-bottom:18px;margin-bottom:18px}
        .enc-izq{display:flex;gap:20px;align-items:center}
        .logo{max-height:130px;max-width:230px;object-fit:contain}
        .titulo{font-size:22px;font-weight:800;color:#102558;letter-spacing:1px}
        .fondo-nom{font-weight:700;margin-top:8px;font-size:14px;color:#102558}
        .fondo-info{font-size:11px;color:#6b7585;margin-top:4px;line-height:1.5}
        .cc-box{background:#102558;color:#fff;border-radius:10px;padding:12px 18px;text-align:center;min-width:150px}
        .cc-label{font-size:10px;font-weight:600;color:#e3c97a;text-transform:uppercase;letter-spacing:.5px}
        .cc-num{font-size:28px;font-weight:800;color:#fff;margin-top:2px}
        .seccion{background:linear-gradient(100deg,#102558,#1a3a8f);color:#fff;font-size:12px;font-weight:700;padding:7px 14px;border-radius:6px;letter-spacing:.5px;border-left:4px solid #c9a14a}
        .cliente{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:12px;padding:14px 4px}
        .items{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
        .items th{background:#102558;color:#fff;padding:9px;text-align:left}
        .items td{padding:9px;border-bottom:1px solid #e3e8ef}
        .items td.c{text-align:center}.items td.r{text-align:right}
        .pie{display:flex;justify-content:space-between;margin-top:20px;gap:24px}
        .pago{font-size:12px;line-height:2;color:#3a4358}
        .tot{font-size:13px;border-collapse:collapse;min-width:250px}
        .tot td{padding:7px 14px}.tot td.r{text-align:right;font-weight:600}
        .tot tr.grande td{font-size:17px;font-weight:800;color:#102558;border-top:2px solid #c9a14a;background:#f7f3e8}
        .firmas{display:flex;justify-content:space-between;gap:40px;margin-top:60px;font-size:11px;font-weight:600;text-align:center;color:#3a4358}
        .firmas>div{flex:1}
        .linea{border-top:1px solid #102558;margin-bottom:6px}
        .anexo-hoja{margin-top:24px}
        .anexo-tit{font-size:20px;font-weight:800;color:#102558;letter-spacing:1px;border-bottom:3px solid #c9a14a;padding-bottom:8px;display:inline-block}
        .anexo-tbl{width:100%;border-collapse:collapse;font-size:11px;margin-top:10px}
        .anexo-tbl th{background:#102558;color:#fff;padding:8px;text-align:left}
        .anexo-tbl td{padding:8px;border-bottom:1px solid #e3e8ef}
        .anexo-tbl td.r{text-align:right}
        .anexo-tbl tr.anexo-total td{font-weight:800;border-top:2px solid #c9a14a;background:#f7f3e8;color:#102558}
        @media print {
          .no-print{display:none}
          .oculto-print{display:none}
          .doc-wrap{padding:0;max-width:100%}
          .hoja{border:none;border-radius:0;padding:0}
          .anexo-hoja{margin-top:0}
          .con-salto{page-break-before:always}
          body{background:#fff}
        }
      `}</style>
    </div>
  );
}
