// Lógica contable compartida de una cuenta de cobro.
// La usan el PDF (lib/pdf.js), la vista imprimible (app/cuenta/[id]),
// el Dashboard y Facturas de venta, para que nunca diverjan.
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

/**
 * Desglose contable: base, IVA, administración y reserva individual.
 *
 * POR QUÉ VIVE AQUÍ
 * Hasta ago 2026 esta fórmula estaba escrita DOS VECES, con el mismo texto, en
 * app/dashboard/page.jsx y en app/facturas-venta/page.jsx. Dos copias de una
 * regla de dinero es una divergencia esperando ocurrir.
 *
 * LA NOTA CRÉDITO SE RESTA ANTES DE DESGLOSAR
 * El campo `anticipos` guarda el saldo a favor que deja una nota crédito (una
 * garantía que no debió cobrarse y se devuelve). No es un pago anticipado: es
 * menos valor facturado. Por eso arrastra consigo su IVA, su administración y
 * su reserva, y hay que descontarlo ANTES de partir la base — no después.
 * Antes solo restaba en el total de la cuenta, de modo que el IVA del
 * cuatrimestre y la reserva quedaban sobrestimados por el valor de la nota.
 *
 * @param {object} c   fila con { valor, anticipos, esMutual, es_socia }
 * @param {object} params { iva, admin_socia, admin_no_socia }
 */
export function desglosarCuenta(c, params) {
  const ivaPct = Number(params?.iva) || 0.19;
  const bruto = Number(c?.valor) || 0;
  const nota = Math.abs(Number(c?.anticipos) || 0);
  const neto = bruto - nota;

  const base = neto / (1 + ivaPct);
  const iva = neto - base;
  const pctAdmin = c?.es_socia ? (Number(params?.admin_socia) || 0.13) : (Number(params?.admin_no_socia) || 0.17);
  // Solo las mutuales tienen desglose de administración/reserva; a un cliente
  // suelto se le factura el servicio sin partirlo.
  const admin = c?.esMutual ? base * pctAdmin : 0;
  const reserva = c?.esMutual ? base - admin : 0;

  return { bruto, nota, neto, base, iva, admin, reserva };
}
