"use client";
import { useEffect, useState } from "react";
import { createClient } from "../../lib/supabaseClient";

export default function Seguridad() {
  const sb = createClient();
  const [factores, setFactores] = useState([]);
  const [enroll, setEnroll] = useState(null); // { id, qr, secret }
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargar() {
    const { data } = await sb.auth.mfa.listFactors();
    setFactores((data?.totp || []).filter((f) => f.status === "verified"));
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  async function activar() {
    setMsg(""); setCargando(true);
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Autenticador " + Date.now() });
    setCargando(false);
    if (error) { setMsg("✗ " + error.message); return; }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verificar(e) {
    e.preventDefault(); setMsg(""); setCargando(true);
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setCargando(false);
    if (error) { setMsg("✗ Código incorrecto o vencido. Intenta de nuevo."); return; }
    setEnroll(null); setCode(""); setMsg("✓ Verificación en 2 pasos activada.");
    cargar();
  }

  async function quitar(id) {
    if (!confirm("¿Desactivar la verificación en 2 pasos?")) return;
    await sb.auth.mfa.unenroll({ factorId: id });
    setMsg("Verificación en 2 pasos desactivada.");
    cargar();
  }

  const activo = factores.length > 0;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Seguridad</h1>
        <p>Verificación en 2 pasos (2FA) para proteger el acceso al sistema.</p>
      </div>

      <div className="card" style={{ maxWidth: 540 }}>
        <h2>Verificación en 2 pasos</h2>

        {activo && !enroll && (
          <div>
            <p style={{ fontSize: 14, color: "#166534", fontWeight: 600, marginBottom: 12 }}>✓ Activada</p>
            <p style={{ fontSize: 13, color: "var(--gris)", marginBottom: 14 }}>Al iniciar sesión se te pedirá un código de tu app autenticadora.</p>
            {factores.map((f) => (
              <button key={f.id} className="logout" onClick={() => quitar(f.id)} style={{ color: "#dc2626", borderColor: "#fecaca", background: "#fef2f2" }}>Desactivar 2FA</button>
            ))}
          </div>
        )}

        {!activo && !enroll && (
          <div>
            <p style={{ fontSize: 13, color: "var(--gris)", marginBottom: 14 }}>
              Aún no está activada. Necesitas una app autenticadora (Google Authenticator, Microsoft Authenticator, etc.).
            </p>
            <button className="btn-primary" onClick={activar} disabled={cargando}>{cargando ? "Generando…" : "Activar 2FA"}</button>
          </div>
        )}

        {enroll && (
          <form onSubmit={verificar}>
            <p style={{ fontSize: 13, color: "var(--gris)", marginBottom: 12 }}>1. Escanea este código QR con tu app autenticadora:</p>
            <div style={{ textAlign: "center", margin: "8px 0 14px" }} dangerouslySetInnerHTML={{ __html: enroll.qr }} />
            <p style={{ fontSize: 12, color: "var(--gris)" }}>¿No puedes escanear? Ingresa esta clave manualmente:</p>
            <code style={{ display: "block", background: "#f1f5f9", padding: "8px 10px", borderRadius: 6, fontSize: 12, margin: "6px 0 16px", wordBreak: "break-all" }}>{enroll.secret}</code>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 10 }}>2. Ingresa el código de 6 dígitos
              <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required
                style={{ width: "100%", marginTop: 6, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 18, letterSpacing: 6, textAlign: "center" }} />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="logout" onClick={() => { setEnroll(null); setCode(""); }}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={cargando}>{cargando ? "Verificando…" : "Confirmar y activar"}</button>
            </div>
          </form>
        )}

        {msg && <div style={{ marginTop: 14, fontSize: 13, color: msg.startsWith("✓") ? "#166534" : (msg.startsWith("✗") ? "#dc2626" : "var(--gris)") }}>{msg}</div>}
      </div>
    </div>
  );
}
