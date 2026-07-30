import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtPesos, fmtFecha } from "./format";
import { calcularTotalesCuenta } from "./cuenta";

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const AZUL = [16, 37, 88];
const AZUL2 = [26, 58, 143];
const ORO = [201, 161, 74];
const CREMA = [247, 243, 232];
const GRIS = [107, 117, 133];

// Genera el PDF de la cuenta de cobro + anexo como Buffer (puro JS, sin navegador).
export function generarPDFCuenta({ cuenta, mutual, items, facturas, fondo, logoBase64 }) {
  const cli = mutual
    ? { nombre: mutual.nombre, nit: `${mutual.nit}-${mutual.dv}`, dir: mutual.direccion, tel: mutual.telefono, email: mutual.correo }
    : { nombre: cuenta.cliente_nombre, nit: cuenta.cliente_nit, dir: cuenta.cliente_direccion, tel: "", email: cuenta.cliente_correo };

  const { subtotal, iva, anticipos, total } = calcularTotalesCuenta(cuenta, items);
  let lineas;
  if (items && items.length) {
    lineas = items.map((it) => [String(it.cantidad), it.codigo || "—", it.descripcion, fmtPesos(it.valor_unitario), fmtPesos(it.subtotal)]);
  } else {
    const desc = mutual ? `SERVICIO DE COBERTURA DE CRÉDITOS${cuenta.mes ? ` (${MESES[cuenta.mes - 1]} ${cuenta.anio})` : ""}` : (cuenta.notas || "Cuenta de cobro");
    lineas = [["1", mutual ? "FMC01" : "—", desc, fmtPesos(subtotal), fmtPesos(subtotal)]];
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, L = 15, R = 195;

  // ── Encabezado ──
  if (logoBase64) { try { doc.addImage(`data:image/jpeg;base64,${logoBase64}`, "JPEG", L, 13, 30, 22); } catch (_) {} }
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...AZUL);
  doc.text("CUENTA DE COBRO", 50, 21);
  doc.setFontSize(11).text(fondo.nombre, 50, 28);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
  let iy = 33;
  [fondo.correo, fondo.direccion, `NIT: ${fondo.nit || ""}`, fondo.telefono].forEach((ln) => { if (ln) { doc.text(String(ln), 50, iy); iy += 4; } });
  // Caja CC
  doc.setFillColor(...AZUL); doc.roundedRect(150, 13, 45, 24, 2.5, 2.5, "F");
  doc.setTextColor(...ORO).setFontSize(7).setFont("helvetica", "bold");
  doc.text("CUENTA DE COBRO No.", 172.5, 19, { align: "center" });
  doc.setTextColor(255, 255, 255).setFontSize(21);
  doc.text(String(cuenta.consecutivo), 172.5, 31, { align: "center" });
  // Línea dorada (debajo del bloque más alto)
  const lineY = Math.max(iy + 2, 40);
  doc.setDrawColor(...ORO).setLineWidth(0.9).line(L, lineY, R, lineY);

  // ── Datos del cliente ──
  const barY = lineY + 4;
  doc.setFillColor(...AZUL); doc.rect(L, barY, R - L, 7, "F");
  doc.setFillColor(...ORO); doc.rect(L, barY, 1.6, 7, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(9);
  doc.text("DATOS DEL CLIENTE", L + 4, barY + 4.8);

  const kv = (x, y, label, value) => {
    doc.setFont("helvetica", "bold").setTextColor(...AZUL).setFontSize(9);
    doc.text(label, x, y);
    const w = doc.getTextWidth(label);
    doc.setFont("helvetica", "normal").setTextColor(40, 50, 70);
    doc.text(doc.splitTextToSize(String(value ?? "—"), 78 - w), x + w + 1.5, y);
  };
  let y = barY + 16;
  kv(L + 3, y, "NOMBRE:", cli.nombre); kv(110, y, "FECHA ELAB.:", fmtFecha(cuenta.fecha_elaboracion)); y += 7.5;
  kv(L + 3, y, "DIRECCIÓN:", cli.dir); kv(110, y, "FECHA VENC.:", fmtFecha(cuenta.fecha_vencimiento)); y += 7.5;
  kv(L + 3, y, "NIT:", cli.nit); kv(110, y, "VENDEDOR:", fondo.nombre); y += 7.5;
  kv(L + 3, y, "TELÉFONO:", cli.tel); kv(110, y, "EMAIL:", cli.email);

  // ── Ítems ──
  autoTable(doc, {
    startY: y + 6, margin: { left: L, right: L },
    head: [["Cant.", "Código", "Descripción", "Precio unit.", "Subtotal"]],
    body: lineas,
    theme: "grid",
    headStyles: { fillColor: AZUL, textColor: 255, fontSize: 9, halign: "left" },
    styles: { fontSize: 9, cellPadding: 2.5, lineColor: [227, 232, 239] },
    columnStyles: { 0: { halign: "center", cellWidth: 16 }, 1: { halign: "center", cellWidth: 24 }, 3: { halign: "right", cellWidth: 30 }, 4: { halign: "right", cellWidth: 30 } },
  });

  // ── Forma de pago + totales ──
  let fy = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(58, 67, 88);
  doc.text("Forma de pago:", L, fy); doc.setFont("helvetica", "normal").text("Crédito", L + 28, fy);
  doc.setFont("helvetica", "bold").text("Medio de pago:", L, fy + 6); doc.setFont("helvetica", "normal").text("Contado", L + 28, fy + 6);

  const totRow = (yy, label, value, big) => {
    doc.setFont("helvetica", big ? "bold" : "normal").setFontSize(big ? 12 : 10).setTextColor(...(big ? AZUL : [58, 67, 88]));
    doc.text(label, 135, yy); doc.text(value, R, yy, { align: "right" });
  };
  totRow(fy, "SUBTOTAL:", fmtPesos(subtotal));
  totRow(fy + 6, "IVA 19%:", fmtPesos(iva));
  let ty = fy + 12;
  if (anticipos > 0) { totRow(ty, "ANTICIPOS:", "−" + fmtPesos(anticipos)); ty += 6; }
  doc.setFillColor(...CREMA); doc.rect(133, ty - 4.5, 62, 8, "F");
  doc.setDrawColor(...ORO).setLineWidth(0.6).line(133, ty - 4.5, 195, ty - 4.5);
  totRow(ty, "TOTAL:", fmtPesos(total), true);

  // ── Firmas ──
  let sy = Math.max(ty + 38, 250);
  doc.setDrawColor(...AZUL).setLineWidth(0.4);
  doc.line(25, sy, 90, sy); doc.line(120, sy, 185, sy);
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(58, 67, 88);
  doc.text("NOMBRE Y FIRMA DEL VENDEDOR", 57.5, sy + 5, { align: "center" });
  doc.text("NOMBRE Y FIRMA DEL CLIENTE", 152.5, sy + 5, { align: "center" });

  // ── Anexo (relación de facturas) ──
  if (facturas && facturas.length) {
    doc.addPage();
    doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(...AZUL).text("Ventas", L, 22);
    doc.setDrawColor(...ORO).setLineWidth(0.9).line(L, 25, 42, 25);
    doc.setFontSize(11).text(fondo.nombre, L, 33);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...GRIS);
    doc.text(`NIT: ${fondo.nit}`, L, 38);
    doc.text(`Relación de facturas — Cuenta de cobro No. ${cuenta.consecutivo}`, L, 44);
    const totalAnexo = facturas.reduce((s, f) => s + Number(f.valor_comision || 0), 0);
    const cuerpo = facturas.map((f) => ["Factura de venta / Ingresos", `FV-2-${f.consecutivo}`, fmtFecha(cuenta.fecha_elaboracion), f.cedula, f.nombre, fmtPesos(f.valor_comision)]);
    // Total como ÚLTIMA fila del cuerpo (aparece una sola vez, no en cada página).
    cuerpo.push([{ content: `Total (${facturas.length} factura${facturas.length !== 1 ? "s" : ""})`, colSpan: 5 }, fmtPesos(totalAnexo)]);
    const ultima = cuerpo.length - 1;
    autoTable(doc, {
      startY: 49, margin: { left: L, right: L },
      head: [["Tipo de transacción", "Comprobante", "Fecha", "Identificación", "Cliente", "Total"]],
      body: cuerpo,
      theme: "grid",
      headStyles: { fillColor: AZUL, textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8.5, cellPadding: 2, lineColor: [227, 232, 239] },
      columnStyles: { 5: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === ultima) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = CREMA;
          data.cell.styles.textColor = AZUL;
        }
      },
    });
  }

  return Buffer.from(doc.output("arraybuffer"));
}

// ─────────────────────────────────────────────────────────────────────────────
// Estado de cuenta: relación de cuentas de cobro PENDIENTES de un cliente.
// Muestra saldo y días de vencido; NO calcula intereses de mora.
// filas: [{ cc, fecha, vence, facturado, recibido, saldo, diasVencido }]
export function generarPDFEstadoCuenta({ cliente, nit, filas, fondo, logoBase64, corte }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const L = 15, R = 195;
  const totSaldo = filas.reduce((s, f) => s + (Number(f.saldo) || 0), 0);
  const totFact = filas.reduce((s, f) => s + (Number(f.facturado) || 0), 0);
  const totRec = filas.reduce((s, f) => s + (Number(f.recibido) || 0), 0);
  const vencido = filas.filter((f) => f.diasVencido > 0).reduce((s, f) => s + (Number(f.saldo) || 0), 0);

  // ── Encabezado ──
  if (logoBase64) { try { doc.addImage(`data:image/jpeg;base64,${logoBase64}`, "JPEG", L, 13, 30, 22); } catch (_) {} }
  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(...AZUL);
  doc.text("ESTADO DE CUENTA", 50, 21);
  doc.setFontSize(11).text(fondo.nombre, 50, 28);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GRIS);
  let iy = 33;
  [fondo.correo, fondo.direccion, `NIT: ${fondo.nit || ""}`, fondo.telefono].forEach((ln) => { if (ln) { doc.text(String(ln), 50, iy); iy += 4; } });
  doc.setFillColor(...AZUL); doc.roundedRect(150, 13, 45, 24, 2.5, 2.5, "F");
  doc.setTextColor(...ORO).setFontSize(7).setFont("helvetica", "bold");
  doc.text("SALDO TOTAL", 172.5, 19, { align: "center" });
  doc.setTextColor(255, 255, 255).setFontSize(14);
  doc.text(fmtPesos(totSaldo), 172.5, 30, { align: "center" });
  const lineY = Math.max(iy + 2, 40);
  doc.setDrawColor(...ORO).setLineWidth(0.9).line(L, lineY, R, lineY);

  // ── Cliente ──
  const barY = lineY + 4;
  doc.setFillColor(...AZUL); doc.rect(L, barY, R - L, 7, "F");
  doc.setFillColor(...ORO); doc.rect(L, barY, 1.6, 7, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(9);
  doc.text("DATOS DEL CLIENTE", L + 4, barY + 4.8);
  doc.setFont("helvetica", "bold").setTextColor(...AZUL).setFontSize(9);
  doc.text("CLIENTE:", L + 3, barY + 16);
  doc.setFont("helvetica", "normal").setTextColor(40, 50, 70);
  doc.text(String(cliente || "—"), L + 24, barY + 16);
  if (nit) {
    doc.setFont("helvetica", "bold").setTextColor(...AZUL).text("NIT:", 120, barY + 16);
    doc.setFont("helvetica", "normal").setTextColor(40, 50, 70).text(String(nit), 130, barY + 16);
  }
  doc.setFont("helvetica", "bold").setTextColor(...AZUL).text("CORTE:", L + 3, barY + 23);
  doc.setFont("helvetica", "normal").setTextColor(40, 50, 70).text(fmtFecha(corte), L + 24, barY + 23);

  // ── Detalle ──
  const cuerpo = filas.map((f) => [
    String(f.cc),
    fmtFecha(f.fecha),
    fmtFecha(f.vence),
    f.diasVencido > 0 ? `${f.diasVencido}` : "—",
    fmtPesos(f.facturado),
    fmtPesos(f.recibido),
    fmtPesos(f.saldo),
  ]);
  cuerpo.push([{ content: `Total (${filas.length} cuenta${filas.length !== 1 ? "s" : ""} pendiente${filas.length !== 1 ? "s" : ""})`, colSpan: 4 },
    fmtPesos(totFact), fmtPesos(totRec), fmtPesos(totSaldo)]);
  const ultima = cuerpo.length - 1;

  autoTable(doc, {
    startY: barY + 30, margin: { left: L, right: L },
    head: [["CC N°", "Elaboración", "Vencimiento", "Días vencido", "Facturado", "Abonos", "Saldo"]],
    body: cuerpo,
    theme: "grid",
    headStyles: { fillColor: AZUL, textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 2.2, lineColor: [227, 232, 239] },
    columnStyles: { 0: { halign: "center" }, 3: { halign: "center" }, 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index === ultima) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = CREMA;
        data.cell.styles.textColor = AZUL;
      } else if (data.section === "body" && data.column.index === 3 && data.cell.raw !== "—") {
        data.cell.styles.textColor = [162, 45, 45];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ── Resumen ──
  let y = doc.lastAutoTable.finalY + 10;
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...AZUL2);
  doc.text("RESUMEN", L, y);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(58, 67, 88);
  y += 6; doc.text(`Saldo total pendiente: ${fmtPesos(totSaldo)}`, L, y);
  if (vencido > 0) {
    y += 5;
    doc.setTextColor(162, 45, 45).setFont("helvetica", "bold");
    doc.text(`Saldo vencido: ${fmtPesos(vencido)}`, L, y);
    doc.setTextColor(58, 67, 88).setFont("helvetica", "normal");
  }
  y += 8;
  doc.setFontSize(8).setTextColor(...GRIS);
  doc.text(doc.splitTextToSize(
    "Este documento es un resumen informativo de las cuentas de cobro pendientes a la fecha de corte. " +
    "Si ya realizó alguno de estos pagos, por favor remita el soporte para actualizar el registro.", R - L), L, y);

  return Buffer.from(doc.output("arraybuffer"));
}
