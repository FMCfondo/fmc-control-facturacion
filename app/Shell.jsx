"use client";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// El login y la vista imprimible de la cuenta de cobro van a pantalla completa (sin barra lateral).
export default function Shell({ children }) {
  const pathname = usePathname() || "/";
  const sinChrome = pathname.startsWith("/login") || pathname.startsWith("/cuenta");
  if (sinChrome) return <>{children}</>;
  return (
    <div className="shell">
      <Sidebar />
      <main className="shell-main">{children}</main>
    </div>
  );
}
