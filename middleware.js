import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

// Protege toda la app: sin sesión → redirige a /login.
// Envuelto en try/catch para que un fallo de Supabase no derribe el sitio (500).
export async function middleware(request) {
  const path = request.nextUrl.pathname;
  const esLogin = path.startsWith("/login");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Si por alguna razón faltan las variables, no bloquees con 500: deja ver el login.
  if (!url || !anon) {
    return esLogin ? NextResponse.next() : redirigirLogin(request);
  }

  try {
    let response = NextResponse.next({ request });
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const { data: { user } } = await supabase.auth.getUser();

    // ¿Tiene 2FA activado y aún no lo completó en esta sesión?
    let necesitaMfa = false;
    if (user) {
      try {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        necesitaMfa = aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1";
      } catch (_) { /* si falla el chequeo, no bloquear */ }
    }

    // Allowlist: solo los correos autorizados pueden usar la app (defensa extra).
    const permitidos = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const correoOk = !permitidos.length || (user && permitidos.includes((user.email || "").toLowerCase()));

    if (!user && !esLogin) return redirigirLogin(request);
    if (user && !correoOk && !esLogin) return redirigirLogin(request); // correo no autorizado
    if (user && necesitaMfa && !esLogin) return redirigirLogin(request); // completar 2FA
    if (user && !necesitaMfa && esLogin) {
      const u = request.nextUrl.clone();
      u.pathname = "/";
      return NextResponse.redirect(u);
    }
    return response;
  } catch (e) {
    console.error("middleware error:", e?.message || e);
    // Falla cerrado: a login (sin loop si ya estamos en login).
    return esLogin ? NextResponse.next() : redirigirLogin(request);
  }
}

function redirigirLogin(request) {
  const u = request.nextUrl.clone();
  u.pathname = "/login";
  return NextResponse.redirect(u);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
