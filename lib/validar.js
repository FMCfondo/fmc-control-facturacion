// Validación de lo que entra por las rutas /api, antes de que llegue a la base.
//
// Sin esto, un identificador malformado hace que Postgres lance
// ("invalid input syntax for type uuid"), el catch lo convierte en un 500
// genérico y el operador ve "Error del servidor" cuando lo correcto —y lo útil—
// es un 400 diciendo qué venía mal.

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esUUID = (v) => typeof v === "string" && RE_UUID.test(v);

export const esEnteroPositivo = (v) =>
  Number.isInteger(Number(v)) && Number(v) > 0 && String(v).trim() !== "";

// Recorta un texto a un tope y devuelve null si queda vacío.
export function texto(v, max = 500) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

// Neutraliza la inyección de fórmulas al exportar a Excel: una celda que empieza
// por = + - @ la interpreta Excel como fórmula, y el daño ocurre en el equipo de
// quien abra el archivo, no en el servidor. Prefijar con apóstrofo la fuerza a texto.
export function celdaSegura(v) {
  if (typeof v !== "string") return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

// Aplica `celdaSegura` a todos los valores de texto de un arreglo de objetos.
export function filasSeguras(filas) {
  return (filas || []).map((f) => {
    const o = {};
    for (const [k, v] of Object.entries(f || {})) o[k] = celdaSegura(v);
    return o;
  });
}
