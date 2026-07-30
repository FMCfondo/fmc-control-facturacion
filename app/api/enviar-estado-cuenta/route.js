import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad } from "../../../lib/actividad";
import { generarPDFEstadoCuenta } from "../../../lib/pdf";
import { requireUser } from "../../../lib/requireUser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pesos = (v) => "$" + Math.round(Number(v) || 0).toLocaleString("es-CO");
const lista = (s) => String(s || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fFecha = (d) => { const m = String(d || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"; };
const diasVencido = (vence, hoy) => {
  if (!vence) return 0;
  return Math.max(0, Math.round((hoy - new Date(String(vence).slice(0, 10) + "T12:00:00")) / 86400000));
};

function plantilla({ nombre, filas, totSaldo, vencido, corte, mensaje, fondo }) {
  const filasHtml = filas.map((f) => `
    <tr>
      <td style="padding:7px 8px;border-bottom:1px solid #e3e8ef">${f.cc}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #e3e8ef">${fFecha(f.vence)}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #e3e8ef;text-align:center;${f.diasVencido > 0 ? "color:#a22d2d;font-weight:bold" : "color:#6b7585"}">${f.diasVencido > 0 ? f.diasVencido : "—"}</td>
      <td style="padding:7px 8px;border-bottom:1px solid #e3e8ef;text-align:right">${pesos(f.saldo)}</td>
    </tr>`).join("");
  return `
  <div style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1b2440">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
      <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(16,37,88,.12)">
        <tr><td style="background:linear-gradient(100deg,#102558,#1a3a8f);padding:22px 28px;border-bottom:3px solid #c9a14a">
          <div style="color:#fff;font-size:19px;font-weight:bold">${esc(fondo.nombre)}</div>
          <div style="color:#e3c97a;font-size:13px;margin-top:3px">Estado de cuenta</div>
        </td></tr>
        <tr><td style="padding:28px">
          <p style="font-size:15px;margin:0 0 12px">Estimados señores <strong>${esc(nombre)}</strong>,</p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Adjuntamos el estado de cuenta con corte al <strong>${fFecha(corte)}</strong>, que relaciona las cuentas de cobro pendientes de pago a la fecha.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;border-radius:10px;margin:8px 0 18px"><tr><td style="padding:14px 18px">
            <span style="font-size:12px;color:#6b7585">Saldo total pendiente</span><br>
            <span style="font-size:22px;font-weight:bold;color:#102558">${pesos(totSaldo)}</span>
            ${vencido > 0 ? `<br><span style="font-size:12px;color:#a22d2d;font-weight:bold">Vencido: ${pesos(vencido)}</span>` : ""}
          </td></tr></table>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12.5px;margin-bottom:18px">
            <thead><tr style="background:#102558;color:#fff">
              <th style="padding:8px;text-align:left">CC N°</th>
              <th style="padding:8px;text-align:left">Vencimiento</th>
              <th style="padding:8px;text-align:center">Días vencido</th>
              <th style="padding:8px;text-align:right">Saldo</th>
            </tr></thead>
            <tbody>${filasHtml}</tbody>
          </table>
          ${mensaje ? `<p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#3a4358">${esc(mensaje).replace(/\n/g, "<br>")}</p>` : ""}
          <p style="font-size:13px;line-height:1.6;margin:0 0 14px;color:#6b7585">Si ya realizaron alguno de estos pagos, agradecemos remitir el soporte para actualizar nuestro registro.</p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 14px">Cordialmente,</p>
          ${fondo.firma ? `<div style="font-size:13px;color:#3a4358;line-height:1.5">${fondo.firma}</div>` : `<p style="font-size:14px;font-weight:bold;margin:0;color:#102558">${esc(fondo.nombre)}</p>`}
        </td></tr>
        <tr><td align="center" style="background:#102558;padding:18px 28px;color:#cdd6ea;font-size:12px;line-height:1.6">
          NIT: ${esc(fondo.nit)} · ${esc(fondo.direccion)}<br>${esc(fondo.correo)} · ${esc(fondo.telefono)}
        </td></tr>
      </table>
      <div style="color:#94a3b8;font-size:11px;margin-top:14px">Correo automático del sistema de facturación de FMC.</div>
    </td></tr></table>
  </div>`;
}

// POST { mutual_id | cliente, to, cc, mensaje } → envía el estado de cuenta con PDF adjunto.
export async function POST(request) {
  try {
    const { response } = await requireUser();
    if (response) return response;
    const { mutual_id, cliente, to, cc, mensaje } = await request.json();
    const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) return NextResponse.json({ error: "Falta configurar GMAIL_USER y GMAIL_APP_PASSWORD en Vercel" }, { status: 500 });
    const dest = lista(to);
    if (!dest.length) return NextResponse.json({ error: "Indica al menos un destinatario" }, { status: 400 });
    if (!mutual_id && !cliente) return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });

    const sb = supabaseAdmin();
    // Los saldos se recalculan aquí (no se confía en lo que envíe el navegador).
    let q = sb.from("cuentas_cobro")
      .select("consecutivo,fecha_elaboracion,fecha_vencimiento,valor_facturado,valor_recibido,saldo,mutuales(nombre,nit,dv)")
      .gt("saldo", 0)
      .order("fecha_vencimiento", { ascending: true, nullsFirst: false });
    q = mutual_id ? q.eq("mutual_id", mutual_id) : q.eq("cliente_nombre", cliente);
    const { data: rows, error } = await q;
    if (error) throw error;
    if (!rows || !rows.length) return NextResponse.json({ error: "Este cliente no tiene cuentas pendientes." }, { status: 400 });

    const hoy = new Date(new Date().toISOString().slice(0, 10) + "T12:00:00");
    const filas = rows.map((r) => ({
      cc: r.consecutivo, fecha: r.fecha_elaboracion, vence: r.fecha_vencimiento,
      facturado: Number(r.valor_facturado) || 0, recibido: Number(r.valor_recibido) || 0,
      saldo: Number(r.saldo) || 0, diasVencido: diasVencido(r.fecha_vencimiento, hoy),
    }));
    const m0 = rows[0].mutuales || null;
    const nombre = m0?.nombre || cliente || "Cliente";
    const nit = m0 ? `${m0.nit}-${m0.dv}` : null;
    const totSaldo = filas.reduce((s, f) => s + f.saldo, 0);
    const vencido = filas.filter((f) => f.diasVencido > 0).reduce((s, f) => s + f.saldo, 0);

    const { data: cfg } = await sb.from("config").select("*");
    const c = Object.fromEntries((cfg || []).map((r) => [r.clave, r.valor]));
    const fondo = {
      nombre: c.fondo_nombre || "Fondo Mutuo de Cobertura S.A.S",
      nit: c.fondo_nit || "901.678.530-0",
      direccion: c.fondo_direccion || "", correo: c.fondo_correo || user, telefono: c.fondo_telefono || "",
      firma: c.firma_correo || "",
    };

    const origin = new URL(request.url).origin;
    let logoBase64 = null;
    try {
      const lr = await fetch(`${origin}/FMC-LOGO.jpeg`);
      logoBase64 = Buffer.from(await lr.arrayBuffer()).toString("base64");
    } catch (_) {}

    const pdf = generarPDFEstadoCuenta({ cliente: nombre, nit, filas, fondo, logoBase64, corte: hoy.toISOString().slice(0, 10) });

    const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    await transport.sendMail({
      from: `${fondo.nombre} <${user}>`,
      to: dest, cc: lista(cc),
      subject: `Estado de cuenta — ${nombre}`,
      html: plantilla({ nombre, filas, totSaldo, vencido, corte: hoy.toISOString().slice(0, 10), mensaje, fondo }),
      attachments: [{ filename: `Estado de cuenta - ${nombre}.pdf`, content: pdf, contentType: "application/pdf" }],
    });

    await logActividad({
      tipo: "Estado de cuenta enviado",
      descripcion: `Estado de cuenta de ${nombre} enviado a ${dest.join(", ")} — ${filas.length} cuenta(s), saldo ${pesos(totSaldo)}`,
      entidad: "estado_cuenta", entidad_id: nombre,
      detalle: { cliente: nombre, cuentas: filas.length, saldo: pesos(totSaldo), vencido: pesos(vencido), para: dest, cc: lista(cc) },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e); return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
