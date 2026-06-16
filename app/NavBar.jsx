"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "../lib/supabaseClient";

const LINKS = [
  { href: "/", label: "Tablero" },
  { href: "/generar", label: "Generar facturación" },
  { href: "/facturas-venta", label: "Facturas de venta" },
  { href: "/reportes", label: "Reportes" },
  { href: "/clientes", label: "Clientes" },
];

export default function NavBar() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  if (pathname.startsWith("/login") || pathname.startsWith("/cuenta")) return null;

  const activo = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  async function salir() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <nav className="navbar">
      <Link className="brand" href="/">
        <img src="/FMC-LOGO.jpeg" alt="FMC" onError={(e) => { e.target.style.display = "none"; }} />
        <span>Fondo Mutuo de Cobertura<small>Control de Facturación</small></span>
      </Link>
      <div className="links">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={"navlink " + (activo(l.href) ? "active" : "")}>{l.label}</Link>
        ))}
      </div>
      <button className="nav-out" onClick={salir}>Salir</button>
    </nav>
  );
}
