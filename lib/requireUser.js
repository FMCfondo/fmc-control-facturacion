// Verificación de sesión del lado del servidor para las rutas /api.
// Defensa en profundidad: el middleware ya protege las rutas, pero si por algún
// motivo se evade (p. ej. un bug futuro), esto evita exponer la service_role.
//
// Uso en cada handler:
//   const { response } = await requireUser();
//   if (response) return response;        // 401 si no hay sesión válida
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export async function requireUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const no = () => ({ response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) });
  if (!url || !anon) return no();
  try {
    const store = cookies();
    const sb = createServerClient(url, anon, {
      cookies: { getAll: () => store.getAll(), setAll() {} },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return no();
    // Allowlist de correos (misma defensa que el middleware).
    const permitidos = (process.env.ALLOWED_EMAILS || "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (permitidos.length && !permitidos.includes((user.email || "").toLowerCase())) return no();
    return { user };
  } catch {
    return no();
  }
}
