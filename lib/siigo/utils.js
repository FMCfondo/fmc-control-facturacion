// Lógica de transformación y validación portada desde Facturacion_FMC_SIIGO.html.
// JavaScript puro, sin dependencias del DOM — reutilizable en la app Next.js.

export const norm = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const round2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
export const round6 = (v) => Math.round((Number(v) + Number.EPSILON) * 1e6) / 1e6;

// Parser de moneda en formato colombiano ($ . miles , decimal). {valor, ok}.
export function parseMoneda(v) {
  if (v == null) return { valor: 0, ok: false };
  if (typeof v === "number") return { valor: v, ok: !isNaN(v) };
  let s = String(v).trim();
  if (!s) return { valor: 0, ok: false };
  s = s.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return { valor: 0, ok: false };
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return { valor: isNaN(n) ? 0 : n, ok: !isNaN(n) };
}

const PRIMES = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];
export function digitoVerificacion(id) {
  const s = String(id).replace(/\D/g, "").padStart(15, "0");
  let t = 0;
  for (let i = 0; i < 15; i++) t += parseInt(s[i]) * PRIMES[i];
  const r = t % 11;
  return r > 1 ? 11 - r : r;
}

export function limpiarNombre(n) {
  if (!n) return "";
  return String(n)
    .replace(/[​-‍﻿‌‎‏]/g, "")
    .replace(/\s+/g, " ").trim()
    .replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]/g, "")
    .split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function separarNombres(full) {
  const p = limpiarNombre(full).split(/\s+/).filter(Boolean);
  const pre = ["de", "del", "la", "los", "las", "van", "von"];
  if (p.length <= 1) return { nombres: p[0] || "", apellidos: "" };
  if (p.length === 2) return { nombres: p[0], apellidos: p[1] };
  if (p.length === 3) return { nombres: p[0], apellidos: p.slice(1).join(" ") };
  let si = p.length - 2;
  if (p.length >= 4 && pre.includes((p[p.length - 3] || "").toLowerCase())) si = p.length - 3;
  return { nombres: p.slice(0, si).join(" "), apellidos: p.slice(si).join(" ") };
}

// Valida y detecta problemas de correo (coma, espacio, etc.). {email, ok, error}.
export function limpiarCorreo(email) {
  if (email == null || String(email).trim() === "") return { email: "", ok: false, error: "Vacío" };
  let e = String(email).trim().toLowerCase();
  // Corrección de typos SOLO sobre la etiqueta de proveedor del dominio, por coincidencia
  // exacta, para no corromper dominios válidos (ej. "gmai" no debe tocar "gmail").
  const provFix = { gmial: "gmail", gmal: "gmail", gmai: "gmail", gamil: "gmail",
    hotmal: "hotmail", hotmai: "hotmail", outlok: "outlook", outllok: "outlook", yaho: "yahoo" };
  if (e.includes("@")) {
    const at = e.lastIndexOf("@");
    let local = e.slice(0, at), dom = e.slice(at + 1);
    const parts = dom.split(".");
    if (parts.length >= 2 && provFix[parts[0]]) parts[0] = provFix[parts[0]];
    e = local + "@" + parts.join(".");
  }
  const probs = [];
  if (/\s/.test(e)) probs.push("espacio");
  if (e.includes(",")) probs.push("coma");
  if (e.includes(";")) probs.push("punto y coma");
  if ((e.match(/@/g) || []).length !== 1) probs.push("debe tener un solo @");
  if (/\.{2,}/.test(e)) probs.push("puntos seguidos");
  if (/^[.@]|[.@]$/.test(e)) probs.push("empieza/termina con . o @");
  const re = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/;
  if (!e.includes("@")) probs.push("falta @");
  else if (probs.length === 0 && !re.test(e)) probs.push("formato inválido");
  if (probs.length) return { email: e, ok: false, error: probs.join(", ") };
  return { email: e, ok: true, error: null };
}

// Valida teléfonos: celular = 10 díg. empezando en 3; fijo = 7 ó 10 díg.
export function validarTelefono(t) {
  const d = String(t || "").replace(/\D/g, "");
  if (!d || /^0+$/.test(d)) return { tel: d, ok: false, error: "Vacío o cero" };
  if (d.length === 10 && d[0] === "3") return { tel: d, ok: true };
  if (d.length === 7) return { tel: d, ok: true };
  if (d.length === 10 && d[0] !== "3") return { tel: d, ok: true };
  return { tel: d, ok: false, error: d.length + " dígitos" };
}

// Cálculo de comisión → reserva individual + administración (regla del Excel).
// es_socia=true → admin 13%; false → 17%. iva por defecto 19%.
export function desglosarComision(valorConIva, esSocia, { iva = 0.19, adminSocia = 0.13, adminNoSocia = 0.17 } = {}) {
  const base = valorConIva / (1 + iva);
  const pctAdmin = esSocia ? adminSocia : adminNoSocia;
  const administracion = base * pctAdmin;
  const reservaIndividual = base * (1 - pctAdmin);
  const ivaValor = valorConIva - base;
  return {
    base: round2(base),
    administracion: round2(administracion),
    reservaIndividual: round2(reservaIndividual),
    iva: round2(ivaValor),
  };
}
