import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "./firebase";

const COLORS = {
  bg: "#F7F3FF", lilaDeep: "#9B72CF", lavanda: "#E2D4F7",
  text: "#3D2C5E", textLight: "#7B6A9A", border: "#E8DCFF",
  danger: "#E88FAA", lila: "#C4A8E8",
};

export default function Login() {
  const [modo, setModo] = useState("login"); // login | registro
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      if (modo === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      const msgs = {
        "auth/user-not-found": "No existe una cuenta con ese email",
        "auth/wrong-password": "Contraseña incorrecta",
        "auth/email-already-in-use": "Ya existe una cuenta con ese email",
        "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
        "auth/invalid-email": "Email inválido",
        "auth/invalid-credential": "Email o contraseña incorrectos",
      };
      setError(msgs[e.code] || "Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}></div>
          <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.text, fontFamily: "'Playfair Display', serif" }}>Presupuesto</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.lilaDeep, fontFamily: "'Playfair Display', serif" }}>Familiar</div>
          <div style={{ fontSize: 13, color: COLORS.textLight, marginTop: 6, fontFamily: "'Nunito', sans-serif" }}>Tus finanzas, juntos </div>
        </div>

        {/* Card */}
        <div style={{ background: "#fff", borderRadius: 24, padding: "28px 24px", boxShadow: "0 4px 32px rgba(156,114,207,0.14)", border: `1px solid ${COLORS.border}` }}>
          {/* Toggle login/registro */}
          <div style={{ display: "flex", background: COLORS.lavanda, borderRadius: 12, padding: 4, marginBottom: 24 }}>
            {["login", "registro"].map(m => (
              <button key={m} onClick={() => { setModo(m); setError(""); }} style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 14, background: modo === m ? COLORS.lilaDeep : "transparent", color: modo === m ? "#fff" : COLORS.textLight, transition: "all 0.2s" }}>
                {m === "login" ? "Ingresar" : "Registrarse"}
              </button>
            ))}
          </div>

          {/* Campos */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, fontFamily: "'Nunito', sans-serif" }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 15, fontFamily: "'Nunito', sans-serif", outline: "none" }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, fontFamily: "'Nunito', sans-serif" }}>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="******" onKeyDown={e => e.key === "Enter" && handleSubmit()} style={{ width: "100%", padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 15, fontFamily: "'Nunito', sans-serif", outline: "none" }} />
          </div>

          {error && (
            <div style={{ background: "#FFE8EE", border: `1px solid ${COLORS.danger}`, borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#B0003A", fontFamily: "'Nunito', sans-serif" }}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", cursor: loading ? "not-allowed" : "pointer", background: loading ? COLORS.lila : COLORS.lilaDeep, color: "#fff", fontSize: 16, fontWeight: 800, fontFamily: "'Nunito', sans-serif", transition: "all 0.2s" }}>
            {loading ? "Cargando..." : modo === "login" ? "Ingresar >" : "Crear cuenta >"}
          </button>

          {modo === "registro" && (
            <div style={{ marginTop: 14, fontSize: 12, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif", textAlign: "center", lineHeight: 1.5 }}>
              Creá tu cuenta y después compartile el email a tu esposa para que se registre también. Los dos usan la misma base de datos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
