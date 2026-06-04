import { useState, useEffect, useCallback, useRef } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./Login";

const COLORS = {
  bg:"#F7F3FF",card:"#FFFFFF",lila:"#C4A8E8",lilaLight:"#EAD9FF",
  lilaDeep:"#9B72CF",lavanda:"#E2D4F7",rosa:"#F5C6D8",mint:"#C8EFE3",
  peach:"#FFE0CC",text:"#3D2C5E",textLight:"#7B6A9A",border:"#E8DCFF",
  danger:"#E88FAA",success:"#7DC9A8",warning:"#F5D78A",
};
const CATS_DEFAULT=["Comida","Transporte","Salud","Educacion","Entretenimiento","Hogar","Ropa","Ahorros","Otros"];
const DATA_INICIAL={
  ingresos:[],gastos:[],
  presupuestos:{Comida:120000,Transporte:60000,Salud:40000,Educacion:30000,Entretenimiento:25000,Hogar:80000,Ropa:20000,Ahorros:0,Otros:30000},
  porcentajes:{},
  categorias:CATS_DEFAULT,
  tarjetas:[
    {id:1,nombre:"Tarjeta 1",color:"#C4A8E8",diaCierre:20,diaVencimiento:10,fijos:[],cuotas:[],historialPagos:[]},
    {id:2,nombre:"Tarjeta 2",color:"#F5C6D8",diaCierre:20,diaVencimiento:10,fijos:[],cuotas:[],historialPagos:[]},
  ],
  mayorista:{listaActiva:{id:1,nombre:"Lista",fecha:new Date().toISOString().split("T")[0],cerrada:false,items:[]},historial:[]},
  ahorros:{metas:[],movimientos:[]},
  auto:{descripcion:"",deudaTotal:0,deudaRestante:0,pagos:[]},
  tipoCambio:{blue:0,tarjeta:0,oficial:0,ultimaActualizacion:""},
  mesFinanciero:{inicio:"",fin:"",mes:"",anio:"",feriados:[],feriadosAnio:0,correccionManual:""},
};

const fmt=(n)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n||0);
const fmtUSD=(n)=>"USD "+new Intl.NumberFormat("es-AR",{maximumFractionDigits:0}).format(n||0);
const fmtFecha=(iso)=>{if(!iso)return"";const[y,m,d]=iso.split("-");return`${d}/${m}/${y}`;};

// ---- LOGICA MES FINANCIERO ----
async function fetchFeriados(anio){
  try{
    const r=await fetch(`https://nolaborables.com.ar/api/v2/feriados/${anio}`);
    const data=await r.json();
    return data.map(f=>`${anio}-${String(f.mes).padStart(2,"0")}-${String(f.dia).padStart(2,"0")}`);
  }catch{return[];}
}

function esFeriado(iso,feriados){return feriados.includes(iso);}
function esFinDeSemana(d){const dia=d.getDay();return dia===0||dia===6;}

function ntoHabilDespuesDe(fecha,n,feriados){
  let d=new Date(fecha+"T12:00:00");
  let count=0;
  while(count<n){
    d.setDate(d.getDate()+1);
    const iso=d.toISOString().split("T")[0];
    if(!esFinDeSemana(d)&&!esFeriado(iso,feriados))count++;
  }
  return d.toISOString().split("T")[0];
}

function calcularMesFinanciero(anio,mes,feriados){
  const base1=`${anio}-${String(mes).padStart(2,"0")}-01`;
  const d1=new Date(base1);d1.setDate(d1.getDate()-1);
  const inicio=ntoHabilDespuesDe(d1.toISOString().split("T")[0],4,feriados);
  const mesS=mes===12?1:mes+1;
  const anioS=mes===12?anio+1:anio;
  const base2=`${anioS}-${String(mesS).padStart(2,"0")}-01`;
  const d2=new Date(base2);d2.setDate(d2.getDate()-1);
  const fin=ntoHabilDespuesDe(d2.toISOString().split("T")[0],4,feriados);
  const finReal=new Date(fin);finReal.setDate(finReal.getDate()-1);
  return{inicio,fin:finReal.toISOString().split("T")[0]};
}

function calcularProximosCobros(feriados){
  const hoy=new Date();
  hoy.setHours(0,0,0,0);
  const resultados=[];
  for(let offset=0;offset<=2;offset++){
    const mes=((hoy.getMonth()+offset)%12)+1;
    const anio=hoy.getFullYear()+Math.floor((hoy.getMonth()+offset)/12);
    const mesStr=String(mes).padStart(2,"0");
    // Ultimo dia del mes (dia 0 del mes siguiente)
    const ultimoDia=new Date(anio,mes,0).getDate();
    const ultimoDiaStr=`${anio}-${mesStr}-${String(ultimoDia).padStart(2,"0")}`;
    // 4to habil despues del ultimo dia del mes
    const cobro1=ntoHabilDespuesDe(ultimoDiaStr,4,feriados);
    // 4to habil despues del dia 15
    const cobro2=ntoHabilDespuesDe(`${anio}-${mesStr}-15`,4,feriados);
    [cobro1,cobro2].forEach(c=>{
      const dc=new Date(c+"T12:00:00");
      const diff=Math.round((dc-hoy)/(1000*60*60*24));
      if(diff>=-1&&diff<=60)resultados.push({fecha:c,dias:diff});
    });
  }
  return resultados.sort((a,b)=>a.dias-b.dias).slice(0,3);
}

// ---- COMPONENTES BASE ----
const ProgressBar=({value,max,color=COLORS.lila,label,sublabel})=>{
  const pct=Math.min((value/Math.max(max,1))*100,100);
  const isOver=value>max;
  return(
    <div style={{marginBottom:14}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontSize:13,fontWeight:600,color:COLORS.text,fontFamily:"'Nunito',sans-serif"}}>{label}</span>
        <span style={{fontSize:12,color:isOver?COLORS.danger:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{fmt(value)} / {fmt(max)}</span>
      </div>
      <div style={{height:10,borderRadius:99,background:COLORS.lavanda,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,borderRadius:99,background:isOver?COLORS.danger:color,transition:"width 0.6s"}}/>
      </div>
      {sublabel&&<span style={{fontSize:11,color:COLORS.textLight,marginTop:2,display:"block"}}>{sublabel}</span>}
    </div>
  );
};
const Card=({children,style={}})=><div style={{background:COLORS.card,borderRadius:18,padding:"16px 18px",boxShadow:"0 2px 16px rgba(156,114,207,0.10)",border:`1px solid ${COLORS.border}`,marginBottom:12,...style}}>{children}</div>;
const Badge=({children,color=COLORS.lilaLight,textColor=COLORS.lilaDeep})=><span style={{background:color,color:textColor,borderRadius:99,padding:"2px 10px",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>{children}</span>;
const Inp=({label,...props})=>(
  <div style={{marginBottom:12}}>
    {label&&<label style={{display:"block",fontSize:12,fontWeight:700,color:COLORS.textLight,marginBottom:4,fontFamily:"'Nunito',sans-serif"}}>{label}</label>}
    <input {...props} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${COLORS.border}`,background:COLORS.bg,color:COLORS.text,fontSize:14,fontFamily:"'Nunito',sans-serif",outline:"none",boxSizing:"border-box",...props.style}}/>
  </div>
);
const Sel=({label,children,...props})=>(
  <div style={{marginBottom:12}}>
    {label&&<label style={{display:"block",fontSize:12,fontWeight:700,color:COLORS.textLight,marginBottom:4,fontFamily:"'Nunito',sans-serif"}}>{label}</label>}
    <select {...props} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${COLORS.border}`,background:COLORS.bg,color:COLORS.text,fontSize:14,fontFamily:"'Nunito',sans-serif",outline:"none",boxSizing:"border-box"}}>{children}</select>
  </div>
);
const Btn=({children,onClick,variant="primary",small=false,style={}})=>{
  const v={primary:{bg:COLORS.lilaDeep,c:"#fff"},secondary:{bg:COLORS.lavanda,c:COLORS.lilaDeep},danger:{bg:COLORS.rosa,c:"#B0003A"},success:{bg:COLORS.mint,c:"#1A6B4A"}}[variant];
  return<button onClick={onClick} style={{borderRadius:12,border:"none",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:700,display:"inline-flex",alignItems:"center",gap:6,background:v.bg,color:v.c,padding:small?"7px 14px":"11px 20px",fontSize:small?13:15,...style}}>{children}</button>;
};
const T=({children})=><div style={{fontWeight:800,fontSize:15,color:COLORS.text,fontFamily:"'Playfair Display',serif",marginBottom:10,marginTop:4}}>{children}</div>;

// ---- DOLAR BADGE ----
function DolarBadge({tipoCambio}){
  if(!tipoCambio?.blue&&!tipoCambio?.bbva)return null;
  return(
    <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
      {[["Blue","blue","#F5D78A","#5a3a00"],["BBVA","bbva","#D4C5F0",COLORS.lilaDeep],["Tarjeta","tarjeta",COLORS.lilaLight,COLORS.lilaDeep],["Oficial","oficial",COLORS.mint,"#1A6B4A"]].map(([l,k,bg,c])=>
        tipoCambio[k]>0&&<div key={k} style={{background:bg,borderRadius:10,padding:"6px 12px",fontSize:12,fontFamily:"'Nunito',sans-serif",fontWeight:700,color:c}}>
          USD {l}: {fmt(tipoCambio[k])}
        </div>
      )}
      {tipoCambio.ultimaActualizacion&&<div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",alignSelf:"center"}}>Act: {tipoCambio.ultimaActualizacion}</div>}
    </div>
  );
}

// ---- TAB RESUMEN ----
function TabResumen({data}){
  const cats=data.categorias||CATS_DEFAULT;
  const pres=data.presupuestos||{};
  const porc=data.porcentajes||{};
  const mf=data.mesFinanciero||{};
  const ti=(data.ingresos||[]).reduce((s,i)=>s+i.monto,0);
  const tg=(data.gastos||[]).reduce((s,g)=>s+g.monto,0);
  const bal=ti-tg;
  const gpc={};cats.forEach(c=>{gpc[c]=0;});(data.gastos||[]).forEach(g=>{gpc[g.categoria]=(gpc[g.categoria]||0)+g.monto;});
  const cc=[COLORS.lila,COLORS.rosa,COLORS.mint,COLORS.peach,"#B8D8E8","#F5D78A","#D4C5F0","#C8EFD4","#E8C4D0"];
  const feriados=mf.feriados||[];
  const cobros=calcularProximosCobros(feriados);
  const proximoCobro=cobros.length>0?cobros[0]:null;

  const getLimite=(cat)=>{
    if(porc[cat]>0)return Math.round(ti*(porc[cat]/100));
    return pres[cat]||0;
  };

  return(
    <div>
      {mf.inicio&&(
        <Card style={{background:COLORS.lavanda,border:`1.5px solid ${COLORS.lila}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:proximoCobro?10:0}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Mes financiero actual</div>
              <div style={{fontSize:15,fontWeight:800,color:COLORS.text,fontFamily:"'Playfair Display',serif"}}>{fmtFecha(mf.inicio)} al {fmtFecha(mf.fin)}</div>
            </div>
          </div>
          {proximoCobro&&(
            <div style={{background:"rgba(255,255,255,0.6)",borderRadius:12,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Proximo cobro</div>
                <div style={{fontSize:16,fontWeight:900,color:COLORS.text,fontFamily:"'Playfair Display',serif"}}>{fmtFecha(proximoCobro.fecha)}</div>
              </div>
              <Badge color={proximoCobro.dias<=0?COLORS.mint:proximoCobro.dias<=3?COLORS.warning:COLORS.lilaLight} textColor={proximoCobro.dias<=0?"#1A6B4A":proximoCobro.dias<=3?"#5a3a00":COLORS.lilaDeep}>
                {proximoCobro.dias<=0?"Hoy":proximoCobro.dias===1?"Maniana":`En ${proximoCobro.dias} dias`}
              </Badge>
            </div>
          )}
        </Card>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
        {[{l:"Ingresos",v:ti,bg:COLORS.mint,c:"#1A6B4A"},{l:"Gastos",v:tg,bg:COLORS.rosa,c:"#B0003A"},{l:"Balance",v:bal,bg:bal>=0?COLORS.lavanda:COLORS.rosa,c:bal>=0?COLORS.lilaDeep:"#B0003A"}].map(({l,v,bg,c})=>(
          <div key={l} style={{background:bg,borderRadius:16,padding:"14px 8px",textAlign:"center"}}>
            <div style={{fontSize:11,color:c,fontWeight:700,fontFamily:"'Nunito',sans-serif",opacity:0.8}}>{l}</div>
            <div style={{fontSize:13,fontWeight:900,color:c,fontFamily:"'Playfair Display',serif",marginTop:4}}>{fmt(v)}</div>
          </div>
        ))}
      </div>
      <Card>
        <T>Presupuesto por categoria</T>
        {cats.map((cat,i)=>{
          const lim=getLimite(cat);
          const etiqueta=porc[cat]>0?`${cat} (${porc[cat]}% ingresos)`:cat;
          return<ProgressBar key={cat} label={etiqueta} value={gpc[cat]||0} max={lim||1} color={cc[i%cc.length]} sublabel={(gpc[cat]||0)===0?"Sin gastos":undefined}/>;
        })}
      </Card>
      <DolarBadge tipoCambio={data.tipoCambio}/>
    </div>
  );
}

// ---- TAB GASTOS ----
function TabGastos({data,saveData}){
  const cats=data.categorias||CATS_DEFAULT;
  const feriados=data.mesFinanciero?.feriados||[];
  const [form,setForm]=useState({descripcion:"",monto:"",categoria:cats[0]||"Comida",quien:"el",fecha:new Date().toISOString().split("T")[0],nota:""});
  const [showForm,setShowForm]=useState(false);
  const [editId,setEditId]=useState(null);
  const [tab,setTab]=useState("gastos");
  const cobros=calcularProximosCobros(feriados);

  const save=()=>{
    if(!form.descripcion||!form.monto)return;
    const item={id:editId||Date.now(),...form,monto:parseFloat(form.monto)};
    const k=tab==="gastos"?"gastos":"ingresos";
    const list=data[k]||[];
    saveData({[k]:editId?list.map(x=>x.id===editId?item:x):[item,...list]});
    setForm({descripcion:"",monto:"",categoria:cats[0]||"Comida",quien:"el",fecha:new Date().toISOString().split("T")[0],nota:""});
    setShowForm(false);setEditId(null);
  };
  const edit=(item)=>{setForm({descripcion:item.descripcion,monto:String(item.monto),categoria:item.categoria||cats[0],quien:item.quien,fecha:item.fecha,nota:item.nota||""});setEditId(item.id);setShowForm(true);};
  const del=(id)=>{const k=tab==="gastos"?"gastos":"ingresos";saveData({[k]:(data[k]||[]).filter(x=>x.id!==id)});};
  const list=tab==="gastos"?(data.gastos||[]):(data.ingresos||[]);

  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        {["gastos","ingresos"].map(t=><button key={t} onClick={()=>{setTab(t);setShowForm(false);setEditId(null);}} style={{flex:1,padding:"10px",borderRadius:12,border:"none",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:14,background:tab===t?COLORS.lilaDeep:COLORS.lavanda,color:tab===t?"#fff":COLORS.lilaDeep}}>{t==="gastos"?"Gastos":"Ingresos"}</button>)}
      </div>

      {tab==="ingresos"&&cobros.length>0&&(
        <Card style={{background:COLORS.lavanda,border:`1.5px solid ${COLORS.lila}`}}>
          <T>Proximas fechas de cobro</T>
          {cobros.map((c,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<cobros.length-1?`1px solid ${COLORS.border}`:"none"}}>
              <div style={{fontSize:14,fontWeight:700,color:COLORS.text,fontFamily:"'Nunito',sans-serif"}}>{fmtFecha(c.fecha)}</div>
              <Badge color={c.dias<=0?COLORS.mint:c.dias<=3?COLORS.warning:COLORS.lilaLight} textColor={c.dias<=0?"#1A6B4A":c.dias<=3?"#5a3a00":COLORS.lilaDeep}>
                {c.dias<=0?"Hoy":c.dias===1?"Maniana":`En ${c.dias} dias`}
              </Badge>
            </div>
          ))}
        </Card>
      )}

      {!showForm?(
        <Btn onClick={()=>{setShowForm(true);setEditId(null);setForm({descripcion:"",monto:"",categoria:cats[0]||"Comida",quien:"el",fecha:new Date().toISOString().split("T")[0],nota:"",});}} style={{width:"100%",justifyContent:"center",marginBottom:14}}>+ Agregar {tab==="gastos"?"gasto":"ingreso"}</Btn>
      ):(
        <Card style={{background:COLORS.lavanda}}>
          <div style={{fontWeight:700,fontSize:14,color:COLORS.lilaDeep,marginBottom:10,fontFamily:"'Nunito',sans-serif"}}>{editId?"Editar":"Nuevo"} {tab==="gastos"?"gasto":"ingreso"}</div>
          <Inp label="Descripcion" value={form.descripcion} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Supermercado"/>
          <Inp label="Monto ($)" type="number" value={form.monto} onChange={e=>setForm(f=>({...f,monto:e.target.value}))}/>
          {tab==="gastos"&&<Sel label="Categoria" value={form.categoria} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))}>{cats.map(c=><option key={c}>{c}</option>)}</Sel>}
          <Sel label="Quien?" value={form.quien} onChange={e=>setForm(f=>({...f,quien:e.target.value}))}><option value="el">el</option><option value="ella">ella</option></Sel>
          <Inp label="Fecha" type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))}/>
          <Inp label="Nota (opcional)" value={form.nota} onChange={e=>setForm(f=>({...f,nota:e.target.value}))} placeholder="Ej: YPF autopista"/>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={save} style={{flex:1,justifyContent:"center"}}>Guardar</Btn>
            <Btn variant="secondary" onClick={()=>{setShowForm(false);setEditId(null);}} style={{flex:1,justifyContent:"center"}}>Cancelar</Btn>
          </div>
        </Card>
      )}
      {list.map(item=>(
        <Card key={item.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15,color:COLORS.text,fontFamily:"'Nunito',sans-serif"}}>{item.descripcion}</div>
              {item.nota&&<div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginTop:2,fontStyle:"italic"}}>{item.nota}</div>}
              <div style={{display:"flex",gap:6,marginTop:5,flexWrap:"wrap",alignItems:"center"}}>
                {item.categoria&&<Badge>{item.categoria}</Badge>}
                <Badge color={item.quien==="el"?"#D4C5F0":COLORS.rosa} textColor={item.quien==="el"?COLORS.lilaDeep:"#B0003A"}>{item.quien}</Badge>
                <span style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{item.fecha}</span>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{fontWeight:900,fontSize:15,color:tab==="gastos"?COLORS.danger:COLORS.success,fontFamily:"'Playfair Display',serif"}}>{tab==="gastos"?"-":"+"}{fmt(item.monto)}</div>
              <button onClick={()=>edit(item)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:COLORS.lilaDeep,fontFamily:"'Nunito',sans-serif",fontWeight:700}}>edit</button>
              <button onClick={()=>del(item.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:15,color:COLORS.danger}}>x</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---- TAB TARJETAS ----
function TabTarjetas({data,saveData}){
  const [sel,setSel]=useState(0);
  const [showFijo,setShowFijo]=useState(false);
  const [showCuota,setShowCuota]=useState(false);
  const [showPago,setShowPago]=useState(false);
  const [showHist,setShowHist]=useState(false);
  const [formF,setFormF]=useState({descripcion:"",monto:"",montoUSD:"",moneda:"ARS",dia:""});
  const [formC,setFormC]=useState({descripcion:"",montoCuota:"",montoUSD:"",moneda:"ARS",cuotasTotal:""});
  const [formP,setFormP]=useState({totalReal:"",descripcion:"",fecha:new Date().toISOString().split("T")[0],metaAhorro:""});
  const tarjetas=data.tarjetas||[];
  const tc=data.tipoCambio||{};
  const t=tarjetas[sel]||{fijos:[],cuotas:[],historialPagos:[]};
  const upd=(nuevas)=>saveData({tarjetas:nuevas});
  const tf=(t.fijos||[]).reduce((s,f)=>s+(f.montoARS||f.monto||0),0);
  const tc2=(t.cuotas||[]).reduce((s,c)=>s+(c.montoCuotaARS||c.montoCuota||0),0);
  const totalCalc=tf+tc2;
  const diasParaCierre=()=>{if(!t.diaCierre)return null;const hoy=new Date();const c=new Date(hoy.getFullYear(),hoy.getMonth(),t.diaCierre);if(c<hoy)c.setMonth(c.getMonth()+1);return Math.ceil((c-hoy)/(1000*60*60*24));};
  const diasParaVencer=()=>{if(!t.diaVencimiento)return null;const hoy=new Date();const v=new Date(hoy.getFullYear(),hoy.getMonth(),t.diaVencimiento);if(v<hoy)v.setMonth(v.getMonth()+1);return Math.ceil((v-hoy)/(1000*60*60*24));};
  const dc=diasParaCierre();const dv=diasParaVencer();

  const registrarPago=()=>{
    if(!formP.totalReal)return;
    const totalR=parseFloat(formP.totalReal);
    const pago={id:Date.now(),fecha:formP.fecha,descripcion:formP.descripcion||"Pago tarjeta",totalCalculado:totalCalc,totalPagado:totalR,diferencia:totalR-totalCalc};
    const nuevoGasto={id:Date.now()+1,descripcion:`Pago ${t.nombre}${formP.descripcion?" - "+formP.descripcion:""}`,monto:totalR,categoria:"Hogar",fecha:formP.fecha,quien:"el"};
    const nuevasCuotas=(t.cuotas||[]).map(c=>({...c,cuotasPagadas:c.cuotasPagadas+1})).filter(c=>c.cuotasPagadas<c.cuotasTotal);
    const nuevas=tarjetas.map((x,i)=>i===sel?{...x,cuotas:nuevasCuotas,historialPagos:[pago,...(x.historialPagos||[])]}:x);
    const cambios={tarjetas:nuevas,gastos:[nuevoGasto,...(data.gastos||[])]};
    // Si eligio descontar de un ahorro, reducir el acumulado de esa meta
    if(formP.metaAhorro){
      const ah=data.ahorros||{metas:[],movimientos:[]};
      const movAhorro={id:Date.now()+2,metaId:parseInt(formP.metaAhorro),descripcion:`Pago ${t.nombre}`,monto:totalR,fecha:formP.fecha,tipo:"retiro"};
      cambios.ahorros={
        metas:(ah.metas||[]).map(m=>m.id===parseInt(formP.metaAhorro)?{...m,acumulado:Math.max(0,m.acumulado-totalR)}:m),
        movimientos:[movAhorro,...(ah.movimientos||[])],
      };
    }
    saveData(cambios);
    setFormP({totalReal:"",descripcion:"",fecha:new Date().toISOString().split("T")[0],metaAhorro:""});setShowPago(false);
  };

  return(
    <div>
      <div style={{display:"flex",gap:10,marginBottom:14}}>
        {tarjetas.map((x,i)=>(
          <button key={x.id} onClick={()=>setSel(i)} style={{flex:1,padding:"14px 10px",borderRadius:16,border:"none",cursor:"pointer",background:sel===i?x.color:COLORS.lavanda,fontFamily:"'Nunito',sans-serif",fontWeight:800,fontSize:13,color:sel===i?COLORS.text:COLORS.textLight,boxShadow:sel===i?"0 4px 14px rgba(0,0,0,0.12)":"none"}}>{x.nombre}</button>
        ))}
      </div>
      <Card style={{background:t.color+"55",border:`1.5px solid ${t.color}`}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
          <div>
            <div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Total calculado</div>
            <div style={{fontSize:26,fontWeight:900,color:COLORS.text,fontFamily:"'Playfair Display',serif"}}>{fmt(totalCalc)}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Fijos: {fmt(tf)}</div>
            <div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Cuotas: {fmt(tc2)}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {dc!==null&&<div style={{background:"rgba(255,255,255,0.6)",borderRadius:8,padding:"4px 10px",fontSize:12,fontFamily:"'Nunito',sans-serif",fontWeight:700,color:dc<=5?COLORS.danger:COLORS.text}}>Cierre: {dc===0?"hoy":dc+" dias"}</div>}
          {dv!==null&&<div style={{background:"rgba(255,255,255,0.6)",borderRadius:8,padding:"4px 10px",fontSize:12,fontFamily:"'Nunito',sans-serif",fontWeight:700,color:dv<=5?COLORS.danger:COLORS.text}}>Vence: {dv===0?"hoy":dv+" dias"}</div>}
        </div>
      </Card>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <Btn onClick={()=>setShowPago(v=>!v)} style={{flex:1,justifyContent:"center"}}>{showPago?"Cancelar":"Registrar pago"}</Btn>
        <Btn variant="secondary" small onClick={()=>setShowHist(v=>!v)}>Historial</Btn>
      </div>
      {showPago&&(
        <Card style={{background:COLORS.mint+"55",border:`2px solid ${COLORS.success}`}}>
          <T>Registrar pago de {t.nombre}</T>
          <div style={{background:"rgba(0,0,0,0.04)",borderRadius:10,padding:"10px 14px",marginBottom:12}}>
            <div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Total calculado (referencia)</div>
            <div style={{fontSize:20,fontWeight:900,color:COLORS.text,fontFamily:"'Playfair Display',serif"}}>{fmt(totalCalc)}</div>
          </div>
          <Inp label="Total real pagado ($)" type="number" value={formP.totalReal} onChange={e=>setFormP(f=>({...f,totalReal:e.target.value}))} placeholder={String(Math.round(totalCalc))} style={{fontSize:18,fontWeight:700}}/>
          {formP.totalReal&&parseFloat(formP.totalReal)>0&&(
            <div style={{background:parseFloat(formP.totalReal)>totalCalc?COLORS.rosa+"88":COLORS.mint+"88",borderRadius:10,padding:"8px 12px",marginBottom:12,fontSize:13,fontFamily:"'Nunito',sans-serif",fontWeight:600,color:COLORS.text}}>
              Diferencia: {fmt(parseFloat(formP.totalReal)-totalCalc)}{parseFloat(formP.totalReal)>totalCalc?" (sellado/extras)":" (descuento)"}
            </div>
          )}
          <Inp label="Descripcion (opcional)" value={formP.descripcion} onChange={e=>setFormP(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Pago minimo"/>
          <Inp label="Fecha" type="date" value={formP.fecha} onChange={e=>setFormP(f=>({...f,fecha:e.target.value}))}/>
          {(data.ahorros?.metas||[]).length>0&&(
            <Sel label="Descontar de un ahorro (opcional)" value={formP.metaAhorro} onChange={e=>setFormP(f=>({...f,metaAhorro:e.target.value}))}>
              <option value="">No descontar de ahorros</option>
              {(data.ahorros?.metas||[]).map(m=><option key={m.id} value={m.id}>{m.icono} {m.nombre} - {fmt(m.acumulado)} disponible</option>)}
            </Sel>
          )}
          <div style={{display:"flex",gap:8}}>
            <Btn variant="success" onClick={registrarPago} style={{flex:1,justifyContent:"center"}}>Confirmar pago</Btn>
            <Btn variant="secondary" onClick={()=>setShowPago(false)} style={{flex:1,justifyContent:"center"}}>Cancelar</Btn>
          </div>
        </Card>
      )}
      {showHist&&(t.historialPagos||[]).length>0&&(
        <Card>
          <T>Historial de pagos</T>
          {(t.historialPagos||[]).map(p=>(
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${COLORS.border}`}}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:COLORS.text,fontFamily:"'Nunito',sans-serif"}}>{p.descripcion}</div>
                <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{p.fecha} - calc: {fmt(p.totalCalculado)}</div>
              </div>
              <div style={{fontWeight:900,fontSize:15,color:COLORS.lilaDeep,fontFamily:"'Playfair Display',serif"}}>{fmt(p.totalPagado)}</div>
            </div>
          ))}
        </Card>
      )}
      <T>Gastos fijos</T>
      {tc.tarjeta>0&&<div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:8}}>USD tarjeta: {fmt(tc.tarjeta)}</div>}
      {(t.fijos||[]).map(f=>(
        <Card key={f.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:COLORS.text,fontFamily:"'Nunito',sans-serif"}}>{f.descripcion}</div>
              <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Dia {f.dia} - Mensual{f.moneda==="USD"?` (${fmtUSD(f.montoUSD)})`:""}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{fontWeight:900,fontSize:15,color:COLORS.lilaDeep,fontFamily:"'Playfair Display',serif"}}>{fmt(f.montoARS||f.monto||0)}</div>
              <button onClick={()=>upd(tarjetas.map((x,i)=>i===sel?{...x,fijos:(x.fijos||[]).filter(y=>y.id!==f.id)}:x))} style={{background:"none",border:"none",cursor:"pointer",fontSize:15,color:COLORS.danger}}>x</button>
            </div>
          </div>
        </Card>
      ))}
      {!showFijo?<Btn variant="secondary" small onClick={()=>setShowFijo(true)} style={{marginBottom:14}}>+ Gasto fijo</Btn>:(
        <Card style={{background:COLORS.lavanda}}>
          <Inp label="Descripcion" value={formF.descripcion} onChange={e=>setFormF(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Netflix"/>
          <Sel label="Moneda" value={formF.moneda} onChange={e=>setFormF(f=>({...f,moneda:e.target.value}))}><option value="ARS">Pesos ($)</option><option value="USD">Dolares (USD)</option></Sel>
          {formF.moneda==="ARS"?<Inp label="Monto ($)" type="number" value={formF.monto} onChange={e=>setFormF(f=>({...f,monto:e.target.value}))}/>:(
            <div><Inp label="Monto (USD)" type="number" value={formF.montoUSD} onChange={e=>setFormF(f=>({...f,montoUSD:e.target.value}))} placeholder="0"/>{formF.montoUSD&&tc.tarjeta>0&&<div style={{fontSize:12,color:COLORS.lilaDeep,fontFamily:"'Nunito',sans-serif",marginBottom:8,fontWeight:700}}>= {fmt(parseFloat(formF.montoUSD)*tc.tarjeta)} al cambio tarjeta</div>}</div>
          )}
          <Inp label="Dia de debito" type="number" value={formF.dia} onChange={e=>setFormF(f=>({...f,dia:e.target.value}))} placeholder="15"/>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>{if(!formF.descripcion)return;const mARS=formF.moneda==="USD"?(parseFloat(formF.montoUSD)||0)*tc.tarjeta:parseFloat(formF.monto)||0;const n={id:Date.now(),descripcion:formF.descripcion,monto:mARS,montoARS:mARS,moneda:formF.moneda,montoUSD:parseFloat(formF.montoUSD)||0,dia:parseInt(formF.dia)||1};upd(tarjetas.map((x,i)=>i===sel?{...x,fijos:[...(x.fijos||[]),n]}:x));setFormF({descripcion:"",monto:"",montoUSD:"",moneda:"ARS",dia:""});setShowFijo(false);}} style={{flex:1,justifyContent:"center"}}>Guardar</Btn>
            <Btn variant="secondary" onClick={()=>setShowFijo(false)} style={{flex:1,justifyContent:"center"}}>Cancelar</Btn>
          </div>
        </Card>
      )}
      <T>Cuotas pendientes</T>
      {(t.cuotas||[]).map(c=>(
        <Card key={c.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:COLORS.text,fontFamily:"'Nunito',sans-serif"}}>{c.descripcion}</div>
              <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Cuota {c.cuotasPagadas+1}/{c.cuotasTotal} - Resta {fmt((c.cuotasTotal-c.cuotasPagadas)*(c.montoCuotaARS||c.montoCuota||0))}{c.moneda==="USD"?` (${fmtUSD(c.montoUSD)} c/u)`:""}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <div style={{fontWeight:900,fontSize:15,color:COLORS.lilaDeep,fontFamily:"'Playfair Display',serif"}}>{fmt(c.montoCuotaARS||c.montoCuota||0)}/mes</div>
              <button onClick={()=>upd(tarjetas.map((x,i)=>i===sel?{...x,cuotas:(x.cuotas||[]).filter(y=>y.id!==c.id)}:x))} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:COLORS.danger,fontFamily:"'Nunito',sans-serif"}}>Eliminar</button>
            </div>
          </div>
          <ProgressBar label="" value={c.cuotasPagadas} max={c.cuotasTotal} color={COLORS.lila}/>
        </Card>
      ))}
      {!showCuota?<Btn variant="secondary" small onClick={()=>setShowCuota(true)}>+ Agregar cuota</Btn>:(
        <Card style={{background:COLORS.lavanda}}>
          <Inp label="Descripcion" value={formC.descripcion} onChange={e=>setFormC(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Heladera"/>
          <Sel label="Moneda" value={formC.moneda} onChange={e=>setFormC(f=>({...f,moneda:e.target.value}))}><option value="ARS">Pesos ($)</option><option value="USD">Dolares (USD)</option></Sel>
          {formC.moneda==="ARS"?<Inp label="Valor de cada cuota ($)" type="number" value={formC.montoCuota} onChange={e=>setFormC(f=>({...f,montoCuota:e.target.value}))}/>:(
            <div><Inp label="Valor de cada cuota (USD)" type="number" value={formC.montoUSD} onChange={e=>setFormC(f=>({...f,montoUSD:e.target.value}))} placeholder="0"/>{formC.montoUSD&&tc.tarjeta>0&&<div style={{fontSize:12,color:COLORS.lilaDeep,fontFamily:"'Nunito',sans-serif",marginBottom:8,fontWeight:700}}>= {fmt(parseFloat(formC.montoUSD)*tc.tarjeta)}/mes al cambio tarjeta</div>}</div>
          )}
          <Inp label="Cantidad de cuotas" type="number" value={formC.cuotasTotal} onChange={e=>setFormC(f=>({...f,cuotasTotal:e.target.value}))}/>
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={()=>{if(!formC.descripcion||(!formC.montoCuota&&!formC.montoUSD))return;const mARS=formC.moneda==="USD"?(parseFloat(formC.montoUSD)||0)*tc.tarjeta:parseFloat(formC.montoCuota)||0;const n={id:Date.now(),descripcion:formC.descripcion,montoCuota:mARS,montoCuotaARS:mARS,moneda:formC.moneda,montoUSD:parseFloat(formC.montoUSD)||0,cuotasPagadas:0,cuotasTotal:parseInt(formC.cuotasTotal)||12};upd(tarjetas.map((x,i)=>i===sel?{...x,cuotas:[...(x.cuotas||[]),n]}:x));setFormC({descripcion:"",montoCuota:"",montoUSD:"",moneda:"ARS",cuotasTotal:""});setShowCuota(false);}} style={{flex:1,justifyContent:"center"}}>Guardar</Btn>
            <Btn variant="secondary" onClick={()=>setShowCuota(false)} style={{flex:1,justifyContent:"center"}}>Cancelar</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---- TAB AUTO ----
function TabAuto({data,saveData}){
  const auto=data.auto||DATA_INICIAL.auto;
  const tc=data.tipoCambio||{};
  const [showConfig,setShowConfig]=useState(!auto.deudaTotal);
  const [showPago,setShowPago]=useState(false);
  const [fc,setFc]=useState({descripcion:auto.descripcion||"",deudaTotal:auto.deudaTotal||"",deudaRestante:auto.deudaRestante||""});
  const [fp,setFp]=useState({monto:"",descripcion:"",fecha:new Date().toISOString().split("T")[0],metaAhorro:"",tipoDolar:"blue"});
  const guardarConfig=()=>{const dt=parseFloat(fc.deudaTotal)||0;const dr=fc.deudaRestante?parseFloat(fc.deudaRestante):dt;saveData({auto:{...auto,descripcion:fc.descripcion,deudaTotal:dt,deudaRestante:dr}});setShowConfig(false);};
  const registrarPago=()=>{
    if(!fp.monto)return;
    const m=parseFloat(fp.monto);
    const pago={id:Date.now(),monto:m,descripcion:fp.descripcion,fecha:fp.fecha};
    const cambios={auto:{...auto,deudaRestante:Math.max(0,(auto.deudaRestante||auto.deudaTotal||0)-m),pagos:[pago,...(auto.pagos||[])]}};
    if(fp.metaAhorro){
      const ah=data.ahorros||{metas:[],movimientos:[]};
      const montoARS=m*(data.tipoCambio?.[fp.tipoDolar]||0);
      const movAhorro={id:Date.now()+1,metaId:parseInt(fp.metaAhorro),descripcion:`Pago auto - ${fp.descripcion||"cuota"}`,monto:montoARS||m,fecha:fp.fecha,tipo:"retiro"};
      cambios.ahorros={
        metas:(ah.metas||[]).map(x=>x.id===parseInt(fp.metaAhorro)?{...x,acumulado:Math.max(0,x.acumulado-(montoARS||m))}:x),
        movimientos:[movAhorro,...(ah.movimientos||[])],
      };
    }
    saveData(cambios);
    setFp({monto:"",descripcion:"",fecha:new Date().toISOString().split("T")[0],metaAhorro:"",tipoDolar:"blue"});
    setShowPago(false);
  };
  const delPago=(pid)=>{const p=(auto.pagos||[]).find(x=>x.id===pid);if(!p)return;saveData({auto:{...auto,deudaRestante:Math.min(auto.deudaTotal||0,(auto.deudaRestante||0)+p.monto),pagos:(auto.pagos||[]).filter(x=>x.id!==pid)}});};
  const pagado=(auto.deudaTotal||0)-(auto.deudaRestante||0);
  const pct=auto.deudaTotal>0?Math.round((pagado/auto.deudaTotal)*100):0;
  const cambio=tc.blue||0;
  if(!auto.deudaTotal||showConfig)return(
    <div>
      <Card style={{background:COLORS.lavanda}}>
        <T>Configurar deuda del auto</T>
        <Inp label="Descripcion" value={fc.descripcion} onChange={e=>setFc(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Camioneta Ford"/>
        <Inp label="Deuda total (USD)" type="number" value={fc.deudaTotal} onChange={e=>setFc(f=>({...f,deudaTotal:e.target.value}))} placeholder="0"/>
        <Inp label="Deuda restante (USD) - opcional" type="number" value={fc.deudaRestante} onChange={e=>setFc(f=>({...f,deudaRestante:e.target.value}))} placeholder="Dejar vacio si igual al total"/>
        <Btn onClick={guardarConfig} style={{width:"100%",justifyContent:"center"}}>Guardar</Btn>
        {auto.deudaTotal>0&&<Btn variant="secondary" onClick={()=>setShowConfig(false)} style={{width:"100%",justifyContent:"center",marginTop:8}}>Cancelar</Btn>}
      </Card>
    </div>
  );
  return(
    <div>
      <Card style={{background:`linear-gradient(135deg, ${COLORS.peach}, ${COLORS.lavanda})`,border:`1.5px solid ${COLORS.lila}`}}>
        <div style={{fontWeight:800,fontSize:16,color:COLORS.text,fontFamily:"'Playfair Display',serif",marginBottom:6}}>{auto.descripcion}</div>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
          <div>
            <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Deuda restante</div>
            <div style={{fontSize:26,fontWeight:900,color:COLORS.text,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(auto.deudaRestante)}</div>
            {cambio>0&&<div style={{fontSize:13,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{fmt(auto.deudaRestante*cambio)} al blue</div>}
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Pagado</div>
            <div style={{fontSize:20,fontWeight:900,color:COLORS.success,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(pagado)}</div>
            <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{pct}% cancelado</div>
          </div>
        </div>
        <div style={{height:10,borderRadius:99,background:"rgba(255,255,255,0.5)",overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,borderRadius:99,background:COLORS.success,transition:"width 0.6s"}}/></div>
        <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginTop:4}}>Total: {fmtUSD(auto.deudaTotal)}{cambio>0?` - Blue: $${Number(cambio).toLocaleString("es-AR")}/USD`:""}</div>
      </Card>
      <div style={{display:"flex",gap:8,marginBottom:14}}>
        <Btn onClick={()=>setShowPago(v=>!v)} style={{flex:1,justifyContent:"center"}}>{showPago?"Cancelar":"+ Registrar pago"}</Btn>
        <Btn variant="secondary" small onClick={()=>{setFc({descripcion:auto.descripcion,deudaTotal:auto.deudaTotal,deudaRestante:auto.deudaRestante});setShowConfig(true);}}>Editar</Btn>
      </div>
      {showPago&&(
        <Card style={{background:COLORS.lavanda}}>
          <Inp label="Monto pagado (USD)" type="number" value={fp.monto} onChange={e=>setFp(f=>({...f,monto:e.target.value}))} placeholder="0"/>
          <Sel label="Tipo de dolar" value={fp.tipoDolar} onChange={e=>setFp(f=>({...f,tipoDolar:e.target.value}))}>
            <option value="blue">Blue ({fmt(data.tipoCambio?.blue||0)})</option>
            <option value="oficial">Oficial ({fmt(data.tipoCambio?.oficial||0)})</option>
            <option value="tarjeta">Tarjeta ({fmt(data.tipoCambio?.tarjeta||0)})</option>
          </Sel>
          {fp.monto&&(data.tipoCambio?.[fp.tipoDolar]||0)>0&&<div style={{fontSize:12,color:COLORS.lilaDeep,fontFamily:"'Nunito',sans-serif",marginBottom:8,fontWeight:700}}>= {fmt(parseFloat(fp.monto)*(data.tipoCambio?.[fp.tipoDolar]||0))} al {fp.tipoDolar}</div>}
          <Inp label="Descripcion (opcional)" value={fp.descripcion} onChange={e=>setFp(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Cuota mayo"/>
          <Inp label="Fecha" type="date" value={fp.fecha} onChange={e=>setFp(f=>({...f,fecha:e.target.value}))}/>
          {(data.ahorros?.metas||[]).length>0&&(
            <Sel label="Descontar de un ahorro (opcional)" value={fp.metaAhorro} onChange={e=>setFp(f=>({...f,metaAhorro:e.target.value}))}>
              <option value="">No descontar de ahorros</option>
              {(data.ahorros?.metas||[]).map(m=><option key={m.id} value={m.id}>{m.icono} {m.nombre} - {fmt(m.acumulado)} disponible</option>)}
            </Sel>
          )}
          {fp.metaAhorro&&(data.tipoCambio?.[fp.tipoDolar]||0)>0&&<div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:8}}>Se descontara {fmt(parseFloat(fp.monto||0)*(data.tipoCambio?.[fp.tipoDolar]||0))} de ese ahorro (al {fp.tipoDolar})</div>}
          <Btn onClick={registrarPago} style={{width:"100%",justifyContent:"center"}}>Guardar pago</Btn>
        </Card>
      )}
      <T>Historial de pagos</T>
      {(auto.pagos||[]).length===0&&<div style={{textAlign:"center",color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",padding:"20px 0"}}>Sin pagos registrados</div>}
      {(auto.pagos||[]).map(p=>(
        <Card key={p.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:COLORS.text,fontFamily:"'Nunito',sans-serif"}}>{p.descripcion||"Pago"}</div>
              <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{p.fecha}{cambio>0?` - ${fmt(p.monto*cambio)}`:""}</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{fontWeight:900,fontSize:15,color:COLORS.success,fontFamily:"'Playfair Display',serif"}}>{fmtUSD(p.monto)}</div>
              <button onClick={()=>delPago(p.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:15,color:COLORS.danger}}>x</button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---- TAB AHORROS ----
function TabAhorros({data,saveData}){
  const [showAdd,setShowAdd]=useState(false);
  const [showMov,setShowMov]=useState(null);
  const [editId,setEditId]=useState(null);
  const [fm,setFm]=useState({nombre:"",objetivo:"",icono:"*",acumuladoInicial:""});
  const [fmov,setFmov]=useState({descripcion:"",monto:"",tipo:"ingreso"});
  const ah=data.ahorros||{metas:[],movimientos:[]};
  const ta=(ah.metas||[]).reduce((s,m)=>s+m.acumulado,0);
  const to=(ah.metas||[]).reduce((s,m)=>s+m.objetivo,0);
  const mc=["#B8D8E8",COLORS.mint,"#F5D78A",COLORS.lila,COLORS.rosa,COLORS.peach];

  const saveMeta=()=>{
    if(!fm.nombre||!fm.objetivo)return;
    if(editId)saveData({ahorros:{...ah,metas:(ah.metas||[]).map(m=>m.id===editId?{...m,nombre:fm.nombre,objetivo:parseFloat(fm.objetivo),icono:fm.icono}:m)}});
    else saveData({ahorros:{...ah,metas:[...(ah.metas||[]),{id:Date.now(),nombre:fm.nombre,objetivo:parseFloat(fm.objetivo),acumulado:parseFloat(fm.acumuladoInicial)||0,color:mc[(ah.metas||[]).length%mc.length],icono:fm.icono}]}});
    setFm({nombre:"",objetivo:"",icono:"*",acumuladoInicial:""});setShowAdd(false);setEditId(null);
  };
  const delMeta=(id)=>saveData({ahorros:{metas:(ah.metas||[]).filter(m=>m.id!==id),movimientos:(ah.movimientos||[]).filter(m=>m.metaId!==id)}});

  const saveMov=(metaId)=>{
    if(!fmov.descripcion||!fmov.monto)return;
    const monto=parseFloat(fmov.monto);
    const d=fmov.tipo==="ingreso"?monto:-monto;
    const mov={id:Date.now(),metaId,descripcion:fmov.descripcion,monto,fecha:new Date().toISOString().split("T")[0],tipo:fmov.tipo};
    const nuevasMetas=(ah.metas||[]).map(m=>m.id===metaId?{...m,acumulado:Math.max(0,m.acumulado+d)}:m);
    const nuevosMov=[mov,...(ah.movimientos||[])];
    // Si es deposito, registrar como gasto en categoria Ahorros
    const extras={};
    if(fmov.tipo==="ingreso"){
      const nuevoGasto={id:Date.now()+1,descripcion:`Ahorro - ${(ah.metas||[]).find(m=>m.id===metaId)?.nombre||"Meta"}`,monto,categoria:"Ahorros",fecha:new Date().toISOString().split("T")[0],quien:"el"};
      extras.gastos=[nuevoGasto,...(data.gastos||[])];
    }
    saveData({ahorros:{metas:nuevasMetas,movimientos:nuevosMov},...extras});
    setFmov({descripcion:"",monto:"",tipo:"ingreso"});setShowMov(null);
  };

  return(
    <div>
      <Card style={{background:`linear-gradient(135deg, ${COLORS.lavanda}, ${COLORS.mint+"88"})`,border:`1.5px solid ${COLORS.lila}`}}>
        <div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:4}}>Total ahorrado</div>
        <div style={{fontSize:32,fontWeight:900,color:COLORS.lilaDeep,fontFamily:"'Playfair Display',serif",marginBottom:6}}>{fmt(ta)}</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:to>0?10:0}}>
          <div style={{fontSize:13,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Objetivo total: {fmt(to)}</div>
          {to>0&&<div style={{fontSize:13,fontWeight:700,color:COLORS.lilaDeep,fontFamily:"'Nunito',sans-serif"}}>{Math.round((ta/to)*100)}%</div>}
        </div>
        {to>0&&<ProgressBar label="" value={ta} max={to} color={COLORS.lilaDeep}/>}
      </Card>
      {!showAdd?(
        <Btn onClick={()=>{setShowAdd(true);setEditId(null);setFm({nombre:"",objetivo:"",icono:"*"});}} style={{width:"100%",justifyContent:"center",marginBottom:14}}>+ Nueva meta</Btn>
      ):(
        <Card style={{background:COLORS.lavanda}}>
          <div style={{fontWeight:700,fontSize:14,color:COLORS.lilaDeep,marginBottom:10,fontFamily:"'Nunito',sans-serif"}}>{editId?"Editar meta":"Nueva meta"}</div>
          <div style={{display:"grid",gridTemplateColumns:"52px 1fr",gap:10}}>
            <Inp label="Icono" value={fm.icono} onChange={e=>setFm(f=>({...f,icono:e.target.value}))}/>
            <Inp label="Nombre" value={fm.nombre} onChange={e=>setFm(f=>({...f,nombre:e.target.value}))} placeholder="Ej: Vacaciones"/>
          </div>
          <Inp label="Objetivo ($)" type="number" value={fm.objetivo} onChange={e=>setFm(f=>({...f,objetivo:e.target.value}))}/>
          {!editId&&<Inp label="Ya tengo ahorrado ($) - opcional" type="number" value={fm.acumuladoInicial} onChange={e=>setFm(f=>({...f,acumuladoInicial:e.target.value}))} placeholder="0"/>}
          <div style={{display:"flex",gap:8}}>
            <Btn onClick={saveMeta} style={{flex:1,justifyContent:"center"}}>Guardar</Btn>
            <Btn variant="secondary" onClick={()=>{setShowAdd(false);setEditId(null);}} style={{flex:1,justifyContent:"center"}}>Cancelar</Btn>
          </div>
        </Card>
      )}
      {(ah.metas||[]).map(meta=>{
        const movs=(ah.movimientos||[]).filter(m=>m.metaId===meta.id).slice(0,3);
        const pct=Math.min(Math.round((meta.acumulado/Math.max(meta.objetivo,1))*100),100);
        return(
          <Card key={meta.id}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:44,height:44,borderRadius:14,background:meta.color+"88",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>{meta.icono}</div>
                <div>
                  <div style={{fontWeight:800,fontSize:15,color:COLORS.text,fontFamily:"'Playfair Display',serif"}}>{meta.nombre}</div>
                  <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{pct>=100?"Meta alcanzada!":`Falta ${fmt(meta.objetivo-meta.acumulado)}`}</div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                <div style={{fontWeight:900,fontSize:16,color:COLORS.lilaDeep,fontFamily:"'Playfair Display',serif"}}>{fmt(meta.acumulado)}</div>
                <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>de {fmt(meta.objetivo)}</div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>{setEditId(meta.id);setFm({nombre:meta.nombre,objetivo:String(meta.objetivo),icono:meta.icono});setShowAdd(true);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:COLORS.lilaDeep,fontFamily:"'Nunito',sans-serif",fontWeight:700}}>edit</button>
                  <button onClick={()=>delMeta(meta.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:COLORS.danger,fontFamily:"'Nunito',sans-serif",fontWeight:700}}>x</button>
                </div>
              </div>
            </div>
            <ProgressBar label="" value={meta.acumulado} max={meta.objetivo} color={COLORS.lilaDeep}/>
            {movs.map(m=>(
              <div key={m.id} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:`1px solid ${COLORS.border}`}}>
                <span style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{m.descripcion} - {m.fecha}</span>
                <span style={{fontSize:12,fontWeight:700,color:m.tipo==="ingreso"?COLORS.success:COLORS.danger,fontFamily:"'Nunito',sans-serif"}}>{m.tipo==="ingreso"?"+":"-"}{fmt(m.monto)}</span>
              </div>
            ))}
            {showMov===meta.id?(
              <div style={{background:COLORS.lavanda,borderRadius:12,padding:12,marginTop:10}}>
                <div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:8}}>Los depositos se registran como gasto en categoria Ahorros.</div>
                <div style={{display:"flex",gap:8,marginBottom:10}}>
                  {["ingreso","retiro"].map(tipo=>(
                    <button key={tipo} onClick={()=>setFmov(f=>({...f,tipo}))} style={{flex:1,padding:"7px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:12,background:fmov.tipo===tipo?(tipo==="ingreso"?COLORS.mint:COLORS.rosa):"#fff",color:fmov.tipo===tipo?(tipo==="ingreso"?"#1A6B4A":"#B0003A"):COLORS.textLight}}>
                      {tipo==="ingreso"?"+ Depositar":"- Retirar"}
                    </button>
                  ))}
                </div>
                <Inp label="Descripcion" value={fmov.descripcion} onChange={e=>setFmov(f=>({...f,descripcion:e.target.value}))} placeholder="Ej: Ahorro del mes"/>
                <Inp label="Monto ($)" type="number" value={fmov.monto} onChange={e=>setFmov(f=>({...f,monto:e.target.value}))}/>
                <div style={{display:"flex",gap:8}}>
                  <Btn onClick={()=>saveMov(meta.id)} style={{flex:1,justifyContent:"center"}}>Guardar</Btn>
                  <Btn variant="secondary" onClick={()=>setShowMov(null)} style={{flex:1,justifyContent:"center"}}>Cancelar</Btn>
                </div>
              </div>
            ):(
              <Btn variant="secondary" small onClick={()=>{setShowMov(meta.id);setFmov({descripcion:"",monto:"",tipo:"ingreso"});}} style={{marginTop:8}}>+ Movimiento</Btn>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ---- TAB MAYORISTA ----
function TabMayorista({data,saveData}){
  const [showAdd,setShowAdd]=useState(false);
  const [showCerrar,setShowCerrar]=useState(false);
  const [showHist,setShowHist]=useState(false);
  const [editId,setEditId]=useState(null);
  const [fi,setFi]=useState({descripcion:"",cantidadLista:"1",precio:""});
  const [sugs,setSugs]=useState([]);
  const may=data.mayorista||DATA_INICIAL.mayorista;
  const lista=may.listaActiva;
  const cat={};
  (may.historial||[]).forEach(c=>c.items.forEach(i=>{cat[i.descripcion.toLowerCase().trim()]={descripcion:i.descripcion,precio:i.precio};}));
  const tc=(lista.items||[]).filter(i=>i.enChanguito).reduce((s,i)=>s+i.cantidadComprada*i.precio,0);
  const tl=(lista.items||[]).reduce((s,i)=>s+i.cantidadLista*i.precio,0);
  const sin=(lista.items||[]).filter(i=>!i.enChanguito);
  const con=(lista.items||[]).filter(i=>i.enChanguito);
  const is={width:56,padding:"6px 6px",borderRadius:10,border:`1.5px solid ${COLORS.border}`,background:COLORS.bg,color:COLORS.text,fontSize:13,fontFamily:"'Nunito',sans-serif",textAlign:"center"};
  const updItem=(id,f,v)=>saveData({mayorista:{...may,listaActiva:{...lista,items:(lista.items||[]).map(i=>i.id===id?{...i,[f]:v}:i)}}});
  const delItem=(id)=>saveData({mayorista:{...may,listaActiva:{...lista,items:(lista.items||[]).filter(i=>i.id!==id)}}});
  const toggle=(id)=>saveData({mayorista:{...may,listaActiva:{...lista,items:(lista.items||[]).map(i=>i.id===id?{...i,enChanguito:!i.enChanguito,cantidadComprada:!i.enChanguito?i.cantidadLista:0}:i)}}});
  const addItem=()=>{
    if(!fi.descripcion)return;
    if(editId){saveData({mayorista:{...may,listaActiva:{...lista,items:(lista.items||[]).map(i=>i.id===editId?{...i,descripcion:fi.descripcion,cantidadLista:parseInt(fi.cantidadLista)||1,precio:parseFloat(fi.precio)||0}:i)}}});setEditId(null);}
    else saveData({mayorista:{...may,listaActiva:{...lista,items:[...(lista.items||[]),{id:Date.now(),descripcion:fi.descripcion,cantidadLista:parseInt(fi.cantidadLista)||1,cantidadComprada:0,precio:parseFloat(fi.precio)||0,enChanguito:false}]}}});
    setFi({descripcion:"",cantidadLista:"1",precio:""});setSugs([]);setShowAdd(false);
  };
  const cerrar=()=>{
    const hoy=new Date().toISOString().split("T")[0];
    const arch={id:Date.now(),nombre:lista.nombre,fecha:lista.fecha,totalGastado:tc,items:(lista.items||[]).filter(i=>i.enChanguito).map(i=>({descripcion:i.descripcion,cantidadComprada:i.cantidadComprada,precio:i.precio}))};
    const ng={id:Date.now()+1,descripcion:`Mayorista - ${lista.nombre}`,monto:tc,categoria:"Comida",fecha:hoy,quien:"el"};
    const pm=new Date();pm.setMonth(pm.getMonth()+1);
    const npm=pm.toLocaleString("es-AR",{month:"long",year:"numeric"});
    saveData({gastos:[ng,...(data.gastos||[])],mayorista:{listaActiva:{id:Date.now()+2,nombre:npm.charAt(0).toUpperCase()+npm.slice(1),fecha:hoy,cerrada:false,items:[]},historial:[arch,...(may.historial||[])]}});
    setShowCerrar(false);
  };
  return(
    <div>
      <Card style={{background:COLORS.mint+"88",border:`1.5px solid ${COLORS.mint}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div><div style={{fontSize:11,fontWeight:700,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{lista.nombre}</div><div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>En el changuito</div><div style={{fontSize:22,fontWeight:900,color:COLORS.text,fontFamily:"'Playfair Display',serif"}}>{fmt(tc)}</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Total lista</div><div style={{fontSize:15,fontWeight:700,color:COLORS.textLight,fontFamily:"'Playfair Display',serif"}}>{fmt(tl)}</div></div>
        </div>
        <div style={{marginTop:8}}><ProgressBar label="" value={con.length} max={Math.max((lista.items||[]).length,1)} color={COLORS.success}/><div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{con.length} de {(lista.items||[]).length} items</div></div>
      </Card>
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <Btn onClick={()=>{setShowAdd(v=>!v);setSugs([]);setEditId(null);setFi({descripcion:"",cantidadLista:"1",precio:"",});}} style={{flex:1,justifyContent:"center"}}>{showAdd?"Cancelar":"+ Agregar item"}</Btn>
        <Btn variant="secondary" small onClick={()=>setShowHist(v=>!v)}>Historial</Btn>
        {(lista.items||[]).length>0&&<Btn variant="success" small onClick={()=>setShowCerrar(true)}>OK Cerrar</Btn>}
      </div>
      {showAdd&&(
        <Card style={{background:COLORS.lavanda,position:"relative",zIndex:5}}>
          <div style={{marginBottom:12}}>
            <label style={{display:"block",fontSize:12,fontWeight:700,color:COLORS.textLight,marginBottom:4,fontFamily:"'Nunito',sans-serif"}}>Producto</label>
            <input value={fi.descripcion} onChange={e=>{setFi(f=>({...f,descripcion:e.target.value}));const q=e.target.value.toLowerCase();setSugs(q.length>=2?Object.values(cat).filter(x=>x.descripcion.toLowerCase().includes(q)).slice(0,5):[]);}} placeholder="Ej: Arroz x 5kg" autoComplete="off" style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${COLORS.border}`,background:"#fff",color:COLORS.text,fontSize:14,fontFamily:"'Nunito',sans-serif",outline:"none",boxSizing:"border-box"}}/>
            {sugs.length>0&&(
              <div style={{background:"#fff",borderRadius:12,border:`1.5px solid ${COLORS.lila}`,marginTop:4,overflow:"hidden",boxShadow:"0 4px 18px rgba(156,114,207,0.18)"}}>
                {sugs.map((s,i)=>(
                  <button key={i} onClick={()=>{setFi(f=>({...f,descripcion:s.descripcion,precio:String(s.precio)}));setSugs([]);}} style={{width:"100%",padding:"10px 14px",border:"none",background:"transparent",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:i<sugs.length-1?`1px solid ${COLORS.border}`:"none"}}>
                    <span style={{fontSize:13,color:COLORS.text,fontFamily:"'Nunito',sans-serif",fontWeight:600}}>{s.descripcion}</span>
                    <span style={{fontSize:12,color:COLORS.lilaDeep,fontFamily:"'Nunito',sans-serif",fontWeight:700,background:COLORS.lilaLight,padding:"2px 8px",borderRadius:8}}>ultimo: {fmt(s.precio)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Inp label="Cantidad" type="number" value={fi.cantidadLista} onChange={e=>setFi(f=>({...f,cantidadLista:e.target.value}))}/>
            <Inp label="$ unitario" type="number" value={fi.precio} onChange={e=>setFi(f=>({...f,precio:e.target.value}))} placeholder="0"/>
          </div>
          <Btn onClick={addItem} style={{width:"100%",justifyContent:"center"}}>{editId?"Guardar cambios":"Agregar a la lista"}</Btn>
        </Card>
      )}
      {showCerrar&&(
        <Card style={{background:COLORS.mint+"55",border:`2px solid ${COLORS.success}`}}>
          <div style={{fontWeight:800,fontSize:15,color:COLORS.text,fontFamily:"'Playfair Display',serif",marginBottom:8}}>Cerrar la compra?</div>
          <div style={{fontSize:13,color:COLORS.text,fontFamily:"'Nunito',sans-serif",marginBottom:4}}>Registrar {fmt(tc)} como gasto en Comida</div>
          <div style={{fontSize:13,color:COLORS.text,fontFamily:"'Nunito',sans-serif",marginBottom:14}}>Archivar lista y abrir nueva</div>
          <div style={{display:"flex",gap:8}}>
            <Btn variant="success" onClick={cerrar} style={{flex:1,justifyContent:"center"}}>Confirmar</Btn>
            <Btn variant="secondary" onClick={()=>setShowCerrar(false)} style={{flex:1,justifyContent:"center"}}>Cancelar</Btn>
          </div>
        </Card>
      )}
      {sin.length>0&&(
        <>
          <div style={{fontWeight:800,fontSize:13,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:6}}>Por buscar</div>
          <div style={{display:"flex",gap:8,padding:"0 4px",marginBottom:4}}>
            <div style={{width:28}}/><div style={{flex:1}}/>
            <div style={{width:56,fontSize:10,fontWeight:700,color:COLORS.textLight,textAlign:"center",fontFamily:"'Nunito',sans-serif"}}>Llevar</div>
            <div style={{width:56,fontSize:10,fontWeight:700,color:COLORS.textLight,textAlign:"center",fontFamily:"'Nunito',sans-serif"}}>Comprado</div>
            <div style={{width:56,fontSize:10,fontWeight:700,color:COLORS.textLight,textAlign:"center",fontFamily:"'Nunito',sans-serif"}}>$ unit.</div>
          </div>
          {sin.map(item=>(
            <Card key={item.id} style={{padding:"10px 12px"}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>toggle(item.id)} style={{width:28,height:28,borderRadius:8,border:`2px solid ${COLORS.lila}`,background:"transparent",cursor:"pointer",flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:COLORS.text,fontFamily:"'Nunito',sans-serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.descripcion}</div>
                  {item.precio>0&&<div style={{fontSize:11,color:COLORS.textLight}}>Sub: {fmt(item.cantidadLista*item.precio)}</div>}
                </div>
                <input type="number" value={item.cantidadLista} onChange={e=>updItem(item.id,"cantidadLista",parseInt(e.target.value)||1)} style={is}/>
                <input type="number" value={item.cantidadComprada||""} onChange={e=>updItem(item.id,"cantidadComprada",parseInt(e.target.value)||0)} placeholder="0" style={{...is,background:COLORS.lilaLight}}/>
                <input type="number" value={item.precio||""} onChange={e=>updItem(item.id,"precio",parseFloat(e.target.value)||0)} placeholder="$" style={{...is,width:56}}/>
                <button onClick={()=>{setEditId(item.id);setFi({descripcion:item.descripcion,cantidadLista:String(item.cantidadLista),precio:String(item.precio)});setShowAdd(true);}} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:COLORS.lilaDeep,flexShrink:0}}>edit</button>
                <button onClick={()=>delItem(item.id)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:COLORS.danger,flexShrink:0}}>x</button>
              </div>
            </Card>
          ))}
        </>
      )}
      {con.length>0&&(
        <>
          <div style={{fontWeight:800,fontSize:13,color:COLORS.success,fontFamily:"'Nunito',sans-serif",marginBottom:6,marginTop:8}}>En el changuito</div>
          {con.map(item=>(
            <Card key={item.id} style={{padding:"10px 12px",opacity:0.8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>toggle(item.id)} style={{width:28,height:28,borderRadius:8,border:"none",background:COLORS.success,cursor:"pointer",flexShrink:0,color:"#fff",fontSize:12}}>OK</button>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:COLORS.textLight,textDecoration:"line-through",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'Nunito',sans-serif"}}>{item.descripcion}</div>
                  <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>x{item.cantidadComprada} - {fmt(item.cantidadComprada*item.precio)}</div>
                </div>
                <input type="number" value={item.cantidadComprada} onChange={e=>updItem(item.id,"cantidadComprada",parseInt(e.target.value)||0)} style={{...is,background:COLORS.mint}}/>
              </div>
            </Card>
          ))}
        </>
      )}
      {(lista.items||[]).length===0&&!showAdd&&<div style={{textAlign:"center",padding:"40px 0",color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}><div style={{fontWeight:700}}>Lista vacia</div><div style={{fontSize:13,marginTop:4}}>Agrega los items para la proxima compra</div></div>}
      {showHist&&(
        <div style={{marginTop:8}}>
          <T>Compras anteriores</T>
          {(may.historial||[]).length===0&&<div style={{textAlign:"center",color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",padding:"20px 0"}}>Sin historial</div>}
          {(may.historial||[]).map(c=>(
            <Card key={c.id}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div><div style={{fontWeight:800,fontSize:14,color:COLORS.text,fontFamily:"'Nunito',sans-serif"}}>{c.nombre}</div><div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{c.fecha} - {c.items.length} items</div></div>
                <div style={{fontWeight:900,fontSize:16,color:COLORS.lilaDeep,fontFamily:"'Playfair Display',serif"}}>{fmt(c.totalGastado)}</div>
              </div>
              {c.items.map((x,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",borderBottom:i<c.items.length-1?`1px solid ${COLORS.border}`:"none"}}><span style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{x.descripcion} x{x.cantidadComprada}</span><span style={{fontSize:12,color:COLORS.text,fontFamily:"'Nunito',sans-serif",fontWeight:600}}>{fmt(x.precio)} c/u</span></div>)}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- TAB HISTORIAL ----
function TabHistorial({data}){
  const cats=data.categorias||CATS_DEFAULT;
  const [fq,setFq]=useState("todos");
  const [fc,setFc]=useState("todas");
  const [fDesde,setFDesde]=useState("");
  const [fHasta,setFHasta]=useState("");
  const todos=[...(data.gastos||[])].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const fil=todos.filter(g=>{
    if(fq!=="todos"&&g.quien!==fq)return false;
    if(fc!=="todas"&&g.categoria!==fc)return false;
    if(fDesde&&g.fecha<fDesde)return false;
    if(fHasta&&g.fecha>fHasta)return false;
    return true;
  });
  const totalFil=fil.reduce((s,g)=>s+g.monto,0);
  const totalPorCat={};fil.forEach(g=>{totalPorCat[g.categoria]=(totalPorCat[g.categoria]||0)+g.monto;});
  const catsFil=Object.entries(totalPorCat).sort((a,b)=>b[1]-a[1]);
  return(
    <div>
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        {["todos","el","ella"].map(q=><button key={q} onClick={()=>setFq(q)} style={{flex:1,padding:"8px 6px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:13,background:fq===q?COLORS.lilaDeep:COLORS.lavanda,color:fq===q?"#fff":COLORS.lilaDeep}}>{q}</button>)}
      </div>
      <select value={fc} onChange={e=>setFc(e.target.value)} style={{width:"100%",padding:"10px 14px",borderRadius:12,border:`1.5px solid ${COLORS.border}`,background:COLORS.bg,color:COLORS.text,fontSize:14,fontFamily:"'Nunito',sans-serif",marginBottom:10}}>
        <option value="todas">Todas las categorias</option>
        {cats.map(c=><option key={c}>{c}</option>)}
      </select>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <Inp label="Desde" type="date" value={fDesde} onChange={e=>setFDesde(e.target.value)} style={{marginBottom:0}}/>
        <Inp label="Hasta" type="date" value={fHasta} onChange={e=>setFHasta(e.target.value)} style={{marginBottom:0}}/>
      </div>
      {(fDesde||fHasta||fc!=="todas"||fq!=="todos")&&(
        <Card style={{background:COLORS.lavanda,marginBottom:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:catsFil.length>1?10:0}}>
            <span style={{fontSize:13,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{fil.length} gastos</span>
            <span style={{fontSize:16,fontWeight:900,color:COLORS.danger,fontFamily:"'Playfair Display',serif"}}>{fmt(totalFil)}</span>
          </div>
          {catsFil.length>1&&(
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {catsFil.map(([cat,monto])=>(
                <div key={cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"3px 0",borderBottom:`1px solid ${COLORS.border}`}}>
                  <span style={{fontSize:12,color:COLORS.text,fontFamily:"'Nunito',sans-serif",fontWeight:600}}>{cat}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{Math.round(monto/totalFil*100)}%</span>
                    <span style={{fontSize:13,fontWeight:700,color:COLORS.danger,fontFamily:"'Playfair Display',serif"}}>{fmt(monto)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      {(fDesde||fHasta)&&<button onClick={()=>{setFDesde("");setFHasta("");}} style={{background:"none",border:"none",cursor:"pointer",color:COLORS.lilaDeep,fontFamily:"'Nunito',sans-serif",fontSize:13,fontWeight:700,marginBottom:10}}>Limpiar fechas x</button>}
      {fil.map(g=>(
        <Card key={g.id}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div>
              <div style={{fontWeight:700,fontSize:14,color:COLORS.text,fontFamily:"'Nunito',sans-serif"}}>{g.descripcion}</div>
              {g.nota&&<div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",fontStyle:"italic"}}>{g.nota}</div>}
              <div style={{display:"flex",gap:6,marginTop:5,flexWrap:"wrap"}}>
                <Badge>{g.categoria}</Badge>
                <Badge color={g.quien==="el"?"#D4C5F0":COLORS.rosa} textColor={g.quien==="el"?COLORS.lilaDeep:"#B0003A"}>{g.quien}</Badge>
                <span style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>{g.fecha}</span>
              </div>
            </div>
            <div style={{fontWeight:900,fontSize:15,color:COLORS.danger,fontFamily:"'Playfair Display',serif"}}>-{fmt(g.monto)}</div>
          </div>
        </Card>
      ))}
      {fil.length===0&&<div style={{textAlign:"center",color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",padding:"40px 0"}}>Sin gastos con ese filtro</div>}
    </div>
  );
}

// ---- TAB CONFIG ----
function TabConfig({data,saveData}){
  const cats=data.categorias||CATS_DEFAULT;
  const pres=data.presupuestos||{};
  const porc=data.porcentajes||{};
  const tarjetas=data.tarjetas||[];
  const mf=data.mesFinanciero||{};
  const [ep,setEp]=useState({...pres});
  const [epo,setEpo]=useState({...porc});
  const [nc,setNc]=useState("");
  const [nt,setNt]=useState(tarjetas.map(t=>t.nombre));
  const [ntc,setNtc]=useState(tarjetas.map(t=>({diaCierre:t.diaCierre||"",diaVencimiento:t.diaVencimiento||""})));
  const [correccion,setCorreccion]=useState(mf.correccionManual||"");
  const [saved,setSaved]=useState("");
  const [ajusteMonto,setAjusteMonto]=useState("");
  const [ajusteDesc,setAjusteDesc]=useState("");
  const [showCierreMes,setShowCierreMes]=useState(false);
  const [tcEdit,setTcEdit]=useState({blue:data.tipoCambio?.blue||"",oficial:data.tipoCambio?.oficial||"",tarjeta:data.tipoCambio?.tarjeta||"",bbva:data.tipoCambio?.bbva||""});
  const ok=(k)=>{setSaved(k);setTimeout(()=>setSaved(""),2000);};
  const ti=(data.ingresos||[]).reduce((s,i)=>s+i.monto,0);

  return(
    <div>
      {mf.inicio&&(
        <Card style={{background:COLORS.lavanda}}>
          <T>Mes financiero</T>
          <div style={{fontSize:14,color:COLORS.text,fontFamily:"'Nunito',sans-serif",marginBottom:4}}>Calculado: {fmtFecha(mf.inicio)} al {fmtFecha(mf.fin)}</div>
          <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:12}}>Basado en el 4to dia habil despues del 1. Feriados de {mf.feriadosAnio||""}.</div>
          <Inp label="Correccion manual (fecha de inicio)" type="date" value={correccion} onChange={e=>setCorreccion(e.target.value)}/>
          <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:10}}>Solo si el automatico no fue correcto este mes.</div>
          <Btn onClick={()=>{saveData({mesFinanciero:{...mf,correccionManual:correccion}});ok("mf");}} style={{width:"100%",justifyContent:"center"}}>{saved==="mf"?"Guardado!":"Aplicar correccion"}</Btn>
        </Card>
      )}
      <Card>
        <T>Categorias y presupuestos</T>
        {ti>0&&<div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:10}}>Ingresos del mes: {fmt(ti)} - Los porcentajes se calculan sobre este valor.</div>}
        <div style={{display:"flex",gap:6,padding:"4px 0",marginBottom:6}}>
          <div style={{flex:1,fontSize:11,fontWeight:700,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif"}}>Categoria</div>
          <div style={{width:100,fontSize:11,fontWeight:700,color:COLORS.textLight,textAlign:"center",fontFamily:"'Nunito',sans-serif"}}>Monto fijo ($)</div>
          <div style={{width:70,fontSize:11,fontWeight:700,color:COLORS.textLight,textAlign:"center",fontFamily:"'Nunito',sans-serif"}}>% ingreso</div>
          <div style={{width:24}}/>
        </div>
        {cats.map(cat=>(
          <div key={cat} style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
            <div style={{flex:1,fontSize:13,fontWeight:600,color:COLORS.text,fontFamily:"'Nunito',sans-serif"}}>{cat}{epo[cat]>0?<span style={{fontSize:11,color:COLORS.lilaDeep}}> ({fmt(Math.round(ti*(epo[cat]/100)))})</span>:""}</div>
            <input type="number" value={ep[cat]||""} onChange={e=>setEp(p=>({...p,[cat]:e.target.value}))} placeholder="$" disabled={epo[cat]>0} style={{width:100,padding:"7px 8px",borderRadius:10,border:`1.5px solid ${COLORS.border}`,background:epo[cat]>0?"#eee":COLORS.bg,color:COLORS.text,fontSize:13,fontFamily:"'Nunito',sans-serif",textAlign:"right",opacity:epo[cat]>0?0.5:1}}/>
            <input type="number" value={epo[cat]||""} onChange={e=>setEpo(p=>({...p,[cat]:e.target.value}))} placeholder="%" min="0" max="100" style={{width:70,padding:"7px 8px",borderRadius:10,border:`1.5px solid ${COLORS.lila}`,background:COLORS.lilaLight,color:COLORS.lilaDeep,fontSize:13,fontFamily:"'Nunito',sans-serif",textAlign:"center",fontWeight:700}}/>
            <button onClick={()=>{const nc2=cats.filter(c=>c!==cat);const p2={...pres};const po2={...porc};delete p2[cat];delete po2[cat];saveData({categorias:nc2,presupuestos:p2,porcentajes:po2});const e2={...ep};const eo2={...epo};delete e2[cat];delete eo2[cat];setEp(e2);setEpo(eo2);}} style={{background:"none",border:"none",cursor:"pointer",color:COLORS.danger,fontSize:15,fontWeight:700}}>x</button>
          </div>
        ))}
        <div style={{fontSize:11,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:10}}>Completa "% ingreso" para presupuesto dinamico. Si tenes ambos, se usa el porcentaje.</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <input value={nc} onChange={e=>setNc(e.target.value)} placeholder="Nueva categoria..." style={{flex:1,padding:"9px 12px",borderRadius:10,border:`1.5px solid ${COLORS.border}`,background:COLORS.bg,color:COLORS.text,fontSize:13,fontFamily:"'Nunito',sans-serif",outline:"none"}}/>
          <Btn small onClick={()=>{if(!nc.trim())return;saveData({categorias:[...cats,nc.trim()],presupuestos:{...pres,[nc.trim()]:0}});setEp(p=>({...p,[nc.trim()]:0}));setEpo(p=>({...p,[nc.trim()]:0}));setNc("");}}>+ Agregar</Btn>
        </div>
        <Btn onClick={()=>{const p={};const po={};cats.forEach(c=>{p[c]=parseFloat(ep[c])||0;po[c]=parseFloat(epo[c])||0;});saveData({presupuestos:p,porcentajes:po});ok("p");}} style={{width:"100%",justifyContent:"center"}}>{saved==="p"?"Guardado!":"Guardar presupuestos"}</Btn>
      </Card>
      <Card>
        <T>Tipo de cambio</T>
        <div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:10}}>Blue y oficial se actualizan automaticamente. Carga el valor BBVA manualmente cuando quieras.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          {[["Blue","blue","#F5D78A"],["Oficial","oficial",COLORS.mint],["Tarjeta","tarjeta",COLORS.lilaLight],["BBVA","bbva","#D4C5F0"]].map(([l,k,bg])=>(
            <div key={k} style={{background:bg,borderRadius:12,padding:"8px 12px"}}>
              <div style={{fontSize:11,fontWeight:700,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:4}}>USD {l}</div>
              <input type="number" value={tcEdit[k]||""} onChange={e=>setTcEdit(t=>({...t,[k]:e.target.value}))} placeholder="0" style={{width:"100%",padding:"6px 8px",borderRadius:8,border:`1.5px solid ${COLORS.border}`,background:"rgba(255,255,255,0.7)",color:COLORS.text,fontSize:14,fontFamily:"'Nunito',sans-serif",fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
            </div>
          ))}
        </div>
        <Btn onClick={()=>{const hora=new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});const hoy=new Date().toLocaleDateString("es-AR");saveData({tipoCambio:{...data.tipoCambio,blue:parseFloat(tcEdit.blue)||data.tipoCambio?.blue||0,oficial:parseFloat(tcEdit.oficial)||data.tipoCambio?.oficial||0,tarjeta:parseFloat(tcEdit.tarjeta)||data.tipoCambio?.tarjeta||0,bbva:parseFloat(tcEdit.bbva)||data.tipoCambio?.bbva||0,ultimaActualizacion:`${hoy} ${hora} (manual)`}});ok("tc");}} style={{width:"100%",justifyContent:"center",marginBottom:8}}>{saved==="tc"?"Guardado!":"Guardar tipo de cambio"}</Btn>
      </Card>
      <Card>
        <T>Ajuste de saldo</T>
        <div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:10}}>Para corregir el balance sin registrar un gasto o ingreso. Queda en el historial como ajuste.</div>
        <Inp label="Monto ($) - positivo suma, negativo resta" type="number" value={ajusteMonto} onChange={e=>setAjusteMonto(e.target.value)} placeholder="Ej: 5000 o -3000"/>
        <Inp label="Descripcion" value={ajusteDesc} onChange={e=>setAjusteDesc(e.target.value)} placeholder="Ej: Corrección apertura de mes"/>
        <Btn onClick={()=>{if(!ajusteMonto)return;const aj={id:Date.now(),descripcion:ajusteDesc||"Ajuste de saldo",monto:Math.abs(parseFloat(ajusteMonto)),tipo:parseFloat(ajusteMonto)>=0?"ingreso":"gasto",categoria:"Ajuste",fecha:new Date().toISOString().split("T")[0],quien:"ajuste",esAjuste:true};if(parseFloat(ajusteMonto)>=0){saveData({ingresos:[aj,...(data.ingresos||[])]});}else{saveData({gastos:[aj,...(data.gastos||[])]});}setAjusteMonto("");setAjusteDesc("");ok("aj");}} style={{width:"100%",justifyContent:"center"}}>{saved==="aj"?"Guardado!":"Aplicar ajuste"}</Btn>
      </Card>
      <Card style={{background:COLORS.peach,border:`1.5px solid ${COLORS.warning}`}}>
        <T>Cierre de mes</T>
        <div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:12}}>Archiva los gastos e ingresos del mes actual, reinicia las barras y guarda el sobrante como saldo acumulado.</div>
        {!showCierreMes?(
          <Btn onClick={()=>setShowCierreMes(true)} style={{width:"100%",justifyContent:"center",background:"#E8A020",color:"#fff"}}>Cerrar mes financiero</Btn>
        ):(
          <div>
            <div style={{fontSize:14,fontWeight:700,color:COLORS.text,fontFamily:"'Nunito',sans-serif",marginBottom:8}}>
              Resumen del mes:
            </div>
            <div style={{fontSize:13,color:COLORS.text,fontFamily:"'Nunito',sans-serif",marginBottom:4}}>Ingresos: {fmt((data.ingresos||[]).reduce((s,i)=>s+i.monto,0))}</div>
            <div style={{fontSize:13,color:COLORS.text,fontFamily:"'Nunito',sans-serif",marginBottom:4}}>Gastos: {fmt((data.gastos||[]).reduce((s,g)=>s+g.monto,0))}</div>
            <div style={{fontSize:15,fontWeight:800,color:COLORS.text,fontFamily:"'Playfair Display',serif",marginBottom:14}}>
              Sobrante: {fmt((data.ingresos||[]).reduce((s,i)=>s+i.monto,0)-(data.gastos||[]).reduce((s,g)=>s+g.monto,0))}
            </div>
            <div style={{fontSize:12,color:COLORS.textLight,fontFamily:"'Nunito',sans-serif",marginBottom:12}}>
              El sobrante quedara como saldo acumulado en el proximo mes.
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn onClick={()=>{
                const ti=(data.ingresos||[]).reduce((s,i)=>s+i.monto,0);
                const tg=(data.gastos||[]).reduce((s,g)=>s+g.monto,0);
                const sobrante=ti-tg;
                const mf=data.mesFinanciero||{};
                const archivo={mes:mf.mes,anio:mf.anio,inicio:mf.inicio,fin:mf.fin,ingresos:data.ingresos||[],gastos:data.gastos||[],totalIngresos:ti,totalGastos:tg,sobrante};
                const histMeses=[archivo,...(data.historialMeses||[])];
                // Sobrante como ingreso especial del nuevo mes
                const ingresoSobrante=sobrante!==0?[{id:Date.now(),descripcion:`Sobrante mes anterior (${mf.mes||""}/${mf.anio||""})`,monto:Math.abs(sobrante),categoria:"Ajuste",fecha:new Date().toISOString().split("T")[0],quien:"ajuste",esAjuste:true,esSobrante:true,esNegativo:sobrante<0}]:[];
                saveData({gastos:[],ingresos:sobrante>0?ingresoSobrante:sobrante<0?[]:[], historialMeses:histMeses});
                if(sobrante<0){
                  // Si sobro negativo, registrar como gasto de ajuste
                  saveData({gastos:[{id:Date.now()+1,descripcion:`Deficit mes anterior (${mf.mes||""}/${mf.anio||""})`,monto:Math.abs(sobrante),categoria:"Ajuste",fecha:new Date().toISOString().split("T")[0],quien:"ajuste",esAjuste:true}],ingresos:[],historialMeses:histMeses});
                }
                setShowCierreMes(false);ok("mes");
              }} variant="success" style={{flex:1,justifyContent:"center"}}>Confirmar cierre</Btn>
              <Btn variant="secondary" onClick={()=>setShowCierreMes(false)} style={{flex:1,justifyContent:"center"}}>Cancelar</Btn>
            </div>
          </div>
        )}
      </Card>
      <Card>
        <T>Tarjetas</T>
        {tarjetas.map((t,i)=>(
          <div key={t.id} style={{marginBottom:14,paddingBottom:14,borderBottom:i<tarjetas.length-1?`1px solid ${COLORS.border}`:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{width:14,height:14,borderRadius:"50%",background:t.color,flexShrink:0}}/>
              <input value={nt[i]||""} onChange={e=>{const n=[...nt];n[i]=e.target.value;setNt(n);}} style={{flex:1,padding:"9px 12px",borderRadius:10,border:`1.5px solid ${COLORS.border}`,background:COLORS.bg,color:COLORS.text,fontSize:14,fontFamily:"'Nunito',sans-serif",outline:"none"}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div>
                <label style={{display:"block",fontSize:12,fontWeight:700,color:COLORS.textLight,marginBottom:4,fontFamily:"'Nunito',sans-serif"}}>Dia de cierre</label>
                <input type="number" value={ntc[i]?.diaCierre||""} onChange={e=>{const n=[...ntc];n[i]={...n[i],diaCierre:e.target.value};setNtc(n);}} placeholder="Ej: 20" style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${COLORS.border}`,background:COLORS.bg,color:COLORS.text,fontSize:14,fontFamily:"'Nunito',sans-serif",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:12,fontWeight:700,color:COLORS.textLight,marginBottom:4,fontFamily:"'Nunito',sans-serif"}}>Dia de vencimiento</label>
                <input type="number" value={ntc[i]?.diaVencimiento||""} onChange={e=>{const n=[...ntc];n[i]={...n[i],diaVencimiento:e.target.value};setNtc(n);}} placeholder="Ej: 10" style={{width:"100%",padding:"9px 12px",borderRadius:10,border:`1.5px solid ${COLORS.border}`,background:COLORS.bg,color:COLORS.text,fontSize:14,fontFamily:"'Nunito',sans-serif",outline:"none",boxSizing:"border-box"}}/>
              </div>
            </div>
          </div>
        ))}
        <Btn onClick={()=>{saveData({tarjetas:tarjetas.map((t,i)=>({...t,nombre:nt[i]||t.nombre,diaCierre:parseInt(ntc[i]?.diaCierre)||t.diaCierre||0,diaVencimiento:parseInt(ntc[i]?.diaVencimiento)||t.diaVencimiento||0}))});ok("t");}} style={{width:"100%",justifyContent:"center"}}>{saved==="t"?"Guardado!":"Guardar cambios"}</Btn>
      </Card>
    </div>
  );
}

// ---- APP PRINCIPAL ----
const TABS=[
  {id:"resumen",label:"Resumen"},{id:"gastos",label:"Gastos"},
  {id:"tarjetas",label:"Tarjetas"},{id:"auto",label:"Auto"},
  {id:"ahorros",label:"Ahorros"},{id:"mayorista",label:"Mayorista"},
  {id:"historial",label:"Historial"},{id:"config",label:"Config"},
];

export default function App(){
  const [user,setUser]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [data,setData]=useState(null);
  const [online,setOnline]=useState(navigator.onLine);
  const [activeTab,setActiveTab]=useState("resumen");
  const dataRef=useRef(null);

  useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setAuthLoading(false);}),[]);
  useEffect(()=>{
    const on=()=>setOnline(true),off=()=>setOnline(false);
    window.addEventListener("online",on);window.addEventListener("offline",off);
    return()=>{window.removeEventListener("online",on);window.removeEventListener("offline",off);};
  },[]);

  const fetchTipoCambio=useCallback(async(save,tcActual)=>{
    try{
      const [rBlue,rOficial]=await Promise.all([
        fetch("https://dolarapi.com/v1/dolares/blue"),
        fetch("https://dolarapi.com/v1/dolares/oficial"),
      ]);
      const jBlue=await rBlue.json();
      const jOficial=await rOficial.json();
      const blue=jBlue?.venta||0;
      const oficial=jOficial?.venta||0;
      const tarjeta=Math.round(oficial*1.6);
      const hora=new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
      const hoy=new Date().toLocaleDateString("es-AR");
      // Conservar bbva si ya estaba cargado manualmente
      const bbva=tcActual?.bbva||0;
      save({tipoCambio:{blue,tarjeta,oficial,bbva,ultimaActualizacion:`${hoy} ${hora}`}});
    }catch(e){console.log("Sin tipo de cambio",e);}
  },[]);

  const actualizarMesFinanciero=useCallback(async(currentData,save)=>{
    const hoy=new Date();
    const mes=hoy.getMonth()+1;
    const anio=hoy.getFullYear();
    const mf=currentData.mesFinanciero||{};
    // Solo recalcular si cambia el mes o no hay datos
    if(mf.mes===mes&&mf.anio===anio&&mf.inicio)return;
    let feriados=mf.feriados||[];
    let feriadosAnio=mf.feriadosAnio||0;
    if(feriadosAnio!==anio){
      feriados=await fetchFeriados(anio);
      feriadosAnio=anio;
    }
    const {inicio,fin}=calcularMesFinanciero(anio,mes,feriados);
    // Si hay correccion manual del mes actual, usarla como inicio
    const inicioFinal=mf.correccionManual&&mf.mes===mes&&mf.anio===anio?mf.correccionManual:inicio;
    save({mesFinanciero:{...mf,inicio:inicioFinal,fin,mes,anio,feriados,feriadosAnio,correccionManual:""}});
  },[]);

  useEffect(()=>{
    if(!user)return;
    const ref=doc(db,"familias","principal");
    return onSnapshot(ref,snap=>{
      if(snap.exists()){
        const d={...DATA_INICIAL,...snap.data()};
        setData(d);
        dataRef.current=d;
      }else{
        setDoc(ref,DATA_INICIAL,{merge:true});
        setData(DATA_INICIAL);
        dataRef.current=DATA_INICIAL;
      }
    });
  },[user]);

  const saveData=useCallback(async(cambios)=>{
    const current=dataRef.current;
    if(!current)return;
    const ref=doc(db,"familias","principal");
    const nuevo={...current,...cambios};
    setData(nuevo);
    dataRef.current=nuevo;
    await setDoc(ref,nuevo,{merge:true});
  },[]);

  // Actualizar dolar y mes financiero al cargar
  useEffect(()=>{
    if(!data||!saveData)return;
    const ultimo=data.tipoCambio?.ultimaActualizacion;
    const hace30min=Date.now()-30*60*1000;
    if(!ultimo||new Date(ultimo).getTime()<hace30min)fetchTipoCambio(saveData,data.tipoCambio);
    actualizarMesFinanciero(data,saveData);
    const interval=setInterval(()=>fetchTipoCambio(saveData,dataRef.current?.tipoCambio),30*60*1000);
    return()=>clearInterval(interval);
  },[!!data]);

  if(authLoading)return<div style={{minHeight:"100vh",background:"#F7F3FF",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#9B72CF",fontFamily:"'Nunito',sans-serif",fontWeight:700}}>Cargando...</div></div>;
  if(!user)return<Login/>;
  if(!data)return<div style={{minHeight:"100vh",background:"#F7F3FF",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{color:"#9B72CF",fontFamily:"'Nunito',sans-serif",fontWeight:700}}>Sincronizando...</div></div>;

  return(
    <div style={{minHeight:"100vh",background:COLORS.bg}}>
      <div style={{background:`linear-gradient(135deg, ${COLORS.lilaDeep} 0%, #B08FDB 100%)`,padding:"18px 18px 14px",position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:"rgba(255,255,255,0.7)",fontSize:11,fontWeight:600,fontFamily:"'Nunito',sans-serif"}}>Presupuesto</div>
            <div style={{color:"#fff",fontSize:20,fontWeight:900,fontFamily:"'Playfair Display',serif"}}>Casa</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{background:"rgba(255,255,255,0.15)",borderRadius:10,padding:"5px 12px",display:"flex",alignItems:"center",gap:6}}>
              <div style={{width:7,height:7,borderRadius:"50%",background:online?"#7DC9A8":"#F5D78A"}}/>
              <span style={{color:"#fff",fontSize:11,fontWeight:700,fontFamily:"'Nunito',sans-serif"}}>{online?"Sync":"Offline"}</span>
            </div>
            <button onClick={()=>signOut(auth)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:10,padding:"5px 10px",color:"rgba(255,255,255,0.8)",cursor:"pointer",fontSize:13,fontFamily:"'Nunito',sans-serif"}}>Salir</button>
          </div>
        </div>
        <div style={{display:"flex",gap:5,marginTop:14,overflowX:"auto",paddingBottom:2}}>
          {TABS.map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{flexShrink:0,padding:"7px 12px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"'Nunito',sans-serif",fontWeight:700,fontSize:12,background:activeTab===tab.id?"#fff":"rgba(255,255,255,0.18)",color:activeTab===tab.id?COLORS.lilaDeep:"rgba(255,255,255,0.85)",transition:"all 0.2s"}}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{padding:"16px 14px 100px",maxWidth:480,margin:"0 auto"}}>
        {activeTab==="resumen"   &&<TabResumen    data={data}/>}
        {activeTab==="gastos"    &&<TabGastos     data={data} saveData={saveData}/>}
        {activeTab==="tarjetas"  &&<TabTarjetas   data={data} saveData={saveData}/>}
        {activeTab==="auto"      &&<TabAuto       data={data} saveData={saveData}/>}
        {activeTab==="ahorros"   &&<TabAhorros    data={data} saveData={saveData}/>}
        {activeTab==="mayorista" &&<TabMayorista  data={data} saveData={saveData}/>}
        {activeTab==="historial" &&<TabHistorial  data={data}/>}
        {activeTab==="config"    &&<TabConfig     data={data} saveData={saveData}/>}
      </div>
    </div>
  );
}
