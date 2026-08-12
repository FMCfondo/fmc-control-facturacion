// Origen público de la aplicación: se usa para el `fetch` del logo desde el
// servidor y para la URL que queda incrustada en los correos a las mutuales.
//
// POR QUÉ NO SE TOMA DIRECTO DE LA PETICIÓN
// `new URL(request.url).origin` se deriva de la cabecera `Host`, que la envía el
// cliente. Con un Host falsificado, el servidor pediría el logo a un destino
// ajeno (petición saliente controlada por el cliente) y ese destino quedaría
// dentro del correo que reciben las mutuales. Vercel enruta por Host y rechaza
// los que no correspondan al proyecto — pero esa es una defensa del proveedor,
// no del código, y este archivo la deja de aportar el código.

const DOMINIO_OFICIAL = "https://facturacion.fondomutuodecobertura.com";

// Hosts de confianza: el dominio oficial y los despliegues del propio proyecto
// en Vercel (necesarios para que los previews sigan funcionando).
const PERMITIDOS = [
  /^https:\/\/facturacion\.fondomutuodecobertura\.com$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
  /^http:\/\/localhost:\d+$/,
];

export function origenApp(request) {
  const fijo = (process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (fijo) return fijo;

  const origen = new URL(request.url).origin;
  if (PERMITIDOS.some((re) => re.test(origen))) return origen;

  console.error(`origenApp: Host no reconocido (${origen}); se usa el dominio oficial. Define APP_URL en Vercel.`);
  return DOMINIO_OFICIAL;
}
