// Lógica compartida de totales de una cuenta de cobro.
// La usan tanto el PDF (lib/pdf.js) como la vista imprimible (app/cuenta/[id]),
// para que nunca diverjan. El IVA sale de una única fuente: siigo/constantes.
import { IVA } from "./siigo/constantes";

// subtotal = suma de ítems si los hay; si no, la base sin IVA (= valor_facturado / (1 + IVA)).
export function calcularTotalesCuenta(cuenta, items) {
  const subtotal = (items && items.length)
    ? items.reduce((s, it) => s + Number(it.subtotal || 0), 0)
    : (Number(cuenta?.valor_facturado) || 0) / (1 + IVA);
  const iva = subtotal * IVA;
  const anticipos = Math.abs(Number(cuenta?.anticipos) || 0);
  const total = subtotal + iva - anticipos;
  return { subtotal, iva, anticipos, total };
}
