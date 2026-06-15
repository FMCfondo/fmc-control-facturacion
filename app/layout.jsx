import "./globals.css";
import NavBar from "./NavBar";

export const metadata = {
  title: "FMC — Control de Facturación",
  description: "Sistema interno de control de facturación · Fondo Mutuo de Cobertura S.A.S",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
