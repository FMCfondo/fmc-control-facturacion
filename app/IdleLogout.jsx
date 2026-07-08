"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

// Cierra la sesión tras 2 horas de INACTIVIDAD (sin mouse/teclado/scroll/navegación).
// También cierra al volver a entrar si la última actividad fue hace más de 2 horas,
// para que la sesión no quede abierta indefinidamente entre visitas.
const IDLE_MS = 2 * 60 * 60 * 1000; // 2 horas
const KEY = "fmc_ultima_actividad";

export default function IdleLogout() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  useEffect(() => {
    if (pathname.startsWith("/login")) return; // en el login no aplica

    const ahora = () => Date.now();
    const leer = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
    const marcar = () => { try { localStorage.setItem(KEY, String(ahora())); } catch {} };

    const cerrar = async () => {
      try { await createClient().auth.signOut(); } catch {}
      try { localStorage.removeItem(KEY); } catch {}
      router.replace("/login");
    };
    const revisar = () => {
      const last = leer();
      if (last && ahora() - last > IDLE_MS) cerrar();
    };

    // Al montar: si la última actividad fue hace más de 2 h, cerrar de inmediato.
    const last = leer();
    if (last && ahora() - last > IDLE_MS) { cerrar(); return; }
    marcar(); // inicio de actividad

    // Registrar actividad (con throttle para no escribir en cada evento).
    let ultimoMarcado = ahora();
    const onActividad = () => {
      const t = ahora();
      if (t - ultimoMarcado > 5000) { ultimoMarcado = t; marcar(); }
    };
    const eventos = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    eventos.forEach((e) => window.addEventListener(e, onActividad, { passive: true }));

    // Al volver a la pestaña o recuperar el foco, revisar de inmediato.
    const onVisible = () => { if (document.visibilityState === "visible") revisar(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", revisar);

    const timer = setInterval(revisar, 60 * 1000); // chequeo cada minuto

    return () => {
      clearInterval(timer);
      eventos.forEach((e) => window.removeEventListener(e, onActividad));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", revisar);
    };
  }, [pathname, router]);

  return null;
}
