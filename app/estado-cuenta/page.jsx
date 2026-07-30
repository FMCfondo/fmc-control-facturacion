"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtPesos, fmtFecha } from "../../lib/format";

const HOY = () => new Date(new Date().toISOString().slice(0, 10) + "T12:00:00");
const diasVencido = (vence) => {
  if (!vence) return 0;
  return Math.max(0, Math.round((HOY() - new Date(String(vence).slice(0, 10) + "T12:00:00")) / 86400000));
};

export default function EstadoCuenta() {
  const [pend, setPend] = useState(null);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);          // cliente abierto en el panel
  const [envio, setEnvio] = useState(null);      // { to, cc, mensaje }
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/estado-cuenta", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setPend(d.pendientes || []); })
      .catch((e) => setErr(e.message));
  }, []);

  // Marca el <body> para que al imprimir solo salga el documento.
  useEffect(() => {
    document.body.classList.toggle("con-doc", !!sel);
    return () => document.body.classList.remove("con-doc");
  }, [sel]);

  // Agrupa las cuentas pendientes por cliente.
  const grupos = useMemo(() => {
    if (!pend) return [];
    const g = {};
    for (const c of pend) {
      const k = c.cliente;
      if (!g[k]) g[k] = { cliente: k, mutual_id: c.mutual_id, nit: c.nit, correos: c.correos, correos_cc: c.correos_cc, filas: [] };
      g[k].filas.push({ ...c, dias: diasVencido(c.vence) });
    }
    return Object.values(g).map((x) => {
      const saldo = x.filas.reduce((s, f) => s + f.saldo, 0);
      const vencido = x.filas.filter((f) => f.dias > 0).reduce((s, f) => s + f.saldo, 0);
      const maxDias = x.filas.reduce((m, f) => Math.max(m, f.dias), 0);
      return { ...x, saldo, vencido, maxDias, filas: x.filas.sort((a, b) => String(a.vence || "").localeCompare(String(b.vence || ""))) };
    }).sort((a, b) => b.saldo - a.saldo);
  }, [pend]);

  const totSaldo = grupos.reduce((s, g) => s + g.saldo, 0);
  const totVencido = grupos.reduce((s, g) => s + g.vencido, 0);
  const totCuentas = grupos.reduce((s, g) => s + g.filas.length, 0);

  function abrirEnvio(g) {
    setMsg("");
    setEnvio({ to: g.correos || "", cc: g.correos_cc || "", mensaje: "" });
  }
  async function enviar() {
    setEnviando(true); setMsg("");
    try {
      const res = await fetch("/api/enviar-estado-cuenta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutual_id: sel.mutual_id, cliente: sel.cliente, ...envio }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setMsg("✓ Estado de cuenta enviado correctamente.");
      setEnvio(null);
    } catch (e) { setMsg("✗ " + e.message); }
    finally { setEnviando(false); }
  }

  if (err) return <div className="wrap"><div className="err">Error: {err}</div></div>;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Estado de cuenta</h1>
        <p>Saldos pendientes por cliente/intermediario · corte {fmtFecha(HOY().toISOString().slice(0, 10))}</p>
      </div>

      {!pend ? <div className="card">Cargando…</div> : (
        <>
          <div className="cards">
            <div className="kpi destacado">
              <div className="label">Saldo total pendiente</div>
              <div className="value">{fmtPesos(totSaldo)}</div>
              <div className="sub">{totCuentas} cuenta(s) de cobro</div>
            </div>
            <div className="kpi">
              <div className="label">Saldo vencido</div>
              <div className="value" style={{ color: totVencido > 0 ? "#b91c1c" : undefined }}>{fmtPesos(totVencido)}</div>
              <div className="sub">{totVencido > 0 ? "requiere gestión" : "sin vencidos"}</div>
            </div>
            <div className="kpi">
              <div className="label">Clientes con saldo</div>
              <div className="value">{grupos.length}</div>
            </div>
          </div>

          <div className="card">
            <h2>Clientes / intermediarios con saldo ({grupos.length})</h2>
            {grupos.length === 0 ? (
              <p className="nota">No hay saldos pendientes. Toda la cartera está al día.</p>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr><th>Cliente / mutual</th><th>Cuentas</th><th>Saldo</th><th>Vencido</th><th>Mora máx.</th><th></th></tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <tr key={g.cliente} className="fila-click" onClick={() => setSel(g)}>
                        <td><b>{g.cliente}</b></td>
                        <td>{g.filas.length}</td>
                        <td className="num">{fmtPesos(g.saldo)}</td>
                        <td className="num" style={{ color: g.vencido > 0 ? "#b91c1c" : "var(--gris)", fontWeight: g.vencido > 0 ? 600 : 400 }}>
                          {g.vencido > 0 ? fmtPesos(g.vencido) : "—"}
                        </td>
                        <td>{g.maxDias > 0 ? <span className="pill-mora">{g.maxDias} días</span> : "—"}</td>
                        <td><button className="mini" onClick={(e) => { e.stopPropagation(); setSel(g); }}>Ver detalle</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="nota">Haz clic en un cliente para ver el detalle y enviarle el estado de cuenta.</p>
          </div>
        </>
      )}

      {/* Panel superpuesto con el detalle del cliente */}
      {sel && (
        <div className="doc-overlay" onClick={(e) => e.target === e.currentTarget && setSel(null)}>
          <div className="doc-panel">
            <div className="ec-doc">
              <div className="no-print ec-barra">
                <button className="btn-sec" onClick={() => setSel(null)}>← Cerrar</button>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn-print" onClick={() => window.print()}>🖨 Imprimir</button>
                  <button className="btn-enviar" onClick={() => abrirEnvio(sel)}>✉ Enviar estado de cuenta</button>
                </div>
              </div>

              <div className="hoja">
                <div className="ec-enc">
                  <div>
                    <div className="ec-tit">ESTADO DE CUENTA</div>
                    <div className="ec-cli">{sel.cliente}</div>
                    {sel.nit && <div className="ec-sub">NIT: {sel.nit}</div>}
                    <div className="ec-sub">Corte: {fmtFecha(HOY().toISOString().slice(0, 10))}</div>
                  </div>
                  <div className="ec-box">
                    <div className="ec-box-l">Saldo total</div>
                    <div className="ec-box-v">{fmtPesos(sel.saldo)}</div>
                    {sel.vencido > 0 && <div className="ec-box-x">Vencido: {fmtPesos(sel.vencido)}</div>}
                  </div>
                </div>

                <table className="ec-tbl">
                  <thead>
                    <tr>
                      <th>CC N°</th><th>Elaboración</th><th>Vencimiento</th><th>Días vencido</th>
                      <th>Facturado</th><th>Abonos</th><th>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sel.filas.map((f) => (
                      <tr key={f.id}>
                        <td>{f.cc}</td>
                        <td>{fmtFecha(f.fecha)}</td>
                        <td>{fmtFecha(f.vence)}</td>
                        <td className="c">{f.dias > 0 ? <b className="rojo">{f.dias}</b> : "—"}</td>
                        <td className="r">{fmtPesos(f.facturado)}</td>
                        <td className="r">{fmtPesos(f.recibido)}</td>
                        <td className="r"><b>{fmtPesos(f.saldo)}</b></td>
                      </tr>
                    ))}
                    <tr className="ec-total">
                      <td colSpan={4}>Total ({sel.filas.length} cuenta{sel.filas.length !== 1 ? "s" : ""} pendiente{sel.filas.length !== 1 ? "s" : ""})</td>
                      <td className="r">{fmtPesos(sel.filas.reduce((s, f) => s + f.facturado, 0))}</td>
                      <td className="r">{fmtPesos(sel.filas.reduce((s, f) => s + f.recibido, 0))}</td>
                      <td className="r">{fmtPesos(sel.saldo)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="ec-pie">
                  Documento informativo de las cuentas de cobro pendientes a la fecha de corte.
                  Si ya realizó alguno de estos pagos, por favor remita el soporte para actualizar el registro.
                </p>
              </div>

              {msg && <div className={"no-print " + (msg.startsWith("✓") ? "ok-box" : "err")} style={{ marginTop: 12 }}>{msg}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Modal de envío */}
      {envio && (
        <div className="no-print modal-bg" style={{ zIndex: 80 }} onClick={(e) => e.target === e.currentTarget && setEnvio(null)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3>Enviar estado de cuenta — {sel?.cliente}</h3>
            <label className="lbl">Para (separa con coma)
              <input value={envio.to} onChange={(e) => setEnvio({ ...envio, to: e.target.value })} placeholder="correo@mutual.com" />
            </label>
            <label className="lbl">Copias CC (opcional)
              <input value={envio.cc} onChange={(e) => setEnvio({ ...envio, cc: e.target.value })} placeholder="copia@mutual.com" />
            </label>
            <label className="lbl">Mensaje (opcional)
              <textarea rows={3} value={envio.mensaje} onChange={(e) => setEnvio({ ...envio, mensaje: e.target.value })} placeholder="Mensaje adicional…" />
            </label>
            {msg && <div className={msg.startsWith("✓") ? "ok-box" : "err"}>{msg}</div>}
            <div className="modal-acc">
              <span style={{ flex: 1 }} />
              <button className="logout" onClick={() => setEnvio(null)} disabled={enviando}>Cancelar</button>
              <button className="btn-enviar" onClick={enviar} disabled={enviando}>{enviando ? "Enviando…" : "Enviar correo"}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .kpi.destacado{border-left:5px solid var(--dorado)}
        .nota{font-size:11.5px;color:var(--gris);margin-top:10px}
        .fila-click{cursor:pointer}
        .pill-mora{background:#fee2e2;color:#991b1b;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600}
        .mini{background:#eff6ff;color:#1e40af;border:1px solid #93c5fd;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer}
        .rojo{color:#b91c1c}
        .ec-doc{padding:10px;font-family:"Aptos","Segoe UI",system-ui,sans-serif}
        .ec-barra{display:flex;justify-content:space-between;margin-bottom:14px;gap:8px;flex-wrap:wrap}
        .btn-print{background:#1a3a8f;color:#fff;border:none;border-radius:8px;padding:10px 20px;font-size:14px;font-weight:700;cursor:pointer}
        .btn-sec{background:#eef1f6;color:#334155;border:1px solid #e3e8ef;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer}
        .btn-enviar{background:#c9a14a;color:#102558;border:none;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:700;cursor:pointer}
        .btn-enviar:disabled{opacity:.6;cursor:not-allowed}
        .hoja{background:#fff;border:1px solid #e3e8ef;border-radius:8px;padding:32px}
        .ec-enc{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid #c9a14a;padding-bottom:16px;margin-bottom:18px}
        .ec-tit{font-size:20px;font-weight:800;color:#102558;letter-spacing:1px}
        .ec-cli{font-size:15px;font-weight:700;color:#102558;margin-top:8px}
        .ec-sub{font-size:11.5px;color:#6b7585;margin-top:3px}
        .ec-box{background:#102558;color:#fff;border-radius:10px;padding:12px 18px;text-align:center;min-width:170px}
        .ec-box-l{font-size:10px;font-weight:600;color:#e3c97a;text-transform:uppercase;letter-spacing:.5px}
        .ec-box-v{font-size:20px;font-weight:800;margin-top:3px}
        .ec-box-x{font-size:11px;color:#fca5a5;margin-top:4px;font-weight:600}
        .ec-tbl{width:100%;border-collapse:collapse;font-size:12px}
        .ec-tbl th{background:#102558;color:#fff;padding:8px;text-align:left;white-space:nowrap}
        .ec-tbl td{padding:8px;border-bottom:1px solid #e3e8ef}
        .ec-tbl td.r{text-align:right}.ec-tbl td.c{text-align:center}
        .ec-tbl tr.ec-total td{font-weight:800;border-top:2px solid #c9a14a;background:#f7f3e8;color:#102558}
        .ec-pie{font-size:10.5px;color:#94a3b8;margin-top:18px;line-height:1.5}
        .lbl{display:block;font-size:13px;font-weight:600;color:#3a4358;margin-bottom:12px}
        .lbl input,.lbl textarea{width:100%;margin-top:5px;padding:9px 11px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;font-weight:400;font-family:inherit}
        .ok-box{background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px;color:#166534;font-size:13px;margin-bottom:10px}
        @media print{.no-print{display:none}.ec-doc{padding:0}.hoja{border:none;border-radius:0;padding:0}}
      `}</style>
    </div>
  );
}
