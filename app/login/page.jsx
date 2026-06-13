"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabaseClient";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [cargando, setCargando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErr("");
    setCargando(true);
    const sb = createClient();
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    setCargando(false);
    if (error) {
      setErr("Credenciales incorrectas. Verifica tu correo y contraseña.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={entrar}>
        <h1>Control de Facturación</h1>
        <p className="sub">Fondo Mutuo de Cobertura S.A.S</p>
        <label>Correo
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label>Contraseña
          <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required />
        </label>
        {err && <div className="login-err">{err}</div>}
        <button className="btn-login" disabled={cargando}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
