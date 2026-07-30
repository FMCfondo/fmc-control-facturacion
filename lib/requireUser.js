// Verificación de sesión del lado del servidor para las rutas /api.
// Es la ÚNICA validación de las rutas /api: el middleware ya no corre sobre /api
// (evita pagar dos veces el viaje de red a Supabase Auth). Por eso aquí se valida
// todo: sesión + allowlist de correos + segundo factor (2FA) completado.
//
// Uso en cada handler:
//   const { response } = await requireUser();
//   if (response) return response;        // 401 si no hay sesión válida
import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// Cliente de Supabase ligado a las cookies de ESTA request.
function clienteConCookies() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const store = cookies();
  return createServerClient(url, anon, {
    cookies: { getAll: () => store.getAll(), setAll() {} },
  });
}

// Sesión validada. `cache()` la memoiza por request: si en el mismo handler se
// llama a requireUser() y luego a currentUserEmail() (bitácora), solo se hace
// UNA llamada de red a Supabase Auth.
const sesion = cache(async () => {
  try {
    const sb = clienteConCookies();
    if (!sb) return { user: null, mfaPendiente: false };
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { user: null, mfaPendiente: false };
    // ¿Tiene 2FA activo y no lo completó? (se resuelve leyendo el JWT, sin red)
    let mfaPendiente = false;
    try {
      const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      mfaPendiente = !!aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1";
    } catch { /* si falla el chequeo, no bloquear */ }
    return { user, mfaPendiente };
  } catch {
    return { user: null, mfaPendiente: false };
  }
});

export async function requireUser() {
  const no = () => ({ response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) });
  const { user, mfaPendiente } = await sesion();
  if (!user || mfaPendiente) return no();
  // Allowlist de correos (misma defensa que el middleware).
  const permitidos = (process.env.ALLOWED_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (permitidos.length && !permitidos.includes((user.email || "").toLowerCase())) return no();
  return { user };
}

// Correo del usuario actual (o null) — para sellar la bitácora con "quién".
export async function currentUserEmail() {
  const { user } = await sesion();
  return user?.email || null;
}
