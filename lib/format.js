export const fmtPesos = (v) =>
  "$" + Math.round(Number(v) || 0).toLocaleString("es-CO");

export const fmtFecha = (d) => {
  if (!d) return "";
  const x = new Date(d);
  if (isNaN(x)) return String(d);
  return x.toLocaleDateString("es-CO", { year: "numeric", month: "2-digit", day: "2-digit" });
};
