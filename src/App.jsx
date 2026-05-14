import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./Login";

// â”€â”€â”€ COLORES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COLORS = {
  bg: "#F7F3FF", card: "#FFFFFF", lila: "#C4A8E8", lilaLight: "#EAD9FF",
  lilaDeep: "#9B72CF", lavanda: "#E2D4F7", rosa: "#F5C6D8", mint: "#C8EFE3",
  peach: "#FFE0CC", text: "#3D2C5E", textLight: "#7B6A9A", border: "#E8DCFF",
  danger: "#E88FAA", success: "#7DC9A8", warning: "#F5D78A",
};

const CATEGORIAS = ["Comida", "Transporte", "Salud", "Educacion", "Entretenimiento", "Hogar", "Ropa", "Otros"];

const DATA_INICIAL = {
  ingresos: [],
  gastos: [],
  presupuestos: { Comida: 120000, Transporte: 60000, Salud: 40000, Educacion: 30000, Entretenimiento: 25000, Hogar: 80000, Ropa: 20000, Otros: 30000 },
  tarjetas: [
    { id: 1, nombre: "Tarjeta 1", color: "#C4A8E8", fijos: [], cuotas: [] },
    { id: 2, nombre: "Tarjeta 2", color: "#F5C6D8", fijos: [], cuotas: [] },
  ],
  mayorista: {
    listaActiva: {
      id: 1,
      nombre: new Date().toLocaleString("es-AR", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase()),
      fecha: new Date().toISOString().split("T")[0],
      cerrada: false,
      items: [],
    },
    historial: [],
  },
  ahorros: { metas: [], movimientos: [] },
};

// â”€â”€â”€ UTILS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const formatMoney = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);

// â”€â”€â”€ COMPONENTES BASE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ProgressBar = ({ value, max, color = COLORS.lila, label, sublabel }) => {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100);
  const isOver = value > max;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, fontFamily: "'Nunito', sans-serif" }}>{label}</span>
        <span style={{ fontSize: 12, color: isOver ? COLORS.danger : COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>
          {formatMoney(value)} / {formatMoney(max)}
        </span>
      </div>
      <div style={{ height: 10, borderRadius: 99, background: COLORS.lavanda, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: isOver ? COLORS.danger : color, transition: "width 0.6s cubic-bezier(.4,0,.2,1)" }} />
      </div>
      {sublabel && <span style={{ fontSize: 11, color: COLORS.textLight, marginTop: 2, display: "block" }}>{sublabel}</span>}
    </div>
  );
};

const Card = ({ children, style = {} }) => (
  <div style={{ background: COLORS.card, borderRadius: 18, padding: "16px 18px", boxShadow: "0 2px 16px rgba(156,114,207,0.10)", border: `1px solid ${COLORS.border}`, marginBottom: 12, ...style }}>
    {children}
  </div>
);

const Badge = ({ children, color = COLORS.lilaLight, textColor = COLORS.lilaDeep }) => (
  <span style={{ background: color, color: textColor, borderRadius: 99, padding: "2px 10px", fontSize: 11, fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>{children}</span>
);

const Inp = ({ label, ...props }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, fontFamily: "'Nunito', sans-serif" }}>{label}</label>}
    <input {...props} style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", boxSizing: "border-box", ...props.style }} />
  </div>
);

const Sel = ({ label, children, ...props }) => (
  <div style={{ marginBottom: 12 }}>
    {label && <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, fontFamily: "'Nunito', sans-serif" }}>{label}</label>}
    <select {...props} style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", boxSizing: "border-box" }}>
      {children}
    </select>
  </div>
);

const Btn = ({ children, onClick, variant = "primary", small = false, style = {} }) => {
  const base = { borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700, transition: "all 0.18s", display: "inline-flex", alignItems: "center", gap: 6 };
  const variants = {
    primary: { background: COLORS.lilaDeep, color: "#fff", padding: small ? "7px 14px" : "11px 20px", fontSize: small ? 13 : 15 },
    secondary: { background: COLORS.lavanda, color: COLORS.lilaDeep, padding: small ? "7px 14px" : "11px 20px", fontSize: small ? 13 : 15 },
    danger: { background: COLORS.rosa, color: "#B0003A", padding: small ? "7px 14px" : "11px 20px", fontSize: small ? 13 : 15 },
    success: { background: COLORS.mint, color: "#1A6B4A", padding: small ? "7px 14px" : "11px 20px", fontSize: small ? 13 : 15 },
  };
  return <button onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
};

// â”€â”€â”€ TAB: RESUMEN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TabResumen({ data }) {
  const totalIngresos = (data.ingresos || []).reduce((s, i) => s + i.monto, 0);
  const totalGastos = (data.gastos || []).reduce((s, g) => s + g.monto, 0);
  const balance = totalIngresos - totalGastos;
  const gastosPorCat = {};
  CATEGORIAS.forEach(c => { gastosPorCat[c] = 0; });
  (data.gastos || []).forEach(g => { gastosPorCat[g.categoria] = (gastosPorCat[g.categoria] || 0) + g.monto; });
  const catColors = [COLORS.lila, COLORS.rosa, COLORS.mint, COLORS.peach, "#B8D8E8", "#F5D78A", "#D4C5F0", "#C8EFD4"];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Ingresos", value: totalIngresos, color: COLORS.mint, textColor: "#1A6B4A" },
          { label: "Gastos", value: totalGastos, color: COLORS.rosa, textColor: "#B0003A" },
          { label: "Balance", value: balance, color: balance >= 0 ? COLORS.lavanda : COLORS.rosa, textColor: balance >= 0 ? COLORS.lilaDeep : "#B0003A" },
        ].map(({ label, value, color, textColor }) => (
          <div key={label} style={{ background: color, borderRadius: 16, padding: "14px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: textColor, fontWeight: 700, fontFamily: "'Nunito', sans-serif", opacity: 0.8 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: textColor, fontFamily: "'Playfair Display', serif", marginTop: 4 }}>{formatMoney(value)}</div>
          </div>
        ))}
      </div>
      <Card>
        <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.text, fontFamily: "'Playfair Display', serif", marginBottom: 14 }}>Presupuesto por categorÃ­a</div>
        {CATEGORIAS.map((cat, i) => {
          const usado = gastosPorCat[cat] || 0;
          const max = (data.presupuestos || {})[cat] || 1;
          return <ProgressBar key={cat} label={cat} value={usado} max={max} color={catColors[i % catColors.length]} sublabel={usado === 0 ? "Sin gastos este mes" : undefined} />;
        })}
      </Card>
    </div>
  );
}

// â”€â”€â”€ TAB: GASTOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TabGastos({ data, saveData }) {
  const [form, setForm] = useState({ descripcion: "", monto: "", categoria: "Comida", quien: "el", fecha: new Date().toISOString().split("T")[0] });
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState("gastos");

  const add = () => {
    if (!form.descripcion || !form.monto) return;
    const nuevo = { id: Date.now(), ...form, monto: parseFloat(form.monto) };
    if (tab === "gastos") {
      saveData({ gastos: [nuevo, ...(data.gastos || [])] });
    } else {
      saveData({ ingresos: [nuevo, ...(data.ingresos || [])] });
    }
    setForm({ descripcion: "", monto: "", categoria: "Comida", quien: "el", fecha: new Date().toISOString().split("T")[0] });
    setShowForm(false);
  };

  const eliminar = (id) => {
    if (tab === "gastos") saveData({ gastos: (data.gastos || []).filter(g => g.id !== id) });
    else saveData({ ingresos: (data.ingresos || []).filter(g => g.id !== id) });
  };

  const list = tab === "gastos" ? (data.gastos || []) : (data.ingresos || []);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {["gastos", "ingresos"].map(t => (
          <button key={t} onClick={() => { setTab(t); setShowForm(false); }} style={{ flex: 1, padding: "10px", borderRadius: 12, border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 14, background: tab === t ? COLORS.lilaDeep : COLORS.lavanda, color: tab === t ? "#fff" : COLORS.lilaDeep }}>
            {t === "gastos" ? "ðŸ’¸ Gastos" : "ðŸ’° Ingresos"}
          </button>
        ))}
      </div>
      {!showForm ? (
        <Btn onClick={() => setShowForm(true)} style={{ width: "100%", justifyContent: "center", marginBottom: 14 }}>+ Agregar {tab === "gastos" ? "gasto" : "ingreso"}</Btn>
      ) : (
        <Card style={{ background: COLORS.lavanda }}>
          <Inp label="Descripcin" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Supermercado" />
          <Inp label="Monto ($)" type="number" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0" />
          {tab === "gastos" && (
            <Sel label="Categoria" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </Sel>
          )}
          <Sel label="Â¿QuiÃ©n?" value={form.quien} onChange={e => setForm(f => ({ ...f, quien: e.target.value }))}>
            <option>Ã©l</option><option>ella</option>
          </Sel>
          <Inp label="Fecha" type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={add} style={{ flex: 1, justifyContent: "center" }}>Guardar</Btn>
            <Btn variant="secondary" onClick={() => setShowForm(false)} style={{ flex: 1, justifyContent: "center" }}>Cancelar</Btn>
          </div>
        </Card>
      )}
      {list.map(item => (
        <Card key={item.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.text, fontFamily: "'Nunito', sans-serif" }}>{item.descripcion}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap", alignItems: "center" }}>
                {item.categoria && <Badge>{item.categoria}</Badge>}
                <Badge color={item.quien === "Ã©l" ? "#D4C5F0" : COLORS.rosa} textColor={item.quien === "Ã©l" ? COLORS.lilaDeep : "#B0003A"}>{item.quien}</Badge>
                <span style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>{item.fecha}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: tab === "gastos" ? COLORS.danger : COLORS.success, fontFamily: "'Playfair Display', serif" }}>
                {tab === "gastos" ? "-" : "+"}{formatMoney(item.monto)}
              </div>
              <button onClick={() => eliminar(item.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, opacity: 0.4 }}>ðŸ—‘</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// â”€â”€â”€ TAB: TARJETAS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TabTarjetas({ data, saveData }) {
  const [sel, setSel] = useState(0);
  const [showFijo, setShowFijo] = useState(false);
  const [showCuota, setShowCuota] = useState(false);
  const [formF, setFormF] = useState({ descripcion: "", monto: "", dia: "" });
  const [formC, setFormC] = useState({ descripcion: "", montoTotal: "", montoCuota: "", cuotasTotal: "" });

  const tarjetas = data.tarjetas || [];
  const tarjeta = tarjetas[sel] || { fijos: [], cuotas: [] };
  const totalFijos = (tarjeta.fijos || []).reduce((s, f) => s + f.monto, 0);
  const totalCuotas = (tarjeta.cuotas || []).reduce((s, c) => s + c.montoCuota, 0);

  const updateTarjetas = (nuevas) => saveData({ tarjetas: nuevas });

  const addFijo = () => {
    if (!formF.descripcion || !formF.monto) return;
    const nuevo = { id: Date.now(), descripcion: formF.descripcion, monto: parseFloat(formF.monto), dia: parseInt(formF.dia) || 1 };
    const nuevas = tarjetas.map((t, i) => i === sel ? { ...t, fijos: [...(t.fijos || []), nuevo] } : t);
    updateTarjetas(nuevas);
    setFormF({ descripcion: "", monto: "", dia: "" });
    setShowFijo(false);
  };

  const addCuota = () => {
    if (!formC.descripcion || !formC.montoCuota) return;
    const nuevo = { id: Date.now(), descripcion: formC.descripcion, montoTotal: parseFloat(formC.montoTotal) || 0, montoCuota: parseFloat(formC.montoCuota), cuotasPagadas: 0, cuotasTotal: parseInt(formC.cuotasTotal) || 12 };
    const nuevas = tarjetas.map((t, i) => i === sel ? { ...t, cuotas: [...(t.cuotas || []), nuevo] } : t);
    updateTarjetas(nuevas);
    setFormC({ descripcion: "", montoTotal: "", montoCuota: "", cuotasTotal: "" });
    setShowCuota(false);
  };

  const pagarCuota = (cuotaId) => {
    const nuevas = tarjetas.map((t, i) => i === sel ? {
      ...t,
      cuotas: (t.cuotas || []).map(c => c.id === cuotaId && c.cuotasPagadas < c.cuotasTotal ? { ...c, cuotasPagadas: c.cuotasPagadas + 1 } : c).filter(c => c.cuotasPagadas < c.cuotasTotal)
    } : t);
    updateTarjetas(nuevas);
  };

  const eliminarFijo = (fId) => {
    const nuevas = tarjetas.map((t, i) => i === sel ? { ...t, fijos: (t.fijos || []).filter(f => f.id !== fId) } : t);
    updateTarjetas(nuevas);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        {tarjetas.map((t, i) => (
          <button key={t.id} onClick={() => setSel(i)} style={{ flex: 1, padding: "14px 10px", borderRadius: 16, border: "none", cursor: "pointer", background: sel === i ? t.color : COLORS.lavanda, fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: 13, color: sel === i ? COLORS.text : COLORS.textLight, boxShadow: sel === i ? "0 4px 14px rgba(0,0,0,0.12)" : "none", transition: "all 0.2s" }}>
            ðŸ’³ {t.nombre}
          </button>
        ))}
      </div>

      <Card style={{ background: tarjeta.color + "55", border: `1.5px solid ${tarjeta.color}` }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>Total este mes</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: COLORS.text, fontFamily: "'Playfair Display', serif" }}>{formatMoney(totalFijos + totalCuotas)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>Fijos: {formatMoney(totalFijos)}</div>
            <div style={{ fontSize: 12, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>Cuotas: {formatMoney(totalCuotas)}</div>
          </div>
        </div>
      </Card>

      <div style={{ fontWeight: 800, fontSize: 14, color: COLORS.text, fontFamily: "'Playfair Display', serif", marginBottom: 10 }}>Gastos fijos recurrentes</div>
      {(tarjeta.fijos || []).map(f => (
        <Card key={f.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text, fontFamily: "'Nunito', sans-serif" }}>{f.descripcion}</div>
              <div style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>DÃ­a {f.dia} Â· Mensual</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: COLORS.lilaDeep, fontFamily: "'Playfair Display', serif" }}>{formatMoney(f.monto)}</div>
              <button onClick={() => eliminarFijo(f.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, opacity: 0.4 }}>ðŸ—‘</button>
            </div>
          </div>
        </Card>
      ))}
      {!showFijo ? (
        <Btn variant="secondary" small onClick={() => setShowFijo(true)} style={{ marginBottom: 14 }}>+ Gasto fijo</Btn>
      ) : (
        <Card style={{ background: COLORS.lavanda }}>
          <Inp label="DescripciÃ³n" value={formF.descripcion} onChange={e => setFormF(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Netflix" />
          <Inp label="Monto mensual ($)" type="number" value={formF.monto} onChange={e => setFormF(f => ({ ...f, monto: e.target.value }))} />
          <Inp label="DÃ­a de dÃ©bito" type="number" value={formF.dia} onChange={e => setFormF(f => ({ ...f, dia: e.target.value }))} placeholder="15" />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={addFijo} style={{ flex: 1, justifyContent: "center" }}>Guardar</Btn>
            <Btn variant="secondary" onClick={() => setShowFijo(false)} style={{ flex: 1, justifyContent: "center" }}>Cancelar</Btn>
          </div>
        </Card>
      )}

      <div style={{ fontWeight: 800, fontSize: 14, color: COLORS.text, fontFamily: "'Playfair Display', serif", marginBottom: 10 }}>Cuotas pendientes</div>
      {(tarjeta.cuotas || []).map(c => (
        <Card key={c.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text, fontFamily: "'Nunito', sans-serif" }}>{c.descripcion}</div>
              <div style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>
                Cuota {c.cuotasPagadas + 1}/{c.cuotasTotal} Â· Resta {formatMoney((c.cuotasTotal - c.cuotasPagadas) * c.montoCuota)}
              </div>
            </div>
            <div style={{ fontWeight: 900, fontSize: 15, color: COLORS.lilaDeep, fontFamily: "'Playfair Display', serif" }}>{formatMoney(c.montoCuota)}/mes</div>
          </div>
          <ProgressBar label="" value={c.cuotasPagadas} max={c.cuotasTotal} color={COLORS.lila} />
          <Btn variant="success" small onClick={() => pagarCuota(c.id)}>âœ“ Registrar p
