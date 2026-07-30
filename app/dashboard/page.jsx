"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtPesos } from "../../lib/format";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const HOY = () => new Date(new Date().toISOString().slice(0, 10) + "T12:00:00");
const dias = (a, b) => Math.round((a - b) / 86400000);
// Millones compactos para las etiquetas de los gráficos.
const mill = (v) => (Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + "M" : Math.round(v / 1e3) + "k");

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [fAnio, setFAnio] = useState("");
  const [fMes, setFMes] = useState("");
  const [fMut, setFMut] = useState("");

  useEffect(() => {
    fetch("/api/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((x) => {
        if (x.error) throw new Error(x.error);
        setD(x);
        // Arranca en el año más reciente con datos.
        const as = [...new Set((x.cuentas || []).map((c) => c.anio).filter(Boolean))].sort((a, b) => b - a);
        if (as.length) setFAnio(String(as[0]));
      })
      .catch((e) => setErr(e.message));
  }, []);

  // Filas con los cálculos contables (base / IVA / admin / reserva).
  const filas = useMemo(() => {
    if (!d) return [];
    const { iva, admin_socia, admin_no_socia } = d.params;
    return d.cuentas.map((c) => {
      const base = c.valor / (1 + iva);
      const pct = c.es_socia ? admin_socia : admin_no_socia;
      const admin = c.esMutual ? base * pct : 0;
      return {
        ...c,
        mesNum: c.mes || (c.fecha ? parseInt(String(c.fecha).slice(5, 7)) : 0),
        base, iva: c.valor - base, admin, reserva: c.esMutual ? base - admin : 0,
      };
    });
  }, [d]);

  const anios = useMemo(() => [...new Set(filas.map((f) => f.anio).filter(Boolean))].sort((a, b) => b - a), [filas]);

  // Filtro reutilizable (permite ignorar el mes para el gráfico anual).
  // useCallback: así solo cambia cuando cambian los filtros, y los useMemo que la
  // usan pueden declararla como dependencia sin recalcularse en cada render.
  const aplica = useCallback(
    (f, { anio = fAnio, mes = fMes, mut = fMut } = {}) =>
      (!anio || String(f.anio) === anio) &&
      (!mes || String(f.mesNum) === mes) &&
      (!mut || f.cliente === mut),
    [fAnio, fMes, fMut]
  );

  const sel = useMemo(() => filas.filter((f) => aplica(f)), [filas, aplica]);

  const suma = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
  const tot = {
    valor: suma(sel, "valor"), base: suma(sel, "base"), iva: suma(sel, "iva"),
    admin: suma(sel, "admin"), reserva: suma(sel, "reserva"),
    recibido: suma(sel, "recibido"), saldo: suma(sel, "saldo"),
  };
  // "num" puede ser null en el histórico migrado (CC 1–11): se marca en la nota.
  const conNum = sel.filter((f) => f.num);
  const numFacturas = suma(conNum, "num");
  const pctRecaudo = tot.valor > 0 ? (tot.recibido / tot.valor) * 100 : 0;

  // Comparativo con el año anterior (mismo mes/mutual si están filtrados).
  const anioAnt = fAnio ? String(Number(fAnio) - 1) : "";
  const totAnt = anioAnt ? suma(filas.filter((f) => aplica(f, { anio: anioAnt })), "valor") : 0;
  const varPct = totAnt > 0 ? ((tot.valor - totAnt) / totAnt) * 100 : null;

  // Días promedio de recaudo (último pago vs. fecha de elaboración).
  const diasRecaudo = useMemo(() => {
    if (!d) return null;
    const ultimo = {};
    for (const p of d.pagos) {
      const t = new Date(String(p.fecha).slice(0, 10) + "T12:00:00").getTime();
      if (!ultimo[p.cuenta_cobro_id] || t > ultimo[p.cuenta_cobro_id]) ultimo[p.cuenta_cobro_id] = t;
    }
    const ds = sel.filter((f) => ultimo[f.id] && f.fecha)
      .map((f) => dias(ultimo[f.id], new Date(String(f.fecha).slice(0, 10) + "T12:00:00")))
      .filter((n) => n >= 0);
    return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
  }, [d, sel]);

  // Serie del gráfico: 12 meses del año elegido, o totales por año si no hay año.
  const serie = useMemo(() => {
    if (fAnio) {
      const base = filas.filter((f) => aplica(f, { mes: "" }));
      return MESES.map((m, i) => ({
        etq: m, key: String(i + 1),
        valor: suma(base.filter((f) => f.mesNum === i + 1), "valor"),
      }));
    }
    return anios.slice().reverse().map((a) => ({
      etq: String(a), key: String(a),
      valor: suma(filas.filter((f) => f.anio === a && (!fMut || f.cliente === fMut)), "valor"),
    }));
  }, [filas, fAnio, fMut, anios, aplica]);
  const maxSerie = Math.max(...serie.map((s) => s.valor), 1);

  // Ranking de clientes/mutuales.
  const ranking = useMemo(() => {
    const g = {};
    for (const f of sel) g[f.cliente] = (g[f.cliente] || 0) + f.valor;
    return Object.entries(g).map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v);
  }, [sel]);
  const maxRank = ranking.length ? ranking[0].v : 1;

  // Cartera: por vencer + antigüedad de lo vencido.
  const cartera = useMemo(() => {
    const hoy = HOY();
    const b = [
      { etq: "Por vencer", v: 0, color: "#5dcaa5" },
      { etq: "1–30 días", v: 0, color: "#1a3a8f" },
      { etq: "31–60 días", v: 0, color: "#c9a14a" },
      { etq: "61–90 días", v: 0, color: "#ef9f27" },
      { etq: "+90 días", v: 0, color: "#e24b4a" },
    ];
    for (const f of sel) {
      if (f.saldo <= 0) continue;
      const v = f.vence ? dias(hoy, new Date(String(f.vence).slice(0, 10) + "T12:00:00")) : 0;
      const i = v <= 0 ? 0 : v <= 30 ? 1 : v <= 60 ? 2 : v <= 90 ? 3 : 4;
      b[i].v += f.saldo;
    }
    return b;
  }, [sel]);
  const maxCart = Math.max(...cartera.map((c) => c.v), 1);
  const vencido = cartera.slice(1).reduce((s, c) => s + c.v, 0);

  const estados = ["pago", "parcial", "pendiente"].map((e) => ({ e, n: sel.filter((f) => f.estado === e).length }));

  // Mutuales activas sin facturar en el mes/año elegido (alerta de olvido).
  const sinFacturar = useMemo(() => {
    if (!d || !fAnio || !fMes) return [];
    const hechas = new Set(sel.filter((f) => f.esMutual).map((f) => f.cliente));
    return d.mutuales.filter((m) => !hechas.has(m.nombre)).map((m) => m.nombre_corto || m.nombre);
  }, [d, sel, fAnio, fMes]);

  const composicion = [
    { etq: "Base sin IVA", v: tot.base, color: "#1a3a8f" },
    { etq: "IVA 19%", v: tot.iva, color: "#c9a14a" },
    { etq: "Administración", v: tot.admin, color: "#5dcaa5" },
    { etq: "Reserva individual", v: tot.reserva, color: "#7f77dd" },
  ];

  const periodo = `${fMes ? MESES[Number(fMes) - 1] + " " : ""}${fAnio || "todos los años"}${fMut ? " · " + fMut : ""}`;
  const limpiar = () => { setFMes(""); setFMut(""); };

  if (err) return <div className="wrap"><div className="err">Error: {err}</div></div>;
  if (!d) return <div className="wrap"><div className="page-head"><h1>Dashboard</h1></div><div className="card">Cargando…</div></div>;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Dashboard</h1>
        <p>Facturación y cartera · {periodo}</p>
      </div>

      {/* Filtros */}
      <div className="card filtro-bar">
        <div className="fgrupo">
          <span className="flab">Año</span>
          <div className="chips">
            <button className={"chip" + (!fAnio ? " on" : "")} onClick={() => setFAnio("")}>Todos</button>
            {anios.map((a) => (
              <button key={a} className={"chip" + (fAnio === String(a) ? " on" : "")} onClick={() => setFAnio(String(a))}>{a}</button>
            ))}
          </div>
        </div>
        <div className="fgrupo">
          <span className="flab">Mes</span>
          <div className="chips">
            <button className={"chip" + (!fMes ? " on" : "")} onClick={() => setFMes("")}>Todos</button>
            {MESES.map((m, i) => (
              <button key={m} className={"chip" + (fMes === String(i + 1) ? " on" : "")}
                onClick={() => setFMes(fMes === String(i + 1) ? "" : String(i + 1))}>{m}</button>
            ))}
          </div>
        </div>
        <div className="fgrupo">
          <span className="flab">Cliente / mutual</span>
          <select className="sel" value={fMut} onChange={(e) => setFMut(e.target.value)}>
            <option value="">Todas</option>
            {[...new Set(filas.map((f) => f.cliente))].sort().map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {(fMes || fMut) && <button className="logout" style={{ alignSelf: "flex-end" }} onClick={limpiar}>Limpiar</button>}
      </div>

      {sinFacturar.length > 0 && (
        <div className="aviso">
          <b>Sin facturar en {MESES[Number(fMes) - 1]} {fAnio}:</b> {sinFacturar.join(" · ")}
        </div>
      )}

      {/* KPIs */}
      <div className="cards">
        <div className="kpi destacado">
          <div className="label">Total facturado</div>
          <div className="value">{fmtPesos(tot.valor)}</div>
          <div className="sub">{sel.length} cuenta(s) de cobro</div>
        </div>
        <div className="kpi">
          <div className="label">Facturas emitidas</div>
          <div className="value">{numFacturas.toLocaleString("es-CO")}</div>
          <div className="sub">a asociados</div>
        </div>
        <div className="kpi">
          <div className="label">Ticket promedio</div>
          <div className="value">{numFacturas ? fmtPesos(suma(conNum, "valor") / numFacturas) : "—"}</div>
          <div className="sub">por factura</div>
        </div>
        <div className="kpi">
          <div className="label">Recaudado</div>
          <div className="value">{pctRecaudo.toFixed(1)}%</div>
          <div className="sub">{fmtPesos(tot.recibido)}</div>
        </div>
        <div className="kpi">
          <div className="label">Saldo pendiente</div>
          <div className="value">{fmtPesos(tot.saldo)}</div>
          <div className="sub">{vencido > 0 ? <span className="rojo">{fmtPesos(vencido)} vencido</span> : "sin vencidos"}</div>
        </div>
        <div className="kpi">
          <div className="label">Vs. año anterior</div>
          <div className={"value " + (varPct == null ? "" : varPct >= 0 ? "verde" : "rojo")}>
            {varPct == null ? "—" : (varPct >= 0 ? "+" : "") + varPct.toFixed(1) + "%"}
          </div>
          <div className="sub">{anioAnt && totAnt > 0 ? `${anioAnt}: ${fmtPesos(totAnt)}` : "sin comparativo"}</div>
        </div>
      </div>

      {/* Facturación por mes / año */}
      <div className="card">
        <h2>Facturación por {fAnio ? "mes · " + fAnio : "año"}{fMut ? ` · ${fMut}` : ""}</h2>
        {serie.every((s) => s.valor === 0) ? (
          <p className="nota">Sin facturación en el periodo.</p>
        ) : (
          <>
            <div className="chart">
              {serie.map((s) => (
                <div key={s.key} className="col" title={`${s.etq}: ${fmtPesos(s.valor)}`}
                  onClick={() => fAnio && setFMes(fMes === s.key ? "" : s.key)}
                  style={{ cursor: fAnio ? "pointer" : "default" }}>
                  <span className="vlab">{s.valor ? mill(s.valor) : ""}</span>
                  <div className={"bar" + (fAnio && fMes === s.key ? " act" : "")} style={{ height: (s.valor / maxSerie) * 100 + "%" }} />
                </div>
              ))}
            </div>
            <div className="xaxis">
              {serie.map((s) => <div key={s.key} className={fAnio && fMes === s.key ? "xact" : ""}>{s.etq}</div>)}
            </div>
            {fAnio && <p className="nota">Haz clic en una barra para filtrar ese mes.</p>}
          </>
        )}
      </div>

      {/* Ranking + composición */}
      <div className="grid2col">
        <div className="card">
          <h2>Top clientes / mutuales</h2>
          {ranking.length === 0 ? <p className="nota">Sin datos.</p> : ranking.map((r) => (
            <div key={r.n} className="fila-bar">
              <div className="fila-top">
                <span>{r.n}</span>
                <span className="mono">{fmtPesos(r.v)} · {tot.valor ? ((r.v / tot.valor) * 100).toFixed(0) : 0}%</span>
              </div>
              <div className="track"><div className="hb" style={{ width: (r.v / maxRank) * 100 + "%" }} /></div>
            </div>
          ))}
          {ranking.length > 1 && (
            <p className="nota">Concentración: {((ranking[0].v / (tot.valor || 1)) * 100).toFixed(0)}% en {ranking[0].n}.</p>
          )}
        </div>

        <div className="card">
          <h2>Composición del valor</h2>
          {composicion.map((c) => (
            <div key={c.etq} className="linea">
              <span className="dot" style={{ background: c.color }} />
              <span className="linea-etq">{c.etq}</span>
              <span className="mono">{fmtPesos(c.v)}</span>
            </div>
          ))}
          <p className="nota">Base = administración + reserva individual. El IVA se declara por cuatrimestre (ver Facturas de venta).</p>
          <h2 style={{ marginTop: 18 }}>Estado de las cuentas</h2>
          <div className="estados">
            {estados.map((s) => (
              <div key={s.e} className={"est est-" + s.e}><b>{s.n}</b><span>{s.e}</span></div>
            ))}
          </div>
        </div>
      </div>

      {/* Cartera */}
      <div className="card">
        <h2>Cartera por antigüedad {tot.saldo > 0 ? `· ${fmtPesos(tot.saldo)} pendiente` : ""}</h2>
        {tot.saldo <= 0 ? (
          <p className="nota">Todo recaudado en el periodo. Sin cartera pendiente.</p>
        ) : (
          <>
            {cartera.filter((c) => c.v > 0).map((c) => (
              <div key={c.etq} className="fila-bar">
                <div className="fila-top"><span>{c.etq}</span><span className="mono">{fmtPesos(c.v)}</span></div>
                <div className="track"><div className="hb" style={{ width: (c.v / maxCart) * 100 + "%", background: c.color }} /></div>
              </div>
            ))}
            {diasRecaudo != null && <p className="nota">Días promedio de recaudo: <b>{diasRecaudo}</b> días desde la elaboración.</p>}
          </>
        )}
      </div>

      {sel.length > conNum.length && (
        <p className="nota" style={{ marginBottom: 20 }}>
          Nota: {sel.length - conNum.length} cuenta(s) del histórico no tienen número de facturas registrado,
          por eso no cuentan en «Facturas emitidas» ni en el ticket promedio.
        </p>
      )}

      <style>{`
        .filtro-bar{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
        .fgrupo{display:flex;flex-direction:column;gap:6px}
        .flab{font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:var(--gris)}
        .chips{display:flex;flex-wrap:wrap;gap:5px}
        .chip{border:1px solid var(--borde);background:#fff;color:var(--gris-osc);border-radius:8px;padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .12s}
        .chip:hover{border-color:var(--azul);color:var(--azul-osc)}
        .chip.on{background:var(--azul-osc);border-color:var(--azul-osc);color:#fff}
        .sel{padding:7px 10px;border:1px solid #cbd5e1;border-radius:8px;font-size:12.5px;min-width:210px;font-family:inherit}
        .aviso{background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:11px 14px;font-size:12.5px;color:#854d0e;margin-bottom:18px}
        .kpi.destacado{border-left:5px solid var(--dorado)}
        .kpi .value.verde{color:#166534}.kpi .value.rojo{color:#b91c1c}
        .rojo{color:#b91c1c;font-weight:600}
        .chart{display:flex;align-items:flex-end;gap:7px;height:170px;margin-top:4px}
        .chart .col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%}
        .vlab{font-size:10px;color:var(--gris);margin-bottom:4px;white-space:nowrap}
        .bar{width:100%;background:var(--azul);border-radius:4px 4px 0 0;min-height:2px;transition:background .15s}
        .chart .col:hover .bar{background:var(--azul-claro)}
        .bar.act{background:var(--dorado)}
        .xaxis{display:flex;gap:7px;margin-top:7px}
        .xaxis>div{flex:1;text-align:center;font-size:11px;color:var(--gris)}
        .xaxis>div.xact{color:var(--azul-osc);font-weight:700}
        .grid2col{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}
        .fila-bar{margin-bottom:11px}
        .fila-top{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;margin-bottom:4px;color:var(--gris-osc)}
        .track{background:#eef1f6;border-radius:5px;overflow:hidden}
        .hb{height:10px;border-radius:5px;background:var(--azul)}
        .mono{font-variant-numeric:tabular-nums;color:var(--azul-osc);font-weight:600;white-space:nowrap}
        .linea{display:flex;align-items:center;gap:9px;margin-bottom:9px;font-size:12.5px}
        .dot{width:10px;height:10px;border-radius:3px;flex-shrink:0}
        .linea-etq{flex:1;color:var(--gris-osc)}
        .nota{font-size:11.5px;color:var(--gris);margin-top:10px}
        .estados{display:flex;gap:8px;flex-wrap:wrap}
        .est{flex:1;min-width:82px;border-radius:9px;padding:9px 11px;display:flex;flex-direction:column;gap:2px;font-size:11px}
        .est b{font-size:17px;font-weight:700}
        .est-pago{background:#dcfce7;color:#166534}
        .est-parcial{background:#dbeafe;color:#1e40af}
        .est-pendiente{background:#fef9c3;color:#854d0e}
      `}</style>
    </div>
  );
}
