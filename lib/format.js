export const fmtPesos = (v) =>
  "$" + Math.round(Number(v) || 0).toLocaleString("es-CO");

export const fmtFecha = (d) => {
  if (!d) return "";
  const s = String(d);
  // Fechas tipo "YYYY-MM-DD": formatear directo, sin pasar por Date (evita el corrimiento de zona horaria).
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const x = new Date(s);
  return isNaN(x) ? s : x.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
};
