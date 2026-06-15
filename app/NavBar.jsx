"use client";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

const LINKS = [
  { href: "/", label: "Tablero" },
  { href: "/facturas-venta", label: "Facturas de venta" },
  { href: "/clientes", label: "Clientes" },
];

export default function NavBar() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  // No mostrar la barra en login ni en el documento imprimible.
  if (pathname.startsWith("/login") || pathname.startsWith("/cuenta")) return null;

  const activo = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function salir() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="navbar">
      <a className="brand" href="/">
        <img src="/FMC-LOGO.jpeg" alt="FMC" onError={(e) => { e.target.style.display = "none"; }} />
        <span>Fondo Mutuo de Cobertura<small>Control de Facturación</small></span>
      </a>
      <div className="links">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className={activo(l.href) ? "active" : ""}>{l.label}</a>
        ))}
      </div>
      <div className="acc">
        <a className="nav-cta" href="/generar">+ Generar facturación</a>
        <button className="nav-out" onClick={salir}>Salir</button>
      </div>
    </nav>
  );
}
