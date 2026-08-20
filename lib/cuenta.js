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
 * Desglose contable de una cuenta de cobro, en TRES capas.
 *
 * POR QUÉ VIVE AQUÍ
 * Hasta ago 2026 esta fórmula estaba escrita DOS VECES, con el mismo texto, en
 * app/dashboard/page.jsx y en app/facturas-venta/page.jsx. Dos copias de una
 * regla de dinero es una divergencia esperando ocurrir.
 *
 * POR QUÉ TRES CAPAS Y NO UN SOLO NÚMERO
 * Una nota crédito (una garantía que no debió cobrarse y se devuelve) NO se
 * trata igual en lo fiscal que en lo económico, y meterla en un solo número
 * escondería justo la cifra que hace falta:
 *
 *   · FISCAL — el IVA se causa COMPLETO y se declara completo; la devolución
 *     va como línea aparte ("devoluciones en ventas"). Por eso se exponen
 *     `baseBruta` / `ivaGenerado` y, por separado, `baseDevolucion` / `ivaDevolucion`.
 *
 *   · ECONÓMICO — si la garantía se devuelve, ni la administración ni la reserva
 *     se ganaron. Por eso `admin` y `reserva` salen ya NETAS, y se conservan
 *     `adminBruta` / `reservaBruta` y su devolución para poder explicar de dónde
 *     salió el número (es lo que muestra el tooltip de Facturas de venta).
 *
 * Es una asimetría deliberada —base bruta, reserva neta— porque responden a dos
 * preguntas distintas: qué causaste y cuánto te queda.
 *
 * LA NOTA SE APLICA EN LA CUENTA DONDE SE REGISTRA, no en la de origen: no se
 * puede volver atrás ante la DIAN. La fecha del error queda en el texto de la nota.
 *
 * LIMITACIÓN CONOCIDA: el porcentaje de administración debería ser el del mes de
 * ORIGEN del error. El campo `anticipos` es un número suelto y no guarda a qué
 * cuenta corrige, así que hoy se usa el de la cuenta donde se aplica. Lo cierra
 * el módulo de notas crédito/débito. Mientras tanto, el porcentaje usado se
 * devuelve en `pctAdmin` para poder mostrarlo y que nadie lo dé por supuesto.
 *
 * @param {object} c   fila con { valor, anticipos, esMutual, es_socia }
 * @param {object} params { iva, admin_socia, admin_no_socia }
 */
export function desglosarCuenta(c, params) {
  const ivaPct = Number(params?.iva) || 0.19;
  const pctAdmin = c?.es_socia
    ? (Number(params?.admin_socia) || 0.13)
    : (Number(params?.admin_no_socia) || 0.17);
  // Solo las mutuales tienen desglose de administración/reserva; a un cliente
  // suelto se le factura el servicio sin partirlo.
  const esMutual = !!c?.esMutual;

  const bruto = Number(c?.valor) || 0;
  const nota = Math.abs(Number(c?.anticipos) || 0);
  const neto = bruto - nota;

  // Partir un valor con IVA en sus componentes. Se aplica igual a lo facturado,
  // a lo devuelto y al neto, y por eso la reversión cuadra al peso: reversar una
  // garantía da exactamente lo mismo que no haberla facturado nunca.
  const partir = (valorConIva) => {
    const base = valorConIva / (1 + ivaPct);
    const admin = esMutual ? base * pctAdmin : 0;
    return { base, iva: valorConIva - base, admin, reserva: esMutual ? base - admin : 0 };
  };

  const b = partir(bruto);   // lo facturado y causado
  const n = partir(nota);    // lo devuelto
  const t = partir(neto);    // lo que queda

  return {
    bruto, nota, neto, pctAdmin, ivaPct,
    // Fiscal (se causa completo; la devolución va aparte)
    baseBruta: b.base, ivaGenerado: b.iva,
    baseDevolucion: n.base, ivaDevolucion: n.iva,
    baseNeta: t.base, ivaNeto: t.iva,
    // Económico (la devolución reversa lo que no se ganó)
    adminBruta: b.admin, adminDevolucion: n.admin, admin: t.admin,
    reservaBruta: b.reserva, reservaDevolucion: n.reserva, reserva: t.reserva,
  };
}
