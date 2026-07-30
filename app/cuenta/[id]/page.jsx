"use client";
import { useParams } from "next/navigation";
import CuentaVista from "../../CuentaVista";

// Vista de página completa (pestaña propia). El mismo documento se muestra
// superpuesto sobre el Tablero desde CuentasManager.
export default function CuentaCobroPagina() {
  const { id } = useParams();
  return <CuentaVista id={id} />;
}
