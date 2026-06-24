import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "../../../lib/supabase";
import { logActividad } from "../../../lib/actividad";
import { generarPDFCuenta } from "../../../lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const pesos = (v) => "$" + Math.round(Number(v) || 0).toLocaleString("es-CO");
const lista = (s) => String(s || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
// Escapa texto que se interpola dentro del HTML del correo (evita inyección de HTML).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function plantilla({ origin, nombre, cc, periodo, total, mensaje, fondo }) {
  const logo = `${origin}/FMC-LOGO.jpeg`;
  return `
  <div style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1b2440">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(16,37,88,.12)">
        <tr><td style="background:linear-gradient(100deg,#102558,#1a3a8f);padding:22px 28px;border-bottom:3px solid #c9a14a">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td align="left" valign="middle">
              <div style="color:#fff;font-size:19px;font-weight:bold">${fondo.nombre}</div>
              <div style="color:#e3c97a;font-size:13px;margin-top:3px">Cuenta de cobro</div>
            </td>
            <td align="right" valign="middle" width="140">
              <img src="${logo}" alt="" height="78" style="background:#fff;border-radius:10px;padding:6px">
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px">
          <p style="font-size:15px;margin:0 0 12px">Estimados señores <strong>${esc(nombre)}</strong>,</p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Adjunto encontrarán la <strong>cuenta de cobro N° ${cc}</strong>, correspondiente a las <strong>garantías del mes de ${periodo}</strong>, junto con la relación de facturas generadas.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;border-radius:10px;margin:8px 0 18px"><tr><td style="padding:14px 18px">
            <span style="font-size:12px;color:#6b7585">Valor total</span><br><span style="font-size:22px;font-weight:bold;color:#102558">${total}</span>
          </td></tr></table>
          ${mensaje ? `<p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#3a4358">${esc(mensaje).replace(/\n/g, "<br>")}</p>` : ""}
          <p style="font-size:14px;line-height:1.6;margin:0 0 14px">Quedamos atentos a cualquier inquietud.<br>Cordialmente,</p>
          ${fondo.firma ? `<div style="font-size:13px;color:#3a4358;line-height:1.5">${fondo.firma}</div>` : `<p style="font-size:14px;font-weight:bold;margin:0;color:#102558">${fondo.nombre}</p>`}
        </td></tr>
        <tr><td align="center" style="background:#102558;padding:18px 28px;color:#cdd6ea;font-size:12px;line-height:1.6">
          NIT: ${fondo.nit} · ${fondo.direccion}<br>${fondo.correo} · ${fondo.telefono}
        </td></tr>
      </table>
      <div style="color:#94a3b8;font-size:11px;margin-top:14px">Correo automático del sistema de facturación de FMC.</div>
    </td></tr></table>
  </div>`;
}

export async function POST(request) {
  try {
    const { id, to, cc, mensaje } = await request.json();
    const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) return NextResponse.json({ error: "Falta configurar GMAIL_USER y GMAIL_APP_PASSWORD en Vercel" }, { status: 500 });
    const dest = lista(to);
    if (!dest.length) return NextResponse.json({ error: "Indica al menos un destinatario" }, { status: 400 });

    const sb = supabaseAdmin();
    const { data: cuenta, error } = await sb.from("cuentas_cobro").select("*,mutuales(*)").eq("id", id).single();
    if (error) throw error;
    const mutual = cuenta.mutuales || null;
    const nombre = mutual?.nombre || cuenta.cliente_nombre || "Cliente";
    // Período de las garantías = mes ANTERIOR a la elaboración (se factura mes vencido).
    let periodo = String(cuenta.anio || "");
    if (cuenta.mes) {
      let pm = cuenta.mes - 1, pa = cuenta.anio;
      if (pm < 1) { pm = 12; pa = pa - 1; }
      periodo = `${MESES[pm - 1]} ${pa}`;
    }
    const [{ data: items }, { data: facturas }, { data: cfg }] = await Promise.all([
      sb.from("items_cuenta_cobro").select("*").eq("cuenta_cobro_id", id),
      sb.from("facturas_siigo").select("*").eq("cuenta_cobro_id", id).order("consecutivo"),
      sb.from("config").select("*"),
    ]);
    const c = Object.fromEntries((cfg || []).map((r) => [r.clave, r.valor]));
    const fondo = {
      nombre: c.fondo_nombre || "Fondo Mutuo de Cobertura S.A.S",
      nit: c.fondo_nit || "901.678.530-0",
      direccion: c.fondo_direccion || "", correo: c.fondo_correo || user, telefono: c.fondo_telefono || "",
      firma: c.firma_correo || "",
    };
    const origin = new URL(request.url).origin;

    // Logo en base64 para el PDF.
    let logoBase64 = null;
    try {
      const lr = await fetch(`${origin}/FMC-LOGO.jpeg`);
      logoBase64 = Buffer.from(await lr.arrayBuffer()).toString("base64");
    } catch (_) {}

    // Generar el PDF en el servidor (puro JS, vectorial).
    const pdf = generarPDFCuenta({ cuenta, mutual, items: items || [], facturas: facturas || [], fondo, logoBase64 });

    const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    const attachments = [{ filename: `Cuenta de cobro ${cuenta.consecutivo} - ${nombre}.pdf`, content: pdf, contentType: "application/pdf" }];

    await transport.sendMail({
      from: `${fondo.nombre} <${user}>`,
      to: dest,
      cc: lista(cc),
      subject: `Cuenta de cobro N° ${cuenta.consecutivo} — ${fondo.nombre}`,
      html: plantilla({ origin, nombre, cc: cuenta.consecutivo, periodo, total: pesos(cuenta.valor_facturado), mensaje, fondo }),
      attachments,
    });

    await logActividad({
      tipo: "Correo enviado",
      descripcion: `Cuenta de cobro #${cuenta.consecutivo} enviada a ${dest.join(", ")}${lista(cc).length ? " (CC: " + lista(cc).join(", ") + ")" : ""}`,
      entidad: "cuenta_cobro", entidad_id: cuenta.consecutivo,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
