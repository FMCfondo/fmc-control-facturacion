import { fmtPesos, fmtFecha } from "./format";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

// CSS del documento (azul rey + dorado), sin la barra ni botones.
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",Arial,Helvetica,sans-serif;color:#1b2440}
.hoja{padding:0}
.enc{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c9a14a;padding-bottom:18px;margin-bottom:18px}
.enc-izq{display:flex;gap:20px;align-items:center}
.logo{max-height:120px;max-width:220px;object-fit:contain}
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
.firmas{display:flex;justify-content:space-between;gap:40px;margin-top:70px;font-size:11px;font-weight:600;text-align:center;color:#3a4358}
.firmas>div{flex:1}
.linea{border-top:1px solid #102558;margin-bottom:6px}
.anexo-hoja{padding-top:6px}
.con-salto{page-break-before:always}
.anexo-tit{font-size:20px;font-weight:800;color:#102558;letter-spacing:1px;border-bottom:3px solid #c9a14a;padding-bottom:8px;display:inline-block}
.anexo-tbl{width:100%;border-collapse:collapse;font-size:11px;margin-top:10px}
.anexo-tbl th{background:#102558;color:#fff;padding:8px;text-align:left}
.anexo-tbl td{padding:8px;border-bottom:1px solid #e3e8ef}
.anexo-tbl td.r{text-align:right}
.anexo-tbl tr.anexo-total td{font-weight:800;border-top:2px solid #c9a14a;background:#f7f3e8;color:#102558}
`;

// Construye el HTML completo de la cuenta de cobro + anexo.
export function buildDocumentoHTML({ cuenta, mutual, items, facturas, fondo, origin }) {
  const cli = mutual
    ? { nombre: mutual.nombre, nit: `${mutual.nit}-${mutual.dv}`, dir: mutual.direccion, tel: mutual.telefono, email: mutual.correo }
    : { nombre: cuenta.cliente_nombre, nit: cuenta.cliente_nit, dir: cuenta.cliente_direccion, tel: "", email: cuenta.cliente_correo };

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
  const hayAnexo = facturas && facturas.length > 0;
  const totalAnexo = (facturas || []).reduce((s, f) => s + Number(f.valor_comision || 0), 0);
  const logo = `${origin}/FMC-LOGO.jpeg`;
  const e = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const filasItems = lineas.map((l) => `<tr>
    <td class="c">${e(l.q)}</td><td class="c">${e(l.codigo || "—")}</td><td>${e(l.desc)}</td>
    <td class="r">${fmtPesos(l.unit)}</td><td class="r">${fmtPesos(l.sub)}</td></tr>`).join("");

  const anexo = hayAnexo ? `
    <div class="hoja anexo-hoja con-salto">
      <div class="anexo-tit">Ventas</div>
      <div class="fondo-nom">${e(fondo.nombre)}</div>
      <div class="fondo-info">NIT: ${e(fondo.nit)}</div>
      <div style="font-size:12px;margin:10px 0;color:#475569">Relación de facturas — Cuenta de cobro No. ${e(cuenta.consecutivo)}${cuenta.documento_nombre ? " · " + e(cuenta.documento_nombre) : ""}</div>
      <table class="anexo-tbl">
        <thead><tr><th>Tipo de transacción</th><th>Comprobante</th><th>Fecha elaboración</th><th>Identificación</th><th>Cliente</th><th>Total</th></tr></thead>
        <tbody>
          ${facturas.map((f) => `<tr><td>Factura de venta / Ingresos</td><td>FV-2-${e(f.consecutivo)}</td><td>${fmtFecha(cuenta.fecha_elaboracion)}</td><td>${e(f.cedula)}</td><td>${e(f.nombre)}</td><td class="r">${fmtPesos(f.valor_comision)}</td></tr>`).join("")}
          <tr class="anexo-total"><td colspan="5">Total (${facturas.length} factura${facturas.length !== 1 ? "s" : ""})</td><td class="r">${fmtPesos(totalAnexo)}</td></tr>
        </tbody>
      </table>
    </div>` : "";

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    <div class="hoja">
      <div class="enc">
        <div class="enc-izq">
          <img src="${logo}" alt="" class="logo">
          <div>
            <div class="titulo">CUENTA DE COBRO</div>
            <div class="fondo-nom">${e(fondo.nombre)}</div>
            <div class="fondo-info">${e(fondo.correo)}<br>${e(fondo.direccion)}<br>NIT: ${e(fondo.nit)}<br>${e(fondo.telefono)}</div>
          </div>
        </div>
        <div class="cc-box"><div class="cc-label">Cuenta de cobro No.</div><div class="cc-num">${e(cuenta.consecutivo)}</div></div>
      </div>
      <div class="seccion">DATOS DEL CLIENTE</div>
      <div class="cliente">
        <div><b>NOMBRE:</b> ${e(cli.nombre || "—")}</div>
        <div><b>FECHA ELABORACIÓN:</b> ${fmtFecha(cuenta.fecha_elaboracion)}</div>
        <div><b>DIRECCIÓN:</b> ${e(cli.dir || "—")}</div>
        <div><b>FECHA VENCIMIENTO:</b> ${fmtFecha(cuenta.fecha_vencimiento)}</div>
        <div><b>NIT:</b> ${e(cli.nit || "—")}</div>
        <div><b>VENDEDOR:</b> ${e(fondo.nombre)}</div>
        <div><b>TELÉFONO:</b> ${e(cli.tel || "—")}</div>
        <div><b>EMAIL:</b> ${e(cli.email || "—")}</div>
      </div>
      <table class="items">
        <thead><tr><th>Cant.</th><th>Código</th><th>Descripción</th><th>Precio unit.</th><th>Subtotal</th></tr></thead>
        <tbody>${filasItems}</tbody>
      </table>
      <div class="pie">
        <div class="pago"><div><b>Forma de pago:</b> Crédito</div><div><b>Medio de pago:</b> Contado</div></div>
        <table class="tot"><tbody>
          <tr><td>SUBTOTAL:</td><td class="r">${fmtPesos(subtotal)}</td></tr>
          <tr><td>IVA 19%:</td><td class="r">${fmtPesos(iva)}</td></tr>
          ${anticipos > 0 ? `<tr><td>ANTICIPOS:</td><td class="r">−${fmtPesos(anticipos)}</td></tr>` : ""}
          <tr class="grande"><td>TOTAL:</td><td class="r">${fmtPesos(total)}</td></tr>
        </tbody></table>
      </div>
      <div class="firmas">
        <div><div class="linea"></div>NOMBRE Y FIRMA DEL VENDEDOR</div>
        <div><div class="linea"></div>NOMBRE Y FIRMA DEL CLIENTE</div>
      </div>
    </div>
    ${anexo}
  </body></html>`;
}

// Genera el PDF (Buffer) desde HTML, usando Chromium serverless (Vercel).
export async function generarPDF(html) {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({
      format: "A4", printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
  } finally {
    await browser.close();
  }
}
