import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./Login";

// ??? COLORES ???????????????????????????????????????????????????????????????
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

// ??? UTILS ?????????????????????????????????????????????????????????????????
const formatMoney = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);

// ??? COMPONENTES BASE ??????????????????????????????????????????????????????
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

// ??? TAB: RESUMEN ??????????????????????????????????????????????????????????
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
        <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.text, fontFamily: "'Playfair Display', serif", marginBottom: 14 }}>Presupuesto por categoría</div>
        {CATEGORIAS.map((cat, i) => {
          const usado = gastosPorCat[cat] || 0;
          const max = (data.presupuestos || {})[cat] || 1;
          return <ProgressBar key={cat} label={cat} value={usado} max={max} color={catColors[i % catColors.length]} sublabel={usado === 0 ? "Sin gastos este mes" : undefined} />;
        })}
      </Card>
    </div>
  );
}

// ??? TAB: GASTOS ???????????????????????????????????????????????????????????
function TabGastos({ data, saveData }) {
  const [form, setForm] = useState({ descripcion: "", monto: "", categoria: "Comida", quien: "él", fecha: new Date().toISOString().split("T")[0] });
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
    setForm({ descripcion: "", monto: "", categoria: "Comida", quien: "él", fecha: new Date().toISOString().split("T")[0] });
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
            {t === "gastos" ? "[$] Gastos" : "[$$] Ingresos"}
          </button>
        ))}
      </div>
      {!showForm ? (
        <Btn onClick={() => setShowForm(true)} style={{ width: "100%", justifyContent: "center", marginBottom: 14 }}>+ Agregar {tab === "gastos" ? "gasto" : "ingreso"}</Btn>
      ) : (
        <Card style={{ background: COLORS.lavanda }}>
          <Inp label="Descripción" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Supermercado" />
          <Inp label="Monto ($)" type="number" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0" />
          {tab === "gastos" && (
            <Sel label="Categoría" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </Sel>
          )}
          <Sel label="¿Quién?" value={form.quien} onChange={e => setForm(f => ({ ...f, quien: e.target.value }))}>
            <option>él</option><option>ella</option>
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
                <Badge color={item.quien === "él" ? "#D4C5F0" : COLORS.rosa} textColor={item.quien === "él" ? COLORS.lilaDeep : "#B0003A"}>{item.quien}</Badge>
                <span style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>{item.fecha}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: tab === "gastos" ? COLORS.danger : COLORS.success, fontFamily: "'Playfair Display', serif" }}>
                {tab === "gastos" ? "-" : "+"}{formatMoney(item.monto)}
              </div>
              <button onClick={() => eliminar(item.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, opacity: 0.4 }}>[x]</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ??? TAB: TARJETAS ?????????????????????????????????????????????????????????
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
            [TC] {t.nombre}
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
              <div style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>Día {f.dia} - Mensual</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16, color: COLORS.lilaDeep, fontFamily: "'Playfair Display', serif" }}>{formatMoney(f.monto)}</div>
              <button onClick={() => eliminarFijo(f.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, opacity: 0.4 }}>[x]</button>
            </div>
          </div>
        </Card>
      ))}
      {!showFijo ? (
        <Btn variant="secondary" small onClick={() => setShowFijo(true)} style={{ marginBottom: 14 }}>+ Gasto fijo</Btn>
      ) : (
        <Card style={{ background: COLORS.lavanda }}>
          <Inp label="Descripción" value={formF.descripcion} onChange={e => setFormF(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Netflix" />
          <Inp label="Monto mensual ($)" type="number" value={formF.monto} onChange={e => setFormF(f => ({ ...f, monto: e.target.value }))} />
          <Inp label="Día de débito" type="number" value={formF.dia} onChange={e => setFormF(f => ({ ...f, dia: e.target.value }))} placeholder="15" />
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
                Cuota {c.cuotasPagadas + 1}/{c.cuotasTotal} - Resta {formatMoney((c.cuotasTotal - c.cuotasPagadas) * c.montoCuota)}
              </div>
            </div>
            <div style={{ fontWeight: 900, fontSize: 15, color: COLORS.lilaDeep, fontFamily: "'Playfair Display', serif" }}>{formatMoney(c.montoCuota)}/mes</div>
          </div>
          <ProgressBar label="" value={c.cuotasPagadas} max={c.cuotasTotal} color={COLORS.lila} />
          <Btn variant="success" small onClick={() => pagarCuota(c.id)}>OK Registrar pago</Btn>
        </Card>
      ))}
      {!showCuota ? (
        <Btn variant="secondary" small onClick={() => setShowCuota(true)}>+ Agregar cuota</Btn>
      ) : (
        <Card style={{ background: COLORS.lavanda }}>
          <Inp label="Descripción" value={formC.descripcion} onChange={e => setFormC(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Heladera" />
          <Inp label="Monto total ($)" type="number" value={formC.montoTotal} onChange={e => setFormC(f => ({ ...f, montoTotal: e.target.value }))} />
          <Inp label="Valor de cada cuota ($)" type="number" value={formC.montoCuota} onChange={e => setFormC(f => ({ ...f, montoCuota: e.target.value }))} />
          <Inp label="Cantidad de cuotas" type="number" value={formC.cuotasTotal} onChange={e => setFormC(f => ({ ...f, cuotasTotal: e.target.value }))} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={addCuota} style={{ flex: 1, justifyContent: "center" }}>Guardar</Btn>
            <Btn variant="secondary" onClick={() => setShowCuota(false)} style={{ flex: 1, justifyContent: "center" }}>Cancelar</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ??? TAB: MAYORISTA ????????????????????????????????????????????????????????
function TabMayorista({ data, saveData }) {
  const [showAddItem, setShowAddItem] = useState(false);
  const [showCerrar, setShowCerrar] = useState(false);
  const [showHistorial, setShowHistorial] = useState(false);
  const [formItem, setFormItem] = useState({ descripcion: "", cantidadLista: "1", precio: "" });
  const [sugerencias, setSugerencias] = useState([]);

  const mayorista = data.mayorista || { listaActiva: { id: 1, nombre: "Lista", fecha: new Date().toISOString().split("T")[0], cerrada: false, items: [] }, historial: [] };
  const lista = mayorista.listaActiva;

  const catalogoPrecios = {};
  (mayorista.historial || []).forEach(compra => {
    compra.items.forEach(item => {
      const key = item.descripcion.toLowerCase().trim();
      catalogoPrecios[key] = { descripcion: item.descripcion, precio: item.precio };
    });
  });
  const todosLosItems = Object.values(catalogoPrecios);

  const totalChanguito = (lista.items || []).filter(i => i.enChanguito).reduce((s, i) => s + i.cantidadComprada * i.precio, 0);
  const totalLista = (lista.items || []).reduce((s, i) => s + i.cantidadLista * i.precio, 0);
  const itemsSin = (lista.items || []).filter(i => !i.enChanguito);
  const itemsCon = (lista.items || []).filter(i => i.enChanguito);

  const inputSmall = { width: 56, padding: "6px 6px", borderRadius: 10, border: `1.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 13, fontFamily: "'Nunito', sans-serif", textAlign: "center" };

  const updateItem = (itemId, field, value) => {
    const nuevaLista = { ...lista, items: (lista.items || []).map(i => i.id === itemId ? { ...i, [field]: value } : i) };
    saveData({ mayorista: { ...mayorista, listaActiva: nuevaLista } });
  };

  const toggleChanguito = (itemId) => {
    const nuevaLista = {
      ...lista,
      items: (lista.items || []).map(i => i.id === itemId
        ? { ...i, enChanguito: !i.enChanguito, cantidadComprada: !i.enChanguito ? i.cantidadLista : 0 }
        : i)
    };
    saveData({ mayorista: { ...mayorista, listaActiva: nuevaLista } });
  };

  const handleDesc = (val) => {
    setFormItem(f => ({ ...f, descripcion: val }));
    if (val.length >= 2) {
      const q = val.toLowerCase();
      setSugerencias(todosLosItems.filter(i => i.descripcion.toLowerCase().includes(q)).slice(0, 5));
    } else setSugerencias([]);
  };

  const selSugerencia = (item) => {
    setFormItem(f => ({ ...f, descripcion: item.descripcion, precio: String(item.precio) }));
    setSugerencias([]);
  };

  const addItem = () => {
    if (!formItem.descripcion) return;
    const nuevo = { id: Date.now(), descripcion: formItem.descripcion, cantidadLista: parseInt(formItem.cantidadLista) || 1, cantidadComprada: 0, precio: parseFloat(formItem.precio) || 0, enChanguito: false };
    const nuevaLista = { ...lista, items: [...(lista.items || []), nuevo] };
    saveData({ mayorista: { ...mayorista, listaActiva: nuevaLista } });
    setFormItem({ descripcion: "", cantidadLista: "1", precio: "" });
    setSugerencias([]);
    setShowAddItem(false);
  };

  const cerrarCompra = () => {
    const hoy = new Date().toISOString().split("T")[0];
    const listaArchivada = {
      id: Date.now(), nombre: lista.nombre, fecha: lista.fecha, totalGastado: totalChanguito,
      items: (lista.items || []).filter(i => i.enChanguito).map(i => ({ descripcion: i.descripcion, cantidadComprada: i.cantidadComprada, precio: i.precio })),
    };
    const nuevoGasto = { id: Date.now() + 1, descripcion: `Mayorista - ${lista.nombre}`, monto: totalChanguito, categoria: "Comida", fecha: hoy, quien: "él" };
    const proxMes = new Date();
    proxMes.setMonth(proxMes.getMonth() + 1);
    const nombreProxima = proxMes.toLocaleString("es-AR", { month: "long", year: "numeric" });
    const nuevaLista = { id: Date.now() + 2, nombre: nombreProxima.charAt(0).toUpperCase() + nombreProxima.slice(1), fecha: hoy, cerrada: false, items: [] };
    saveData({
      gastos: [nuevoGasto, ...(data.gastos || [])],
      mayorista: { listaActiva: nuevaLista, historial: [listaArchivada, ...(mayorista.historial || [])] },
    });
    setShowCerrar(false);
  };

  return (
    <div>
      <Card style={{ background: COLORS.mint + "88", border: `1.5px solid ${COLORS.mint}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>{lista.nombre}</div>
            <div style={{ fontSize: 12, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>En el changuito [MK]</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.text, fontFamily: "'Playfair Display', serif" }}>{formatMoney(totalChanguito)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>Total lista</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textLight, fontFamily: "'Playfair Display', serif" }}>{formatMoney(totalLista)}</div>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <ProgressBar label="" value={itemsCon.length} max={Math.max((lista.items || []).length, 1)} color={COLORS.success} />
          <div style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>{itemsCon.length} de {(lista.items || []).length} ítems</div>
        </div>
      </Card>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <Btn onClick={() => { setShowAddItem(v => !v); setSugerencias([]); }} style={{ flex: 1, justifyContent: "center" }}>
          {showAddItem ? "? Cancelar" : "+ Agregar ítem"}
        </Btn>
        <Btn variant="secondary" small onClick={() => setShowHistorial(v => !v)}>[H]</Btn>
        {(lista.items || []).length > 0 && (
          <Btn variant="success" small onClick={() => setShowCerrar(true)}>OK Cerrar</Btn>
        )}
      </div>

      {showAddItem && (
        <Card style={{ background: COLORS.lavanda, position: "relative", zIndex: 5 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.textLight, marginBottom: 4, fontFamily: "'Nunito', sans-serif" }}>Producto</label>
            <input value={formItem.descripcion} onChange={e => handleDesc(e.target.value)} placeholder="Ej: Arroz x 5kg" autoComplete="off"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: "#fff", color: COLORS.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", outline: "none", boxSizing: "border-box" }} />
            {sugerencias.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 12, border: `1.5px solid ${COLORS.lila}`, marginTop: 4, overflow: "hidden", boxShadow: "0 4px 18px rgba(156,114,207,0.18)" }}>
                {sugerencias.map((s, i) => (
                  <button key={i} onClick={() => selSugerencia(s)} style={{ width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: i < sugerencias.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                    <span style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Nunito', sans-serif", fontWeight: 600 }}>{s.descripcion}</span>
                    <span style={{ fontSize: 12, color: COLORS.lilaDeep, fontFamily: "'Nunito', sans-serif", fontWeight: 700, background: COLORS.lilaLight, padding: "2px 8px", borderRadius: 8 }}>último: {formatMoney(s.precio)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Inp label="Cantidad" type="number" value={formItem.cantidadLista} onChange={e => setFormItem(f => ({ ...f, cantidadLista: e.target.value }))} />
            <Inp label="$ unitario" type="number" value={formItem.precio} onChange={e => setFormItem(f => ({ ...f, precio: e.target.value }))} placeholder="0" />
          </div>
          <Btn onClick={addItem} style={{ width: "100%", justifyContent: "center" }}>Agregar a la lista</Btn>
        </Card>
      )}

      {showCerrar && (
        <Card style={{ background: COLORS.mint + "55", border: `2px solid ${COLORS.success}` }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.text, fontFamily: "'Playfair Display', serif", marginBottom: 8 }}>¿Cerrar la compra?</div>
          <div style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Nunito', sans-serif", marginBottom: 4 }}>OK Registrar <strong>{formatMoney(totalChanguito)}</strong> como gasto en Comida</div>
          <div style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Nunito', sans-serif", marginBottom: 4 }}>[Arch] Archivar lista en historial</div>
          <div style={{ fontSize: 13, color: COLORS.text, fontFamily: "'Nunito', sans-serif", marginBottom: 14 }}>[Nuevo] Abrir lista nueva</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="success" onClick={cerrarCompra} style={{ flex: 1, justifyContent: "center" }}>Confirmar</Btn>
            <Btn variant="secondary" onClick={() => setShowCerrar(false)} style={{ flex: 1, justifyContent: "center" }}>Cancelar</Btn>
          </div>
        </Card>
      )}

      {itemsSin.length > 0 && (
        <>
          <div style={{ fontWeight: 800, fontSize: 13, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif", marginBottom: 6 }}>[H] Por buscar</div>
          <div style={{ display: "flex", gap: 8, padding: "0 4px", marginBottom: 4 }}>
            <div style={{ width: 28 }} /><div style={{ flex: 1 }} />
            <div style={{ width: 56, fontSize: 10, fontWeight: 700, color: COLORS.textLight, textAlign: "center", fontFamily: "'Nunito', sans-serif" }}>Llevar</div>
            <div style={{ width: 56, fontSize: 10, fontWeight: 700, color: COLORS.textLight, textAlign: "center", fontFamily: "'Nunito', sans-serif" }}>Comprado</div>
            <div style={{ width: 72, fontSize: 10, fontWeight: 700, color: COLORS.textLight, textAlign: "center", fontFamily: "'Nunito', sans-serif" }}>$ unitario</div>
          </div>
          {itemsSin.map(item => (
            <Card key={item.id} style={{ padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => toggleChanguito(item.id)} style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${COLORS.lila}`, background: "transparent", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.text, fontFamily: "'Nunito', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.descripcion}</div>
                  {item.precio > 0 && <div style={{ fontSize: 11, color: COLORS.textLight }}>Subtotal: {formatMoney(item.cantidadLista * item.precio)}</div>}
                </div>
                <input type="number" value={item.cantidadLista} onChange={e => updateItem(item.id, "cantidadLista", parseInt(e.target.value) || 1)} style={inputSmall} />
                <input type="number" value={item.cantidadComprada || ""} onChange={e => updateItem(item.id, "cantidadComprada", parseInt(e.target.value) || 0)} placeholder="0" style={{ ...inputSmall, background: COLORS.lilaLight }} />
                <input type="number" value={item.precio || ""} onChange={e => updateItem(item.id, "precio", parseFloat(e.target.value) || 0)} placeholder="$" style={{ ...inputSmall, width: 72 }} />
              </div>
            </Card>
          ))}
        </>
      )}

      {itemsCon.length > 0 && (
        <>
          <div style={{ fontWeight: 800, fontSize: 13, color: COLORS.success, fontFamily: "'Nunito', sans-serif", marginBottom: 6, marginTop: 8 }}>OK En el changuito</div>
          {itemsCon.map(item => (
            <Card key={item.id} style={{ padding: "10px 12px", opacity: 0.8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => toggleChanguito(item.id)} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: COLORS.success, cursor: "pointer", flexShrink: 0, color: "#fff", fontSize: 14 }}>OK</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.textLight, textDecoration: "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "'Nunito', sans-serif" }}>{item.descripcion}</div>
                  <div style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>x{item.cantidadComprada} - {formatMoney(item.cantidadComprada * item.precio)}</div>
                </div>
                <input type="number" value={item.cantidadComprada} onChange={e => updateItem(item.id, "cantidadComprada", parseInt(e.target.value) || 0)} style={{ ...inputSmall, background: COLORS.mint }} />
              </div>
            </Card>
          ))}
        </>
      )}

      {(lista.items || []).length === 0 && !showAddItem && (
        <div style={{ textAlign: "center", padding: "40px 0", color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>[MK]</div>
          <div style={{ fontWeight: 700 }}>Lista vacía</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Agregá los ítems para la próxima compra</div>
        </div>
      )}

      {showHistorial && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.text, fontFamily: "'Playfair Display', serif", marginBottom: 10 }}>[Arch] Compras anteriores</div>
          {(mayorista.historial || []).length === 0 && (
            <div style={{ textAlign: "center", color: COLORS.textLight, fontFamily: "'Nunito', sans-serif", padding: "20px 0" }}>Sin historial todavía</div>
          )}
          {(mayorista.historial || []).map(compra => (
            <Card key={compra.id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: COLORS.text, fontFamily: "'Nunito', sans-serif" }}>{compra.nombre}</div>
                  <div style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>{compra.fecha} - {compra.items.length} ítems</div>
                </div>
                <div style={{ fontWeight: 900, fontSize: 16, color: COLORS.lilaDeep, fontFamily: "'Playfair Display', serif" }}>{formatMoney(compra.totalGastado)}</div>
              </div>
              {compra.items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: i < compra.items.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                  <span style={{ fontSize: 12, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>{item.descripcion} x{item.cantidadComprada}</span>
                  <span style={{ fontSize: 12, color: COLORS.text, fontFamily: "'Nunito', sans-serif", fontWeight: 600 }}>{formatMoney(item.precio)} c/u</span>
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ??? TAB: AHORROS ??????????????????????????????????????????????????????????
function TabAhorros({ data, saveData }) {
  const [showAddMeta, setShowAddMeta] = useState(false);
  const [showMov, setShowMov] = useState(null);
  const [formMeta, setFormMeta] = useState({ nombre: "", objetivo: "", icono: "*" });
  const [formMov, setFormMov] = useState({ descripcion: "", monto: "", tipo: "ingreso" });

  const ahorros = data.ahorros || { metas: [], movimientos: [] };
  const totalAhorrado = (ahorros.metas || []).reduce((s, m) => s + m.acumulado, 0);
  const totalObjetivo = (ahorros.metas || []).reduce((s, m) => s + m.objetivo, 0);
  const metaColors = ["#B8D8E8", COLORS.mint, "#F5D78A", COLORS.lila, COLORS.rosa, COLORS.peach];

  const addMeta = () => {
    if (!formMeta.nombre || !formMeta.objetivo) return;
    const nuevo = { id: Date.now(), nombre: formMeta.nombre, objetivo: parseFloat(formMeta.objetivo), acumulado: 0, color: metaColors[(ahorros.metas || []).length % metaColors.length], icono: formMeta.icono };
    saveData({ ahorros: { ...ahorros, metas: [...(ahorros.metas || []), nuevo] } });
    setFormMeta({ nombre: "", objetivo: "", icono: "*" });
    setShowAddMeta(false);
  };

  const addMov = (metaId) => {
    if (!formMov.descripcion || !formMov.monto) return;
    const delta = formMov.tipo === "ingreso" ? parseFloat(formMov.monto) : -parseFloat(formMov.monto);
    const mov = { id: Date.now(), metaId, descripcion: formMov.descripcion, monto: parseFloat(formMov.monto), fecha: new Date().toISOString().split("T")[0], tipo: formMov.tipo };
    saveData({
      ahorros: {
        metas: (ahorros.metas || []).map(m => m.id === metaId ? { ...m, acumulado: Math.max(0, m.acumulado + delta) } : m),
        movimientos: [mov, ...(ahorros.movimientos || [])],
      }
    });
    setFormMov({ descripcion: "", monto: "", tipo: "ingreso" });
    setShowMov(null);
  };

  return (
    <div>
      <Card style={{ background: `linear-gradient(135deg, ${COLORS.lavanda}, ${COLORS.mint + "88"})`, border: `1.5px solid ${COLORS.lila}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>Total ahorrado [$$]</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: COLORS.text, fontFamily: "'Playfair Display', serif" }}>{formatMoney(totalAhorrado)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>Objetivo total</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.textLight, fontFamily: "'Playfair Display', serif" }}>{formatMoney(totalObjetivo)}</div>
          </div>
        </div>
        {totalObjetivo > 0 && (
          <div style={{ marginTop: 10 }}>
            <ProgressBar label="" value={totalAhorrado} max={totalObjetivo} color={COLORS.lilaDeep} />
            <div style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>{Math.round((totalAhorrado / totalObjetivo) * 100)}% del total</div>
          </div>
        )}
      </Card>

      {!showAddMeta ? (
        <Btn onClick={() => setShowAddMeta(true)} style={{ width: "100%", justifyContent: "center", marginBottom: 14 }}>+ Nueva meta</Btn>
      ) : (
        <Card style={{ background: COLORS.lavanda }}>
          <div style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: 10 }}>
            <Inp label="Ícono" value={formMeta.icono} onChange={e => setFormMeta(f => ({ ...f, icono: e.target.value }))} />
            <Inp label="Nombre" value={formMeta.nombre} onChange={e => setFormMeta(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej: Vacaciones" />
          </div>
          <Inp label="Objetivo ($)" type="number" value={formMeta.objetivo} onChange={e => setFormMeta(f => ({ ...f, objetivo: e.target.value }))} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={addMeta} style={{ flex: 1, justifyContent: "center" }}>Crear</Btn>
            <Btn variant="secondary" onClick={() => setShowAddMeta(false)} style={{ flex: 1, justifyContent: "center" }}>Cancelar</Btn>
          </div>
        </Card>
      )}

      {(ahorros.metas || []).map(meta => {
        const movs = (ahorros.movimientos || []).filter(m => m.metaId === meta.id).slice(0, 3);
        const pct = Math.min(Math.round((meta.acumulado / Math.max(meta.objetivo, 1)) * 100), 100);
        return (
          <Card key={meta.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: meta.color + "88", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{meta.icono}</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.text, fontFamily: "'Playfair Display', serif" }}>{meta.nombre}</div>
                  <div style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>
                    {pct >= 100 ? "!! ¡Meta alcanzada!" : `Falta ${formatMoney(meta.objetivo - meta.acumulado)}`}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 900, fontSize: 16, color: COLORS.lilaDeep, fontFamily: "'Playfair Display', serif" }}>{formatMoney(meta.acumulado)}</div>
                <div style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>de {formatMoney(meta.objetivo)}</div>
              </div>
            </div>
            <ProgressBar label="" value={meta.acumulado} max={meta.objetivo} color={COLORS.lilaDeep} />
            {movs.map(m => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: `1px solid ${COLORS.border}` }}>
                <span style={{ fontSize: 12, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>{m.descripcion} - {m.fecha}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: m.tipo === "ingreso" ? COLORS.success : COLORS.danger, fontFamily: "'Nunito', sans-serif" }}>{m.tipo === "ingreso" ? "+" : "-"}{formatMoney(m.monto)}</span>
              </div>
            ))}
            {showMov === meta.id ? (
              <div style={{ background: COLORS.lavanda, borderRadius: 12, padding: 12, marginTop: 10 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {["ingreso", "retiro"].map(t => (
                    <button key={t} onClick={() => setFormMov(f => ({ ...f, tipo: t }))} style={{ flex: 1, padding: "7px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 12, background: formMov.tipo === t ? (t === "ingreso" ? COLORS.mint : COLORS.rosa) : "#fff", color: formMov.tipo === t ? (t === "ingreso" ? "#1A6B4A" : "#B0003A") : COLORS.textLight }}>
                      {t === "ingreso" ? "+ Depositar" : "- Retirar"}
                    </button>
                  ))}
                </div>
                <Inp label="Descripción" value={formMov.descripcion} onChange={e => setFormMov(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej: Ahorro del mes" />
                <Inp label="Monto ($)" type="number" value={formMov.monto} onChange={e => setFormMov(f => ({ ...f, monto: e.target.value }))} />
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={() => addMov(meta.id)} style={{ flex: 1, justifyContent: "center" }}>Guardar</Btn>
                  <Btn variant="secondary" onClick={() => setShowMov(null)} style={{ flex: 1, justifyContent: "center" }}>Cancelar</Btn>
                </div>
              </div>
            ) : (
              <Btn variant="secondary" small onClick={() => { setShowMov(meta.id); setFormMov({ descripcion: "", monto: "", tipo: "ingreso" }); }} style={{ marginTop: 8 }}>+ Movimiento</Btn>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ??? TAB: HISTORIAL ????????????????????????????????????????????????????????
function TabHistorial({ data }) {
  const [filtroQuien, setFiltroQuien] = useState("todos");
  const [filtroCat, setFiltroCat] = useState("todas");
  const todos = [...(data.gastos || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const filtrados = todos.filter(g => (filtroQuien === "todos" || g.quien === filtroQuien) && (filtroCat === "todas" || g.categoria === filtroCat));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["todos", "él", "ella"].map(q => (
          <button key={q} onClick={() => setFiltroQuien(q)} style={{ flex: 1, padding: "8px 6px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 13, background: filtroQuien === q ? COLORS.lilaDeep : COLORS.lavanda, color: filtroQuien === q ? "#fff" : COLORS.lilaDeep }}>
            {q}
          </button>
        ))}
      </div>
      <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 12, border: `1.5px solid ${COLORS.border}`, background: COLORS.bg, color: COLORS.text, fontSize: 14, fontFamily: "'Nunito', sans-serif", marginBottom: 14 }}>
        <option value="todas">Todas las categorías</option>
        {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
      </select>
      {filtrados.map(g => (
        <Card key={g.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.text, fontFamily: "'Nunito', sans-serif" }}>{g.descripcion}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                <Badge>{g.categoria}</Badge>
                <Badge color={g.quien === "él" ? "#D4C5F0" : COLORS.rosa} textColor={g.quien === "él" ? COLORS.lilaDeep : "#B0003A"}>{g.quien}</Badge>
                <span style={{ fontSize: 11, color: COLORS.textLight, fontFamily: "'Nunito', sans-serif" }}>{g.fecha}</span>
              </div>
            </div>
            <div style={{ fontWeight: 900, fontSize: 15, color: COLORS.danger, fontFamily: "'Playfair Display', serif" }}>-{formatMoney(g.monto)}</div>
          </div>
        </Card>
      ))}
      {filtrados.length === 0 && (
        <div style={{ textAlign: "center", color: COLORS.textLight, fontFamily: "'Nunito', sans-serif", padding: "40px 0" }}>Sin gastos con ese filtro</div>
      )}
    </div>
  );
}

// ??? APP PRINCIPAL ?????????????????????????????????????????????????????????
const TABS = [
  { id: "resumen", label: "Resumen", icon: "[=]" },
  { id: "gastos", label: "Gastos", icon: "[$]" },
  { id: "tarjetas", label: "Tarjetas", icon: "[TC]" },
  { id: "ahorros", label: "Ahorros", icon: "[$$]" },
  { id: "mayorista", label: "Mayorista", icon: "[MK]" },
  { id: "historial", label: "Historial", icon: "[H]" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [activeTab, setActiveTab] = useState("resumen");

  // Auth listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // Online/offline listener
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // Firestore real-time listener - un único documento por familia
  useEffect(() => {
    if (!user) return;
    const docRef = doc(db, "familias", "principal");
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setData(snap.data());
      } else {
        // Primera vez: inicializar datos
        setDoc(docRef, DATA_INICIAL);
        setData(DATA_INICIAL);
      }
    });
    return unsub;
  }, [user]);

  // Función para guardar cambios - merge parcial
  const saveData = async (cambios) => {
    const docRef = doc(db, "familias", "principal");
    const nuevo = { ...data, ...cambios };
    setData(nuevo); // optimistic update
    await setDoc(docRef, nuevo);
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F3FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>[Casa]</div>
          <div style={{ color: "#9B72CF", fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>Cargando...</div>
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: "#F7F3FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>[Casa]</div>
          <div style={{ color: "#9B72CF", fontFamily: "'Nunito', sans-serif", fontWeight: 700 }}>Sincronizando datos...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(135deg, ${COLORS.lilaDeep} 0%, #B08FDB 100%)`, padding: "18px 18px 14px", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 600, fontFamily: "'Nunito', sans-serif" }}>Presupuesto</div>
            <div style={{ color: "#fff", fontSize: 20, fontWeight: 900, fontFamily: "'Playfair Display', serif" }}>Casa [Casa]</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "5px 12px", display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: online ? "#7DC9A8" : "#F5D78A" }} />
              <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "'Nunito', sans-serif" }}>{online ? "Sincronizado" : "Offline"}</span>
            </div>
            <button onClick={() => signOut(auth)} style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, padding: "5px 10px", color: "rgba(255,255,255,0.8)", cursor: "pointer", fontSize: 13 }}>[Salir]</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, marginTop: 14, overflowX: "auto", paddingBottom: 2 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: 12, background: activeTab === tab.id ? "#fff" : "rgba(255,255,255,0.18)", color: activeTab === tab.id ? COLORS.lilaDeep : "rgba(255,255,255,0.85)", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 4 }}>
              <span>{tab.icon}</span><span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ padding: "16px 14px 100px", maxWidth: 480, margin: "0 auto" }}>
        {activeTab === "resumen"   && <TabResumen    data={data} />}
        {activeTab === "gastos"    && <TabGastos     data={data} saveData={saveData} />}
        {activeTab === "tarjetas"  && <TabTarjetas   data={data} saveData={saveData} />}
        {activeTab === "ahorros"   && <TabAhorros    data={data} saveData={saveData} />}
        {activeTab === "mayorista" && <TabMayorista  data={data} saveData={saveData} />}
        {activeTab === "historial" && <TabHistorial  data={data} />}
      </div>
    </div>
  );
}
