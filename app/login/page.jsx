"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabaseClient";

// Motivos con los que SesionGuard puede traer al usuario hasta aquí.
const MOTIVOS = {
  sesion: "Tu sesión se cerró por seguridad (inactividad o tiempo máximo). Vuelve a ingresar.",
  acceso: "Tu sesión ya no es válida. Vuelve a ingresar.",
};

export default function Login() {
  const router = useRouter();
  const sb = createClient();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [aviso, setAviso] = useState("");
  const [cargando, setCargando] = useState(false);
  const [pedirMfa, setPedirMfa] = useState(false);
  const [code, setCode] = useState("");

  // Se lee de window en vez de `useSearchParams` para no obligar a envolver la
  // página en un <Suspense> solo por esto.
  useEffect(() => {
    const motivo = new URLSearchParams(window.location.search).get("motivo");
    if (motivo && MOTIVOS[motivo]) setAviso(MOTIVOS[motivo]);
  }, []);

  async function entrar(e) {
    e.preventDefault();
    setErr(""); setCargando(true);
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { setCargando(false); setErr("Credenciales incorrectas. Verifica tu correo y contraseña."); return; }
    // ¿Requiere segundo factor?
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    setCargando(false);
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      setPedirMfa(true);
      return;
    }
    router.push("/"); router.refresh();
  }

  async function verificarMfa(e) {
    e.preventDefault();
    setErr(""); setCargando(true);
    try {
      const { data: factors } = await sb.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      if (!totp) throw new Error("No hay 2FA configurado");
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: totp.id, code });
      if (error) throw new Error("Código incorrecto o vencido");
      router.push("/"); router.refresh();
    } catch (e2) {
      setCargando(false); setErr(e2.message);
    }
  }

  return (
    <div className="login-wrap">
      {!pedirMfa ? (
        <form className="login-card" method="post" onSubmit={entrar}>
          <div className="logo-box"><img src="/FMC-LOGO.jpeg" alt="FMC" onError={(e) => { e.target.style.display = "none"; }} /></div>
          <h1>Control de Facturación</h1>
          <p className="sub">Fondo Mutuo de Cobertura S.A.S</p>
          {aviso && <div className="login-err" style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#92400e" }}>{aviso}</div>}
          <label>Correo
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>Contraseña
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required />
          </label>
          {err && <div className="login-err">{err}</div>}
          <button className="btn-login" disabled={cargando}>{cargando ? "Ingresando…" : "Ingresar"}</button>
        </form>
      ) : (
        <form className="login-card" method="post" onSubmit={verificarMfa}>
          <div className="logo-box"><img src="/FMC-LOGO.jpeg" alt="FMC" onError={(e) => { e.target.style.display = "none"; }} /></div>
          <h1>Verificación en 2 pasos</h1>
          <p className="sub">Ingresa el código de tu app autenticadora</p>
          <label>Código de 6 dígitos
            <input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required autoFocus style={{ letterSpacing: 6, fontSize: 18, textAlign: "center" }} />
          </label>
          {err && <div className="login-err">{err}</div>}
          <button className="btn-login" disabled={cargando}>{cargando ? "Verificando…" : "Verificar"}</button>
        </form>
      )}
    </div>
  );
}
