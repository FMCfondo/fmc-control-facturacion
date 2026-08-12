"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

// Reacciona a que el SERVIDOR cierre la sesión.
//
// POR QUÉ HACE FALTA
// Desde que `requireUser()` aplica de verdad el tope de inactividad y el tope
// absoluto, cualquier ruta /api puede responder 401 en medio del uso normal.
// Ninguna de las 28 llamadas `fetch("/api/...")` de la aplicación miraba el
// código de estado: todas hacían `r.json()` y seguían. El resultado visible
// habría sido una pantalla vacía sin explicación. Endurecer el servidor sin
// enseñarle esto al navegador convierte una corrección de seguridad en un fallo
// de uso, y le corresponde al mismo lote.
//
// CÓMO
// Se envuelve `window.fetch` una sola vez, en lugar de tocar 28 sitios: así
// ninguna llamada futura se puede olvidar de manejarlo. Solo actúa sobre
// respuestas 401 de rutas /api del propio origen; todo lo demás pasa intacto,
// incluidas las llamadas del cliente de Supabase.
export default function SesionGuard() {
  const router = useRouter();
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (pathname.startsWith("/login")) return;
    if (typeof window === "undefined" || window.__fmcFetchEnvuelto) return;

    const original = window.fetch.bind(window);
    let saliendo = false;

    async function salir(motivo) {
      if (saliendo) return;
      saliendo = true;
      try { await createClient().auth.signOut(); } catch { /* la sesión ya podía estar muerta */ }
      try { localStorage.removeItem("fmc_ultima_actividad"); } catch { /* modo privado */ }
      window.location.replace(`/login?motivo=${motivo}`);
    }

    window.fetch = async (...args) => {
      const respuesta = await original(...args);
      try {
        if (respuesta.status === 401) {
          const url = new URL(
            typeof args[0] === "string" ? args[0] : args[0]?.url || "",
            window.location.origin
          );
          if (url.origin === window.location.origin && url.pathname.startsWith("/api/")) {
            // Se clona para no consumir el cuerpo que espera quien llamó.
            const cuerpo = await respuesta.clone().json().catch(() => ({}));
            salir(cuerpo?.motivo === "sesion_vencida" ? "sesion" : "acceso");
          }
        }
      } catch { /* nunca romper la petición original por culpa del vigilante */ }
      return respuesta;
    };
    window.__fmcFetchEnvuelto = true;

    return () => {
      window.fetch = original;
      window.__fmcFetchEnvuelto = false;
    };
  }, [pathname, router]);

  return null;
}
