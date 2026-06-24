import "./globals.css";
import Shell from "./Shell";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata = {
  title: "FMC — Control de Facturación",
  description: "Sistema interno de control de facturación · Fondo Mutuo de Cobertura S.A.S",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <Shell>{children}</Shell>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
