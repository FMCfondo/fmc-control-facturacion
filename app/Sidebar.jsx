"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "../lib/supabaseClient";

// Iconos en SVG inline (sin dependencias).
const ICON = {
  tablero: (<><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></>),
  generar: (<><path d="M14 3v4a1 1 0 0 0 1 1h4" /><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" /><line x1="9" y1="13" x2="15" y2="13" /><line x1="9" y1="17" x2="13" y2="17" /></>),
  facturas: (<><path d="M5 21V4.6a.5.5 0 0 1 .8-.4L8 5.6l2.2-1.4a.5.5 0 0 1 .6 0L13 5.6l2.2-1.4a.5.5 0 0 1 .8.4V21l-2.5-1.5L11 21l-2.5-1.5L6 21z" /><line x1="8.5" y1="9.5" x2="15.5" y2="9.5" /><line x1="8.5" y1="13.5" x2="15.5" y2="13.5" /></>),
  clientes: (<><circle cx="9" cy="8" r="3" /><path d="M3.5 20v-1a5 5 0 0 1 5-5h1a5 5 0 0 1 5 5v1" /><path d="M16.5 5.3a3 3 0 0 1 0 5.4" /><path d="M20.5 20v-1a4.5 4.5 0 0 0-3-4.2" /></>),
  reportes: (<><path d="M12 4v11" /><path d="M8 11l4 4 4-4" /><path d="M5 20h14" /></>),
  actividad: (<><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4v3.6h3.6" /><path d="M12 8v4.2l3 1.8" /></>),
  seguridad: (<><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>),
};
function Ico({ name }) {
  return (
    <svg className="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON[name]}
    </svg>
  );
}

const GROUPS = [
  { label: "Operación", links: [
    { href: "/", label: "Tablero", icon: "tablero" },
    { href: "/generar", label: "Generar facturación", icon: "generar" },
    { href: "/facturas-venta", label: "Facturas de venta", icon: "facturas" },
  ] },
  { label: "Gestión", links: [
    { href: "/clientes", label: "Clientes", icon: "clientes" },
    { href: "/reportes", label: "Reportes", icon: "reportes" },
    { href: "/actividad", label: "Actividad", icon: "actividad" },
  ] },
  { label: "Sistema", links: [
    { href: "/seguridad", label: "Seguridad", icon: "seguridad" },
  ] },
];

export default function Sidebar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const activo = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function salir() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Barra superior solo en móvil */}
      <header className="sb-mobilebar">
        <button className="sb-burger" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
        </button>
        <img src="/FMC-LOGO.png" alt="FMC" className="sb-mlogo" />
      </header>

      {open && <div className="sb-overlay" onClick={() => setOpen(false)} />}

      <aside className={"sidebar " + (open ? "open" : "")}>
        <div className="sb-brand">
          <div className="sb-logobox"><img src="/FMC-LOGO.png" alt="Fondo Mutuo de Cobertura" /></div>
          <div className="sb-sub">Control de Facturación</div>
        </div>
        <nav className="sb-nav" onClick={() => setOpen(false)}>
          {GROUPS.map((g) => (
            <div className="sb-group" key={g.label}>
              <div className="sb-glabel">{g.label}</div>
              {g.links.map((l) => (
                <Link key={l.href} href={l.href} aria-current={activo(l.href) ? "page" : undefined}
                  className={"sb-link " + (activo(l.href) ? "active" : "")}>
                  <Ico name={l.icon} /><span>{l.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <button className="sb-out" onClick={salir}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          <span>Salir</span>
        </button>
      </aside>
    </>
  );
}
