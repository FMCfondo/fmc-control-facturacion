import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "../../../lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const pesos = (v) => "$" + Math.round(Number(v) || 0).toLocaleString("es-CO");
const lista = (s) => String(s || "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);

function plantilla({ origin, nombre, cc, periodo, total, mensaje, fondo }) {
  const logo = `${origin}/FMC-LOGO.jpeg`;
  return `
  <div style="margin:0;padding:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1b2440">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0"><tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(16,37,88,.12)">
        <tr><td style="background:linear-gradient(100deg,#102558,#1a3a8f);padding:24px 28px;border-bottom:3px solid #c9a14a">
          <img src="${logo}" alt="" height="50" style="background:#fff;border-radius:8px;padding:4px">
          <div style="color:#fff;font-size:18px;font-weight:bold;margin-top:12px">${fondo.nombre}</div>
          <div style="color:#e3c97a;font-size:13px">Cuenta de cobro</div>
        </td></tr>
        <tr><td style="padding:28px">
          <p style="font-size:15px;margin:0 0 12px">Estimados señores <strong>${nombre}</strong>,</p>
          <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Adjunto encontrarán la <strong>cuenta de cobro N° ${cc}</strong> correspondiente al período <strong>${periodo}</strong>, junto con la relación de facturas generadas.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fa;border-radius:10px;margin:8px 0 18px"><tr><td style="padding:14px 18px">
            <span style="font-size:12px;color:#6b7585">Valor total</span><br><span style="font-size:22px;font-weight:bold;color:#102558">${total}</span>
          </td></tr></table>
          ${mensaje ? `<p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#3a4358">${mensaje}</p>` : ""}
          <p style="font-size:14px;line-height:1.6;margin:0">Quedamos atentos a cualquier inquietud.<br>Cordialmente,</p>
          <p style="font-size:14px;font-weight:bold;margin:6px 0 0;color:#102558">${fondo.nombre}</p>
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
    const { id, to, cc, pdfBase64, mensaje } = await request.json();
    const user = process.env.GMAIL_USER, pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) return NextResponse.json({ error: "Falta configurar GMAIL_USER y GMAIL_APP_PASSWORD en Vercel" }, { status: 500 });
    const dest = lista(to);
    if (!dest.length) return NextResponse.json({ error: "Indica al menos un destinatario" }, { status: 400 });

    const sb = supabaseAdmin();
    const { data: cuenta, error } = await sb.from("cuentas_cobro").select("*,mutuales(nombre)").eq("id", id).single();
    if (error) throw error;
    const nombre = cuenta.mutuales?.nombre || cuenta.cliente_nombre || "Cliente";
    const periodo = cuenta.mes ? `${MESES[cuenta.mes - 1]} ${cuenta.anio}` : String(cuenta.anio || "");
    const { data: cfg } = await sb.from("config").select("*");
    const c = Object.fromEntries((cfg || []).map((r) => [r.clave, r.valor]));
    const fondo = {
      nombre: c.fondo_nombre || "Fondo Mutuo de Cobertura S.A.S",
      nit: c.fondo_nit || "901.678.530-0",
      direccion: c.fondo_direccion || "", correo: c.fondo_correo || user, telefono: c.fondo_telefono || "",
    };
    const origin = new URL(request.url).origin;

    const transport = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    const attachments = pdfBase64
      ? [{ filename: `Cuenta de cobro ${cuenta.consecutivo} - ${nombre}.pdf`, content: Buffer.from(pdfBase64.split(",").pop(), "base64"), contentType: "application/pdf" }]
      : [];

    await transport.sendMail({
      from: `${fondo.nombre} <${user}>`,
      to: dest,
      cc: lista(cc),
      subject: `Cuenta de cobro N° ${cuenta.consecutivo} — ${fondo.nombre}`,
      html: plantilla({ origin, nombre, cc: cuenta.consecutivo, periodo, total: pesos(cuenta.valor_facturado), mensaje, fondo }),
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
