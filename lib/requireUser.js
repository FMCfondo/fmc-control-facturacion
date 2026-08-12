// Verificación de sesión del lado del servidor para las rutas /api.
// Es la ÚNICA validación de las rutas /api: el proxy (antes middleware) no corre sobre /api
// (evita pagar dos veces el viaje de red a Supabase Auth). Por eso aquí se valida
// todo: sesión + segundo factor (2FA) + allowlist de correos + ciclo de vida de la sesión.
//
// Uso en cada handler:
//   const { response } = await requireUser();
//   if (response) return response;        // 401 si no hay sesión válida
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import {
  COOKIE_ACTIVIDAD, INACTIVIDAD_MS, SESION_MAX_MS, VIDA_COOKIE_S,
  sellarMarca, leerMarca, edadSesionMs,
} from "./sesion";

// Cliente de Supabase ligado a las cookies de ESTA request.
// Desde Next 15, cookies() es asíncrono.
async function clienteConCookies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: { getAll: () => store.getAll(), setAll() {} },
  });
}

// Sesión validada. `cache()` la memoiza por request: si en el mismo handler se
// llama a requireUser() y luego a currentUserEmail() (bitácora), solo se hace
// UNA llamada de red a Supabase Auth.
const sesion = cache(async () => {
  const vacia = { user: null, mfaPendiente: false, accessToken: null };
  try {
    const sb = await clienteConCookies();
    if (!sb) return vacia;
    const { data: { user } } = await sb.auth.getUser();   // valida contra Supabase (red)
    if (!user) return vacia;
    // ¿Tiene 2FA activo y no lo completó? (se resuelve leyendo el JWT, sin red)
    let mfaPendiente = false;
    try {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      mfaPendiente = !!aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1";
    } catch { /* si falla el chequeo, no bloquear */ }
    // El token ya está validado por getUser(); se guarda para leer su `amr`
    // (marca de cuándo se autenticó) sin otra llamada de red.
    let accessToken = null;
    try {
      const { data: { session } } = await sb.auth.getSession();
      accessToken = session?.access_token || null;
    } catch { /* sin token no hay tope absoluto; se registra abajo */ }
    return { user, mfaPendiente, accessToken };
  } catch {
    return vacia;
  }
});

/**
 * Ciclo de vida de la sesión. Devuelve el motivo del cierre, o null si sigue viva.
 * Ver lib/sesion.js para por qué son dos medidas y cuál es el residuo de cada una.
 */
async function revisarCicloDeVida(user, accessToken) {
  const ahora = Date.now();

  // 1) Tope ABSOLUTO — no se puede reiniciar borrando cookies.
  const edad = edadSesionMs(accessToken, ahora);
  if (edad != null && edad > SESION_MAX_MS) return "sesion_vencida";

  // 2) INACTIVIDAD — cookie propia, firmada y ligada al usuario.
  try {
    const store = await cookies();
    const ts = leerMarca(store.get(COOKIE_ACTIVIDAD)?.value, user.id);
    if (ts && ahora - ts > INACTIVIDAD_MS) {
      store.delete(COOKIE_ACTIVIDAD);
      return "sesion_vencida";
    }
    if (!ts || ahora - ts > 60 * 1000) {
      const valor = sellarMarca(user.id, ahora);
      if (valor) {
        store.set(COOKIE_ACTIVIDAD, valor, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: VIDA_COOKIE_S, // > INACTIVIDAD_MS a propósito
        });
      }
    }
  } catch (e) {
    // Si no se puede leer o escribir la cookie, no se expulsa al operador: el
    // tope absoluto (1) sigue aplicando y es el que acota una credencial robada.
    console.error("requireUser: no se pudo evaluar la inactividad:", e?.message || e);
  }
  return null;
}

export async function requireUser() {
  const no = (motivo = "no_autorizado") => ({
    response: NextResponse.json({ error: "No autorizado", motivo }, { status: 401 }),
  });

  const { user, mfaPendiente, accessToken } = await sesion();
  if (!user || mfaPendiente) return no();

  // Allowlist de correos. FALLA CERRADO: si la variable no está, se deniega.
  // Antes se saltaba la comprobación entera cuando la lista venía vacía, de modo
  // que un despliegue sin la variable (p. ej. un preview) aceptaba a cualquier
  // usuario del proyecto Supabase, y lo hacía en silencio.
  const permitidos = (process.env.ALLOWED_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!permitidos.length) {
    console.error("requireUser: ALLOWED_EMAILS no está definida en este entorno. Se deniega el acceso (fallo cerrado). Defínela en Vercel → Settings → Environment Variables.");
    return no("configuracion");
  }
  if (!permitidos.includes((user.email || "").toLowerCase())) return no();

  const motivo = await revisarCicloDeVida(user, accessToken);
  if (motivo) return no(motivo);

  return { user };
}

// Correo del usuario actual (o null) — para sellar la bitácora con "quién".
export async function currentUserEmail() {
  const { user } = await sesion();
  return user?.email || null;
}
