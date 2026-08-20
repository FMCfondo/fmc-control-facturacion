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
  // `anticipos` es el neto de las notas, mantenido por trigger y CON SIGNO:
  // positivo = nota crédito (descuenta) · negativo = nota débito (aumenta).
  // Antes se tomaba en valor absoluto, lo que habría restado también un débito.
  const anticipos = Number(cuenta?.anticipos) || 0;
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
 * CADA NOTA TRAE SUS PROPIOS PORCENTAJES
 * Una nota que corrige una factura de junio debe reversar con los porcentajes de
 * junio, no con los de hoy: es lo que se aplicó al facturarla. Por eso cada nota
 * lleva congelados `pct_admin_origen` e `iva_pct_origen`, tomados de la cuenta de
 * cobro donde vivía la factura de origen. Cuando la nota no dice qué factura
 * corrige (las migradas del antiguo campo `anticipos`), se usan los parámetros
 * vigentes — que es lo que se hacía antes; no se inventa una foto que no se tomó.
 *
 * @param {object} c   fila con { valor, anticipos, esMutual, es_socia, notas? }
 *                     `notas`: [{ tipo, valor, pct_admin_origen, iva_pct_origen }]
 *                     Si no viene, se usa `anticipos` (compatibilidad hacia atrás).
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

  // Partir un valor con IVA en sus componentes, con las tasas que se le indiquen.
  // Se aplica igual a lo facturado y a cada nota, y por eso la reversión cuadra
  // al peso: reversar una garantía da lo mismo que no haberla facturado nunca.
  const partir = (valorConIva, tasaIva, tasaAdmin) => {
    const base = valorConIva / (1 + tasaIva);
    const admin = esMutual ? base * tasaAdmin : 0;
    return { base, iva: valorConIva - base, admin, reserva: esMutual ? base - admin : 0 };
  };

  const bruto = Number(c?.valor) || 0;
  const b = partir(bruto, ivaPct, pctAdmin);   // lo facturado y causado

  // Efecto de los ajustes. Cada nota usa SUS tasas de origen; si no las tiene,
  // las vigentes. El crédito descuenta y el débito aumenta.
  const notas = Array.isArray(c?.notas) ? c.notas : null;
  let nota = 0;
  const n = { base: 0, iva: 0, admin: 0, reserva: 0 };
  if (notas) {
    for (const nt of notas) {
      const signo = nt?.tipo === "debito" ? -1 : 1;
      const v = Math.abs(Number(nt?.valor) || 0);
      const p = partir(v, Number(nt?.iva_pct_origen) || ivaPct, Number(nt?.pct_admin_origen) || pctAdmin);
      nota += signo * v;
      n.base += signo * p.base; n.iva += signo * p.iva;
      n.admin += signo * p.admin; n.reserva += signo * p.reserva;
    }
  } else {
    // Compatibilidad: cuentas sin notas cargadas usan el neto de `anticipos`,
    // que el trigger mantiene desde esas mismas notas.
    nota = Number(c?.anticipos) || 0;
    const p = partir(Math.abs(nota), ivaPct, pctAdmin);
    const signo = Math.sign(nota) || 1;
    n.base = signo * p.base; n.iva = signo * p.iva;
    n.admin = signo * p.admin; n.reserva = signo * p.reserva;
  }

  const neto = bruto - nota;

  return {
    bruto, nota, neto, pctAdmin, ivaPct,
    // Fiscal (se causa completo; la devolución va aparte)
    baseBruta: b.base, ivaGenerado: b.iva,
    baseDevolucion: n.base, ivaDevolucion: n.iva,
    baseNeta: b.base - n.base, ivaNeto: b.iva - n.iva,
    // Económico (la devolución reversa lo que no se ganó)
    adminBruta: b.admin, adminDevolucion: n.admin, admin: b.admin - n.admin,
    reservaBruta: b.reserva, reservaDevolucion: n.reserva, reserva: b.reserva - n.reserva,
  };
}
