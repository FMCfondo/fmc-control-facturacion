// Ciclo de vida de la sesión, evaluado EN EL SERVIDOR.
//
// EL PROBLEMA QUE RESUELVE
// El cierre por inactividad vivía solo en `app/IdleLogout.jsx`: un temporizador
// de JavaScript sobre `localStorage`. Quien tuviera las cookies de sesión y no
// abriera nunca la aplicación —solo `curl` contra /api/*— no ejecutaba ese
// temporizador y por tanto nunca caducaba; y por debajo, Supabase renueva el
// token mientras el refresh token siga vivo, que por defecto no expira.
// El control existía y no defendía la superficie que entrega los datos.
//
// LAS DOS MEDIDAS, Y POR QUÉ SON DOS
//
// 1) INACTIVIDAD (2 h) — cookie `fmc_act`, firmada con HMAC y ligada al usuario.
//    Cubre el caso honesto: el equipo desatendido, la pestaña olvidada.
//    ⚠️ RESIDUO DECLARADO: quien controle el navegador puede BORRAR esa cookie
//    y obtener una ventana nueva. Contra un atacante que ya robó las cookies,
//    esta medida no es una barrera — es la número 2 la que lo acota.
//
// 2) TOPE ABSOLUTO (12 h) — se calcula desde el `amr` del propio JWT de Supabase
//    (el registro de cuándo se autenticó el usuario). NO se puede reiniciar
//    borrando cookies, porque no vive en ninguna cookie propia: viaja firmado
//    dentro del token de Supabase y sobrevive a las renovaciones.
//    Esta es la que realmente acota una credencial robada.

import crypto from "node:crypto";

export const COOKIE_ACTIVIDAD = "fmc_act";

export const INACTIVIDAD_MS = 2 * 60 * 60 * 1000;          // 2 h sin actividad
export const SESION_MAX_MS =
  (Number(process.env.SESION_MAX_HORAS) || 12) * 60 * 60 * 1000; // 12 h desde el login

// Vida de la cookie en el navegador. Tiene que ser MAYOR que INACTIVIDAD_MS:
// si el navegador la borrase antes, el servidor nunca podría leerla como vencida
// y volvería a emitir una nueva, anulando el control.
export const VIDA_COOKIE_S = 24 * 60 * 60;

const REFRESCO_MS = 60 * 1000; // no reescribir la cookie en cada llamada

// ── Llave de firma ──────────────────────────────────────────────────────────
// Preferimos una llave dedicada (`SESSION_SECRET`). Si no está, se DERIVA de la
// service_role con HKDF y una etiqueta propia: la derivada no sirve para hablar
// con Supabase y no revela la original, así que no es "una llave con dos
// funciones". Se hace así a propósito para que el control nunca quede apagado
// por una variable que falte — apagarlo sería el fallo abierto que se quiere evitar.
let llaveCache;
function llave() {
  if (llaveCache !== undefined) return llaveCache;
  const dedicada = process.env.SESSION_SECRET;
  if (dedicada) {
    llaveCache = crypto.createHash("sha256").update(dedicada).digest();
    return llaveCache;
  }
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  llaveCache = base
    ? Buffer.from(crypto.hkdfSync("sha256", base, "fmc-sesion-v1", "cookie-actividad", 32))
    : null;
  return llaveCache;
}

// ── Cookie de actividad ─────────────────────────────────────────────────────

/** Valor firmado `<userId>.<ts>.<hmac>`. Ligado al usuario: no se puede reutilizar entre sesiones. */
export function sellarMarca(userId, ts = Date.now()) {
  const k = llave();
  if (!k) return null;
  const datos = `${userId}.${ts}`;
  return `${datos}.${crypto.createHmac("sha256", k).update(datos).digest("base64url")}`;
}

/** Devuelve el timestamp si la firma es válida Y corresponde a este usuario; si no, null. */
export function leerMarca(valor, userId) {
  const k = llave();
  if (!k || !valor || typeof valor !== "string") return null;
  const corte = valor.lastIndexOf(".");
  if (corte <= 0) return null;
  const datos = valor.slice(0, corte);
  const firma = valor.slice(corte + 1);
  const esperada = crypto.createHmac("sha256", k).update(datos).digest("base64url");
  const a = Buffer.from(firma), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const sep = datos.lastIndexOf(".");
  if (sep <= 0) return null;
  if (datos.slice(0, sep) !== userId) return null; // ligada al usuario
  const ts = Number(datos.slice(sep + 1));
  return Number.isFinite(ts) ? ts : null;
}

// ── Tope absoluto desde el JWT ──────────────────────────────────────────────

/**
 * Edad real de la sesión en ms, leída del `amr` del access token de Supabase
 * (la marca de cuándo se autenticó el usuario). Sobrevive a las renovaciones de
 * token, así que un atacante no la puede reiniciar borrando cookies.
 *
 * Solo se llama DESPUÉS de que `auth.getUser()` haya validado el token contra
 * Supabase; por eso aquí basta con decodificar el payload.
 *
 * @returns {number|null} ms desde el inicio de la sesión, o null si no se puede determinar.
 */
export function edadSesionMs(accessToken, ahora = Date.now()) {
  try {
    const payload = JSON.parse(Buffer.from(String(accessToken).split(".")[1], "base64url").toString("utf8"));
    const marcas = (Array.isArray(payload.amr) ? payload.amr : [])
      .map((m) => Number(m?.timestamp))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!marcas.length) return null;
    return ahora - Math.min(...marcas) * 1000; // la más antigua = cuándo empezó la sesión
  } catch {
    return null;
  }
}
