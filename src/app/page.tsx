"use client";
export const dynamic = "force-dynamic";
import { useState, useCallback, useRef, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import BarcodeScanner from "./BarcodeScanner";
import AuthModal from "./AuthModal";
import NameCorrectionModal from "./NameCorrectionModal";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

const CATEGORIES = [
  "식품·음료","주류","생활용품","의약품·건강","화장품·뷰티",
  "의류·패션","전자·가전","문구·완구","반려동물","스포츠·레저",
  "도서·음반","외식·배달","교통·주유","기타",
] as const;
type Category = (typeof CATEGORIES)[number];

interface Item {
  name: string; qty: number; unit_price: number; total: number;
  store: string; date: string; _src: string; category: Category;
}
interface FileEntry {
  id: string; name: string;
  status: "pending"|"processing"|"done"|"error";
  items: Item[];
}
interface ItemStat {
  name: string; min: number; max: number; avg: number; last: number;
  bestStore: string; bestStorePrice: number;
  totalSpent: number; cnt: number; category: Category;
  records: { date: string; store: string; price: number; total: number }[];
}
interface Toast { id: number; msg: string; type: "ok"|"err"|"info"; }
interface PriceAlert { itemName: string; targetPrice: number; }
interface NotifySettings { email: string; alerts: PriceAlert[]; }

const COLORS = ["#378ADD","#1D9E75","#D85A30","#BA7517","#533AB7","#D4537E","#639922","#E24B4A","#888780","#0F6E56","#5DCAA5","#F09595","#FAC775","#B4B2A9"];
const CAT_COLORS: Record<string, string> = {
  "식품·음료":"#1D9E75","주류":"#D85A30","생활용품":"#378ADD","의약품·건강":"#E24B4A",
  "화장품·뷰티":"#D4537E","의류·패션":"#533AB7","전자·가전":"#185FA5","문구·완구":"#BA7517",
  "반려동물":"#639922","스포츠·레저":"#0F6E56","도서·음반":"#888780","외식·배달":"#D85A30",
  "교통·주유":"#5F5E5A","기타":"#B4B2A9",
};
const LS_KEY = "receipt_items_v2";
const LS_NOTIFY = "receipt_notify_v1";

function n(v: unknown): number { return Number(v)||0; }

function badgeStyle(s: string): React.CSSProperties {
  const m: Record<string,[string,string]> = {
    done:["#EAF3DE","#3B6D11"], processing:["#E6F1FB","#185FA5"],
    error:["#FCEBEB","#A32D2D"], pending:["#FAEEDA","#854F0B"],
  };
  const [bg,color] = m[s]??m.pending;
  return { fontSize:11, padding:"2px 8px", borderRadius:999, fontWeight:600, background:bg, color, whiteSpace:"nowrap" };
}
function navBtn(active: boolean): React.CSSProperties {
  return {
    fontSize:13, padding:"6px 14px", borderRadius:8, cursor:"pointer",
    border: active?"1px solid #ccc":"1px solid transparent",
    background: active?"#f3f3f3":"transparent",
    fontWeight: active?600:400, color: active?"#222":"#666",
  };
}
function rTagStyle(cls: string): React.CSSProperties {
  const m: Record<string,[string,string]> = {
    best:["#EAF3DE","#3B6D11"], near:["#E6F1FB","#185FA5"], high:["#FAEEDA","#854F0B"],
  };
  const [bg,color] = m[cls]??m.high;
  return { fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, display:"inline-block", marginBottom:6, background:bg, color };
}
const secT: React.CSSProperties = { fontSize:12, fontWeight:600, color:"#888", textTransform:"uppercase", letterSpacing:".05em", marginBottom:10 };
const card: React.CSSProperties = { background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:12, padding:"14px 16px" };

function toB64(file: File): Promise<string> {
  return new Promise((res,rej) => {
    const r = new FileReader();
    r.onload = () => res((r.result as string).split(",")[1]);
    r.onerror = () => rej(new Error("FileReader 오류"));
    r.readAsDataURL(file);
  });
}

function calcStats(items: Item[]): Record<string, ItemStat> {
  const map: Record<string,{
    name:string; category:Category;
    records:{date:string;store:string;price:number;total:number}[];
    storeMin:Record<string,number>;
  }> = {};
  items.forEach(item => {
    const k = item.name||"기타";
    if (!map[k]) map[k] = { name:k, category:item.category||"기타", records:[], storeMin:{} };
    const up = n(item.unit_price)||(n(item.total)/Math.max(n(item.qty),1));
    map[k].records.push({ date:item.date, store:item.store, price:up, total:n(item.total) });
    if (!map[k].storeMin[item.store]||up<map[k].storeMin[item.store]) map[k].storeMin[item.store]=up;
  });
  const res: Record<string,ItemStat> = {};
  Object.entries(map).forEach(([k,d]) => {
    const prices = d.records.map(r=>r.price).filter(p=>p>0);
    if (!prices.length) return;
    const sorted = [...d.records].sort((a,b)=>a.date>b.date?1:-1);
    const bestS = Object.entries(d.storeMin).sort((a,b)=>a[1]-b[1])[0];
    res[k] = {
      name:k, category:d.category,
      min:Math.min(...prices), max:Math.max(...prices),
      avg:prices.reduce((a,b)=>a+b,0)/prices.length,
      last:sorted.at(-1)?.price??0,
      bestStore:bestS?.[0]??"", bestStorePrice:bestS?.[1]??0,
      totalSpent:d.records.reduce((s,r)=>s+r.total,0),
      cnt:d.records.length, records:d.records,
    };
  });
  return res;
}

function exportCSV(items: Item[]) {
  const bom = "\uFEFF";
  const header = ["일자","품목","카테고리","구매처","수량","단가","합계","출처파일"];
  const rows = items.map(i=>[
    i.date, i.name, i.category, i.store, i.qty,
    n(i.unit_price)||Math.round(n(i.total)/Math.max(n(i.qty),1)),
    n(i.total), i._src,
  ]);
  const csv = bom+[header,...rows].map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));
  a.download = `구매이력_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function MetricCard({ label, value, color, sub }: { label:string; value:string; color?:string; sub?:string }) {
  return (
    <div style={{ background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:10, padding:"12px 14px" }}>
      <div style={{ fontSize:11, color:"#888", marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:700, color:color??"#222" }}>{value}</div>
      {sub&&<div style={{ fontSize:11, color:"#aaa", marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function RecCard({ stat, onSetAlert, currentAlert }: { stat:ItemStat; onSetAlert:(name:string)=>void; currentAlert?:number }) {
  const ratio = stat.min>0?(stat.last-stat.min)/stat.min:0;
  const cls = ratio<=0.05?"best":ratio<=0.15?"near":"high";
  const tag = cls==="best"?"✅ 최저가 수준":cls==="near"?"🟡 최저가 근접":"🔴 고가 구매 중";
  const hint = cls==="best"?"지금이 재구매 적기입니다!":
    cls==="near"?`최저가(${Math.round(stat.min).toLocaleString()}원) 구매처 확인 후 구매 추천`:
    `최저가 대비 ${Math.round(ratio*100)}% 비쌈 — 조금 더 기다리세요.`;
  const range = stat.max-stat.min||1;
  const avgPct = Math.min(100,Math.round(((stat.avg-stat.min)/range)*100));
  const lastPct = Math.min(100,Math.round(((stat.last-stat.min)/range)*100));
  return (
    <div style={{ ...card, borderLeft:`3px solid ${cls==="best"?"#3B6D11":cls==="near"?"#378ADD":"#D85A30"}` }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
        <div style={rTagStyle(cls)}>{tag}</div>
        <div style={{ fontSize:10, padding:"2px 7px", borderRadius:999, background:CAT_COLORS[stat.category]+"22", color:CAT_COLORS[stat.category], fontWeight:600 }}>{stat.category}</div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <div style={{ fontSize:14, fontWeight:600 }}>{stat.name}</div>
        <button
          onClick={()=>onSetAlert(stat.name)}
          style={{
            fontSize:10, padding:"3px 8px", borderRadius:6, cursor:"pointer",
            border:"1px solid "+(currentAlert?"#3B6D11":"#ddd"),
            background:currentAlert?"#EAF3DE":"#fff",
            color:currentAlert?"#3B6D11":"#666", fontWeight:600
          }}
        >
          🔔 {currentAlert?`${currentAlert.toLocaleString()}원`:"알림 설정"}
        </button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:5, marginBottom:8 }}>
        {([["최저가",stat.min,"#3B6D11"],["평균가",stat.avg,"#185FA5"],["최근 구매가",stat.last,"#D85A30"]] as [string,number,string][]).map(([l,v,c])=>(
          <div key={l} style={{ background:"#f8f8f8", borderRadius:6, padding:"5px 7px" }}>
            <div style={{ fontSize:10, color:"#888" }}>{l}</div>
            <div style={{ fontSize:12, fontWeight:600, color:c }}>{Math.round(v).toLocaleString()}원</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:11, color:"#666", marginBottom:8 }}>
        최저가 구매처: <strong style={{ color:"#222" }}>{stat.bestStore}</strong> ({Math.round(stat.bestStorePrice).toLocaleString()}원)
      </div>
      <div style={{ fontSize:10, color:"#aaa", display:"flex", justifyContent:"space-between", marginBottom:2 }}>
        <span style={{ color:"#3B6D11" }}>{Math.round(stat.min).toLocaleString()}</span>
        <span>가격 범위</span>
        <span style={{ color:"#A32D2D" }}>{Math.round(stat.max).toLocaleString()}</span>
      </div>
      <div style={{ height:5, background:"#eee", borderRadius:999, position:"relative" }}>
        <div style={{ position:"absolute", left:`${avgPct}%`, top:-3, width:2, height:11, background:"#378ADD", borderRadius:1 }}/>
        <div style={{ position:"absolute", left:`${lastPct}%`, top:-3, width:2, height:11, background:"#D85A30", borderRadius:1 }}/>
      </div>
      <div style={{ display:"flex", gap:10, marginTop:5, fontSize:10, color:"#888" }}>
        <span><span style={{ display:"inline-block", width:8, height:8, background:"#378ADD", borderRadius:"50%", marginRight:2 }}/>평균</span>
        <span><span style={{ display:"inline-block", width:8, height:8, background:"#D85A30", borderRadius:"50%", marginRight:2 }}/>최근</span>
      </div>
      <div style={{ fontSize:11, color:"#888", marginTop:6 }}>{hint}</div>
    </div>
  );
}

function ToastBar({ toasts }: { toasts:Toast[] }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position:"fixed", bottom:24, right:24, display:"flex", flexDirection:"column", gap:8, zIndex:9999 }}>
      {toasts.map(t=>(
        <div key={t.id} style={{
          padding:"10px 16px", borderRadius:8, fontSize:13, fontWeight:500, maxWidth:280,
          background:t.type==="ok"?"#EAF3DE":t.type==="err"?"#FCEBEB":"#E6F1FB",
          color:t.type==="ok"?"#3B6D11":t.type==="err"?"#A32D2D":"#185FA5",
          boxShadow:"0 2px 12px rgba(0,0,0,0.12)",
        }}>{t.msg}</div>
      ))}
    </div>
  );
}

function NotifyModal({ notify, setNotify, onClose, onSave, stats }: {
  notify: NotifySettings;
  setNotify: (n: NotifySettings) => void;
  onClose: () => void;
  onSave: () => void;
  stats: Record<string, ItemStat>;
}) {
  const [email, setEmail] = useState(notify.email);
  const [alerts, setAlerts] = useState<PriceAlert[]>(notify.alerts);

  const removeAlert = (name: string) => setAlerts(alerts.filter(a => a.itemName !== name));
  const updateAlert = (name: string, price: number) => {
    const exists = alerts.find(a => a.itemName === name);
    if (exists) setAlerts(alerts.map(a => a.itemName === name ? { ...a, targetPrice: price } : a));
    else setAlerts([...alerts, { itemName: name, targetPrice: price }]);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:12, padding:24, maxWidth:500, width:"100%", maxHeight:"80vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <h2 style={{ fontSize:18, fontWeight:600, marginBottom:12 }}>🔔 가격 알림 설정</h2>
        <p style={{ fontSize:12, color:"#666", marginBottom:16 }}>목표가 이하로 구매 시 이메일 알림이 발송됩니다.</p>

        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:"#666", display:"block", marginBottom:4 }}>알림 받을 이메일</label>
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #ccc", fontSize:13 }}
          />
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ fontSize:12, color:"#666", display:"block", marginBottom:8 }}>품목별 목표가</label>
          {Object.values(stats).length === 0 ? (
            <p style={{ fontSize:12, color:"#aaa" }}>먼저 영수증을 분석해주세요.</p>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6, maxHeight:280, overflowY:"auto" }}>
              {Object.values(stats).map(s => {
                const alert = alerts.find(a => a.itemName === s.name);
                return (
                  <div key={s.name} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 8px", background:"#f8f8f8", borderRadius:6 }}>
                    <span style={{ flex:1, fontSize:13 }}>{s.name}</span>
                    <span style={{ fontSize:11, color:"#888" }}>최저 {Math.round(s.min).toLocaleString()}원</span>
                    <input
                      type="number"
                      value={alert?.targetPrice ?? ""}
                      onChange={e=>{
                        const v = Number(e.target.value);
                        if (v > 0) updateAlert(s.name, v);
                        else removeAlert(s.name);
                      }}
                      placeholder="목표가"
                      style={{ width:90, padding:"4px 6px", borderRadius:4, border:"1px solid #ccc", fontSize:12 }}
                    />
                    <span style={{ fontSize:11, color:"#666" }}>원</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ padding:"8px 16px", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontSize:13 }}>취소</button>
          <button
            onClick={()=>{ setNotify({ email, alerts }); onSave(); }}
            style={{ padding:"8px 16px", borderRadius:8, border:"none", background:"#3B6D11", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}
          >저장</button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [tab, setTab] = useState("overview");
  const [trendItem, setTrendItem] = useState<string|null>(null);
  const [catFilter, setCatFilter] = useState<Category|"전체">("전체");
  const [histSearch, setHistSearch] = useState("");
  const [histStore, setHistStore] = useState("");
  const [histCat, setHistCat] = useState<Category|"전체">("전체");
  const [histSort, setHistSort] = useState("date_desc");
  const [drag, setDrag] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notify, setNotify] = useState<NotifySettings>({ email: "", alerts: [] });
  const [showNotify, setShowNotify] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tid = useRef(0);

  function toast(msg:string, type:Toast["type"]="info") {
    const id = ++tid.current;
    setToasts(prev=>[...prev,{id,msg,type}]);
    setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),3500);
  }

  useEffect(()=>{
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved:Item[] = JSON.parse(raw);
        if (Array.isArray(saved)&&saved.length>0) {
          setAllItems(saved);
          toast(`저장된 이력 ${saved.length}건 불러왔습니다`,"info");
        }
      }
    } catch {}
    try {
      const rawNotify = localStorage.getItem(LS_NOTIFY);
      if (rawNotify) setNotify(JSON.parse(rawNotify));
    } catch {}
    setLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(()=>{
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  },[]);

  // 로그인 시 Supabase에서 이력 불러오기
  useEffect(()=>{
    if (!user) return;
    supabase.from("items").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          const loaded: Item[] = data.map((r: Record<string, unknown>) => ({
            name: String(r.name||""), qty: Number(r.qty||1),
            unit_price: Number(r.unit_price||0), total: Number(r.total||0),
            store: String(r.store||""), date: String(r.date||""),
            _src: String(r.src||""), category: (r.category as Item["category"])||"기타",
          }));
          setAllItems(loaded);
          toast(`클라우드에서 ${loaded.length}건 불러왔습니다`, "info");
        }
      });
  },[user]);

  useEffect(()=>{
    if (!loaded) return;
    try { localStorage.setItem(LS_KEY,JSON.stringify(allItems)); } catch {}
  },[allItems,loaded]);

  useEffect(()=>{
    if (!loaded) return;
    try { localStorage.setItem(LS_NOTIFY, JSON.stringify(notify)); } catch {}
  }, [notify, loaded]);

  const addFiles = useCallback((fs:File[])=>{
    const entries = fs.filter(f=>f.type.startsWith("image/"))
      .map(f=>({ id:Math.random().toString(36).slice(2), name:f.name, status:"pending" as const, items:[], _file:f }));
    setFiles(prev=>[...prev,...entries]);
  },[]);

  const handleBarcodeScan = useCallback(async (barcode: string) => {
    setShowScanner(false);
    toast("바코드 조회 중...", "info");
    try {
      const resp = await fetch("/api/barcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode }),
      });
      const json = await resp.json();
      if (json.success) {
        const newItem: Item = {
          name: json.data.name, qty: 1, unit_price: 0, total: 0,
          store: "수동 등록", date: new Date().toISOString().slice(0, 10),
          _src: `barcode_${barcode}`, category: "기타",
        };
        setAllItems((prev) => [...prev, newItem]);
        toast(`"${json.data.name}" 추가됨`, "ok");
      } else toast("바코드 조회 실패", "err");
    } catch (e) { console.error(e); toast("바코드 조회 오류", "err"); }
  }, []);

  const sendAlert = useCallback(async (matched: { name: string; target: number; current: number; store: string; date: string }[]) => {
    if (!notify.email || matched.length === 0) return;
    try {
      const resp = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: notify.email, items: matched }),
      });
      const json = await resp.json();
      if (resp.ok && json.success) {
        toast(`${matched.length}건 목표가 알림 이메일 발송!`, "ok");
      } else {
        toast("알림 발송 실패: " + (json.error || ""), "err");
      }
    } catch (e) {
      console.error(e);
      toast("알림 발송 오류", "err");
    }
  }, [notify.email]);

  const analyzeAll = useCallback(async ()=>{
    const pending = files.filter(f=>f.status==="pending");
    if (!pending.length) return;
    setFiles(prev=>prev.map(f=>f.status==="pending"?{...f,status:"processing" as const}:f));
    let ok=0, err=0;
    const results: Record<string,{status:"done"|"error";items:Item[]}> = {};
    await Promise.all(pending.map(async entry=>{
      const file = (entry as typeof entry & {_file:File})._file;
      try {
        const b64 = await toB64(file);
        const resp = await fetch("/api/ocr",{
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({image:b64,mediaType:file.type}),
        });
        const json = await resp.json();
        if (!resp.ok||!json.success) throw new Error(json.error||"API 오류");
        const {store,date:rd,items} = json.data;
        results[entry.id] = {
          status:"done",
          items:(items||[]).map((it:Omit<Item,"store"|"_src">)=>({
            ...it,
            store:store||"알 수 없음",
            date:it.date||rd||"unknown",
            _src:entry.name,
            category:it.category||"기타",
          })),
        };
        ok++;
      } catch(e) {
        results[entry.id]={status:"error",items:[]}; err++;
        console.error(e);
      }
    }));
    setFiles(prev=>prev.map(f=>results[f.id]?{...f,...results[f.id]}:f));
    setAllItems(prev=>[...prev,...Object.values(results).flatMap(r=>r.items)]);
    if (ok>0) toast(`${ok}장 분석 완료!`,"ok");
    if (err>0) toast(`${err}장 실패 — API 키를 확인하세요`,"err");

    // 로그인 상태면 Supabase에 저장
    if (user) {
      const newItems = Object.values(results).flatMap(r => r.items);
      const rows = newItems.map(item => ({
        user_id: user.id,
        family_code: null,
        name: item.name, qty: item.qty,
        unit_price: item.unit_price, total: item.total,
        store: item.store, date: item.date,
        src: item._src, category: item.category,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from("items").insert(rows);
        if (!error) toast("클라우드 저장 완료!", "ok");
        else console.error("Supabase 저장 오류:", error);
      }
    }

    const newItems = Object.values(results).flatMap(r => r.items);
    const matched = newItems
      .map(item => {
        const alert = notify.alerts.find(a => a.itemName === item.name);
        if (!alert) return null;
        const up = n(item.unit_price) || (n(item.total) / Math.max(n(item.qty), 1));
        if (up > alert.targetPrice) return null;
        return { name: item.name, target: alert.targetPrice, current: Math.round(up), store: item.store, date: item.date };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
    if (matched.length > 0) await sendAlert(matched);
  },[files, notify.alerts, sendAlert]);

  const deleteFile = (id:string)=>{
    const e = files.find(f=>f.id===id);
    if (e) setAllItems(prev=>prev.filter(i=>i._src!==e.name));
    setFiles(prev=>prev.filter(f=>f.id!==id));
  };
  const deleteItem = async (idx:number) => {
    if (user) {
      const item = allItems[idx];
      await supabase.from("items").delete()
        .eq("user_id", user.id).eq("name", item.name).eq("date", item.date).eq("store", item.store).limit(1);
    }
    setAllItems(prev=>prev.filter((_,i)=>i!==idx));
  };
  const clearAll = async () => {
    if (!confirm("저장된 모든 구매 이력을 삭제할까요?")) return;
    if (user) await supabase.from("items").delete().eq("user_id", user.id);
    setAllItems([]); setFiles([]);
    toast("전체 이력을 삭제했습니다","info");
  };

  const stats = calcStats(allItems);
  const kinds = Object.keys(stats).length;
  const stores = Array.from(new Set(allItems.map(i=>i.store))).length;
  const total = allItems.reduce((s,i)=>s+n(i.total),0);
  const saveable = allItems.reduce((s,item)=>{
    const st=stats[item.name]; if (!st) return s;
    const up=n(item.unit_price)||(n(item.total)/Math.max(n(item.qty),1));
    return up>st.min?s+(up-st.min)*n(item.qty||1):s;
  },0);

  const byCat = CATEGORIES.map(cat=>{
    const catItems = allItems.filter(i=>i.category===cat);
    return { name:cat, value:Math.round(catItems.reduce((s,i)=>s+n(i.total),0)), count:catItems.length };
  }).filter(c=>c.value>0).sort((a,b)=>b.value-a.value);

  const filteredStats = Object.values(stats).filter(s=>catFilter==="전체"||s.category===catFilter);

  const byName = Object.entries(allItems.reduce<Record<string,number>>((a,i)=>{ a[i.name]=(a[i.name]||0)+n(i.total); return a; },{}))
    .sort((a,b)=>b[1]-a[1]).slice(0,10);
  const byStore = Object.entries(allItems.reduce<Record<string,number>>((a,i)=>{ a[i.store]=(a[i.store]||0)+n(i.total); return a; },{}))
    .sort((a,b)=>b[1]-a[1]);

  const trendName = trendItem??Object.keys(stats)[0];
  const trendRecs = trendName
    ? (stats[trendName]?.records??[]).filter(r=>r.date&&r.date!=="unknown"&&r.price>0).sort((a,b)=>a.date>b.date?1:-1)
    : [];
  const trendStores = Array.from(new Set(trendRecs.map(r=>r.store)));
  const trendMin = trendRecs.length?Math.min(...trendRecs.map(r=>r.price)):0;
  const trendData = Array.from(new Set(trendRecs.map(r=>r.date))).sort().map(date=>{
    const obj:Record<string,string|number> = {date};
    trendStores.forEach(st=>{
      const rec = trendRecs.find(r=>r.date===date&&r.store===st);
      if (rec) obj[st]=Math.round(rec.price);
    });
    return obj;
  });

  const histItems = allItems
    .filter(i=>{
      const kw=histSearch.toLowerCase();
      return (!kw||i.name.toLowerCase().includes(kw)||i.store.toLowerCase().includes(kw))
        &&(!histStore||i.store===histStore)
        &&(histCat==="전체"||i.category===histCat);
    })
    .sort((a,b)=>{
      if (histSort==="date_desc") return a.date<b.date?1:-1;
      if (histSort==="date_asc") return a.date>b.date?1:-1;
      if (histSort==="price_asc") return n(a.unit_price)-n(b.unit_price);
      return n(b.unit_price)-n(a.unit_price);
    });

  const storeMap = allItems.reduce<Record<string,{total:number;items:string[];cnt:number}>>((a,i)=>{
    if (!a[i.store]) a[i.store]={total:0,items:[],cnt:0};
    a[i.store].total+=n(i.total);
    if (!a[i.store].items.includes(i.name)) a[i.store].items.push(i.name);
    a[i.store].cnt++; return a;
  },{});

  const pending = files.filter(f=>f.status==="pending").length;
  const hasDash = allItems.length>0;
  const TABS = ["overview","category","repurchase","trend","stores","history"];
  const LABELS:Record<string,string> = {
    overview:"📊 개요", category:"🏷 카테고리", repurchase:"🎯 재구매 추천",
    trend:"📈 가격 변동", stores:"🏪 구매처", history:"📋 전체 이력"
  };
  const fmt = (v:unknown)=>v!==undefined?Number(v).toLocaleString()+"원":"";

  const setAlertForItem = (name: string) => {
    setShowNotify(true);
  };

  return (
    <div style={{ maxWidth:960, margin:"0 auto", padding:"1.5rem 1rem" }}>
      <ToastBar toasts={toasts}/>
      {showAuth && <AuthModal onClose={()=>setShowAuth(false)}/>}
      {showCorrection && <NameCorrectionModal onClose={()=>setShowCorrection(false)}/>}
      {showScanner && (
        <BarcodeScanner onScan={handleBarcodeScan} onClose={()=>setShowScanner(false)}/>
      )}
      {showNotify && (
        <NotifyModal
          notify={notify}
          setNotify={setNotify}
          onClose={()=>setShowNotify(false)}
          onSave={()=>{ setShowNotify(false); toast("알림 설정 저장완료","ok"); }}
          stats={stats}
        />
      )}

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8, marginBottom:16 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:600, margin:0 }}>스마트 재구매 대시보드</h1>
          <p style={{ fontSize:13, color:"#666", marginTop:4 }}>영수증 사진으로 구매처·가격 이력 추적 및 최저가 재구매 타이밍 분석</p>
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          {user ? (
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:11, color:"#888" }}>{user.email}</span>
              <button onClick={()=>setShowCorrection(true)} style={{ fontSize:12, padding:"6px 12px", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontWeight:600 }}>✏️ 품명보정</button>
              <button onClick={()=>supabase.auth.signOut()} style={{ fontSize:12, padding:"6px 12px", borderRadius:8, border:"1px solid #fcc", background:"#fff9f9", cursor:"pointer", color:"#c00", fontWeight:600 }}>로그아웃</button>
            </div>
          ) : (
            <button onClick={()=>setShowAuth(true)} style={{ fontSize:12, padding:"6px 12px", borderRadius:8, border:"1px solid #3B6D11", background:"#EAF3DE", cursor:"pointer", fontWeight:600, color:"#3B6D11" }}>🔐 로그인</button>
          )}
          <button onClick={()=>setShowScanner(true)} style={{ fontSize:12, padding:"6px 12px", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontWeight:600 }}>
            📷 바코드 스캔
          </button>
          <button onClick={()=>setShowNotify(true)} style={{ fontSize:12, padding:"6px 12px", borderRadius:8, border:"1px solid "+(notify.alerts.length>0?"#3B6D11":"#ddd"), background:notify.alerts.length>0?"#EAF3DE":"#fff", cursor:"pointer", fontWeight:600, color:notify.alerts.length>0?"#3B6D11":"#222" }}>
            🔔 가격 알림{notify.alerts.length>0?` (${notify.alerts.length})`:""}
          </button>
          {hasDash&&(
            <>
              <button onClick={()=>exportCSV(allItems)} style={{ fontSize:12, padding:"6px 12px", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontWeight:600 }}>
                ⬇ CSV 내보내기
              </button>
              <button onClick={clearAll} style={{ fontSize:12, padding:"6px 12px", borderRadius:8, border:"1px solid #fcc", background:"#fff9f9", cursor:"pointer", color:"#c00", fontWeight:600 }}>
                🗑 전체 삭제
              </button>
            </>
          )}
        </div>
      </div>

      <div
        style={{ border:"1.5px dashed #ccc", borderRadius:12, padding:"2rem", textAlign:"center", cursor:"pointer", background:drag?"#f5f5f5":"#fff" }}
        onClick={()=>fileRef.current?.click()}
        onDragOver={e=>{e.preventDefault();setDrag(true);}}
        onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);addFiles(Array.from(e.dataTransfer.files));}}
      >
        <div style={{ fontSize:28, marginBottom:6 }}>📄</div>
        <strong>영수증 사진 업로드</strong>
        <p style={{ fontSize:12, color:"#888", marginTop:4 }}>클릭 또는 드래그 · JPG / PNG / WEBP · 다량 가능</p>
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:"none" }}
        onChange={e=>addFiles(Array.from(e.target.files??[]))}/>

      {files.map(f=>(
        <div key={f.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:"#fff", border:"0.5px solid #e5e5e5", borderRadius:8, marginTop:6, fontSize:13 }}>
          <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
          <span style={badgeStyle(f.status)}>{{ pending:"대기", processing:"분석중...", done:"완료", error:"오류" }[f.status]}</span>
          <button style={{ background:"none", border:"none", cursor:"pointer", color:"#ccc", fontSize:13 }} onClick={()=>deleteFile(f.id)}>✕</button>
        </div>
      ))}

      <button
        style={{ padding:"10px 0", width:"100%", marginTop:10, border:"1px solid #ddd", borderRadius:8, background:"#fff", fontSize:14, fontWeight:600, cursor:pending===0?"not-allowed":"pointer", opacity:pending===0?0.4:1 }}
        disabled={pending===0} onClick={analyzeAll}
      >
        AI 분석 시작{pending>0?` (${pending}장)`:""}
      </button>

      {hasDash&&(
        <>
          <div style={{ display:"flex", gap:4, marginTop:24, borderBottom:"1px solid #eee", paddingBottom:8, flexWrap:"wrap" }}>
            {TABS.map(t=><button key={t} style={navBtn(tab===t)} onClick={()=>setTab(t)}>{LABELS[t]}</button>)}
          </div>

          {tab==="overview"&&(
            <>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginTop:16 }}>
                <MetricCard label="총 지출" value={Math.round(total).toLocaleString()+"원"}/>
                <MetricCard label="품목 종류" value={String(kinds)}/>
                <MetricCard label="구매처 수" value={String(stores)}/>
                <MetricCard label="절약 가능" value={saveable>0?"~"+Math.round(saveable).toLocaleString()+"원":"절약 중 👍"} color="#3B6D11"/>
              </div>
              <div style={{ marginTop:20 }}>
                <div style={secT}>품목별 총 지출 (상위 10)</div>
                <div style={{ ...card, overflowX:"auto" }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={byName.map(([name,value])=>({name,value}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="name" tick={{fontSize:11}} interval={0} angle={-20} textAnchor="end" height={48}/>
                      <YAxis tick={{fontSize:11}} tickFormatter={v=>v.toLocaleString()}/>
                      <Tooltip formatter={fmt}/>
                      <Bar dataKey="value" radius={[4,4,0,0]}>{byName.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{ marginTop:20 }}>
                <div style={secT}>구매처별 총 지출</div>
                <div style={card}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={byStore.map(([name,value])=>({name,value}))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="name" tick={{fontSize:11}}/>
                      <YAxis tick={{fontSize:11}} tickFormatter={v=>v.toLocaleString()}/>
                      <Tooltip formatter={fmt}/>
                      <Bar dataKey="value" radius={[4,4,0,0]}>{byStore.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {tab==="category"&&(
            <>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginTop:16 }}>
                {byCat.slice(0,4).map(c=>(
                  <MetricCard key={c.name} label={c.name} value={c.value.toLocaleString()+"원"} color={CAT_COLORS[c.name]} sub={c.count+"건"}/>
                ))}
              </div>
              <div style={{ marginTop:20 }}>
                <div style={secT}>카테고리별 지출 비율</div>
                <div style={card}>
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={byCat} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" outerRadius={100}
                        label={({name,percent}:{name?:string;percent?:number})=>
                          name&&percent!==undefined&&percent>0.04?`${name} ${Math.round(percent*100)}%`:""}
                      >
                        {byCat.map(c=><Cell key={c.name} fill={CAT_COLORS[c.name]}/>)}
                      </Pie>
                      <Tooltip formatter={fmt}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div style={{ marginTop:20 }}>
                <div style={secT}>카테고리별 상세</div>
                <div style={{ ...card, overflowX:"auto" }}>
                  <ResponsiveContainer width="100%" height={Math.max(200,byCat.length*36+60)}>
                    <BarChart data={byCat} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis type="number" tick={{fontSize:11}} tickFormatter={v=>v.toLocaleString()}/>
                      <YAxis type="category" dataKey="name" tick={{fontSize:11}} width={90}/>
                      <Tooltip formatter={fmt}/>
                      <Bar dataKey="value" radius={[0,4,4,0]}>
                        {byCat.map(c=><Cell key={c.name} fill={CAT_COLORS[c.name]}/>)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {tab==="repurchase"&&(
            <div style={{ marginTop:20 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10, flexWrap:"wrap", gap:8 }}>
                <div style={secT}>재구매 추천 — 최저가 기준 분석</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {(["전체",...CATEGORIES] as (Category|"전체")[]).map(cat=>(
                    <button key={cat} onClick={()=>setCatFilter(cat)} style={{
                      fontSize:11, padding:"3px 10px", borderRadius:999, border:"1px solid #ddd",
                      cursor:"pointer", fontWeight:catFilter===cat?700:400,
                      background:catFilter===cat?(cat==="전체"?"#222":CAT_COLORS[cat]):"#fff",
                      color:catFilter===cat?"#fff":"#555",
                    }}>{cat}</button>
                  ))}
                </div>
              </div>
              {filteredStats.length===0
                ? <div style={{ textAlign:"center", color:"#aaa", padding:"2rem", fontSize:13 }}>해당 카테고리의 항목이 없습니다</div>
                : <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:10 }}>
                    {filteredStats.sort((a,b)=>b.totalSpent-a.totalSpent).map(s=>{
                      const alert = notify.alerts.find(a => a.itemName === s.name);
                      return <RecCard key={s.name} stat={s} onSetAlert={setAlertForItem} currentAlert={alert?.targetPrice}/>;
                    })}
                  </div>
              }
            </div>
          )}

          {tab==="trend"&&(
            <div style={{ marginTop:20 }}>
              <div style={secT}>품목별 가격 변동 추이</div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
                {Object.keys(stats).map(name=>(
                  <button key={name} onClick={()=>setTrendItem(name)} style={{
                    fontSize:12, padding:"4px 12px", borderRadius:8, border:"1px solid #ddd", cursor:"pointer",
                    background:trendName===name?"#f0f0f0":"#fff", fontWeight:trendName===name?600:400,
                  }}>{name}</button>
                ))}
              </div>
              <div style={card}>
                {trendData.length>0?(
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                      <XAxis dataKey="date" tick={{fontSize:11}}/>
                      <YAxis tick={{fontSize:11}} tickFormatter={v=>v.toLocaleString()}/>
                      <Tooltip formatter={fmt}/>
                      <Legend/>
                      {trendMin>0&&<ReferenceLine y={trendMin} stroke="#3B6D11" strokeDasharray="4 3" label={{value:"최저가",fontSize:11,fill:"#3B6D11"}}/>}
                      {trendStores.map((st,i)=>(
                        <Line key={st} type="monotone" dataKey={st} stroke={COLORS[i%COLORS.length]} strokeWidth={2} dot={{r:5}} connectNulls/>
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ):(
                  <p style={{ textAlign:"center", color:"#aaa", padding:"2rem", fontSize:13 }}>날짜 정보가 있는 데이터가 필요합니다</p>
                )}
                {trendStores.length>0&&(
                  <div style={{ fontSize:12, color:"#888", marginTop:8, display:"flex", gap:12, flexWrap:"wrap" }}>
                    {trendStores.map((st,i)=>{
                      const pts=trendRecs.filter(r=>r.store===st);
                      const mn=Math.min(...pts.map(r=>r.price));
                      return <span key={st}><strong style={{color:COLORS[i%COLORS.length]}}>{st}</strong> 최저 {Math.round(mn).toLocaleString()}원</span>;
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab==="stores"&&(
            <>
              <div style={{ marginTop:20 }}>
                <div style={secT}>구매처 요약</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10 }}>
                  {Object.entries(storeMap).sort((a,b)=>b[1].total-a[1].total).map(([nm,d])=>(
                    <div key={nm} style={{ background:"#f8f8f8", border:"0.5px solid #e5e5e5", borderRadius:10, padding:"11px 13px" }}>
                      <div style={{ fontSize:13, fontWeight:600, marginBottom:6 }}>🏪 {nm}</div>
                      {([["총 지출",Math.round(d.total).toLocaleString()+"원"],["구매 횟수",d.cnt+"회"],["취급 품목",d.items.length+"종"]] as [string,string][]).map(([l,v])=>(
                        <div key={l} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#666", marginTop:3 }}>
                          <span>{l}</span><span style={{ fontWeight:600, color:"#222" }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop:20 }}>
                <div style={secT}>구매처별 비율</div>
                <div style={card}>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={Object.entries(storeMap).map(([name,d])=>({name,value:Math.round(d.total)}))}
                        dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                        label={({name,percent}:{name?:string;percent?:number})=>name&&percent!==undefined?`${name} ${Math.round(percent*100)}%`:""}
                      >
                        {Object.keys(storeMap).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                      </Pie>
                      <Tooltip formatter={fmt}/>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {tab==="history"&&(
            <div style={{ marginTop:20 }}>
              <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
                <input style={{ flex:1, minWidth:130, padding:"6px 10px", borderRadius:8, border:"0.5px solid #ccc", fontSize:13 }}
                  placeholder="품목·구매처 검색..." value={histSearch} onChange={e=>setHistSearch(e.target.value)}/>
                <select style={{ padding:"5px 8px", borderRadius:8, border:"0.5px solid #ccc", fontSize:12 }} value={histCat} onChange={e=>setHistCat(e.target.value as Category|"전체")}>
                  <option value="전체">전체 카테고리</option>
                  {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                <select style={{ padding:"5px 8px", borderRadius:8, border:"0.5px solid #ccc", fontSize:12 }} value={histStore} onChange={e=>setHistStore(e.target.value)}>
                  <option value="">전체 구매처</option>
                  {Array.from(new Set(allItems.map(i=>i.store))).map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <select style={{ padding:"5px 8px", borderRadius:8, border:"0.5px solid #ccc", fontSize:12 }} value={histSort} onChange={e=>setHistSort(e.target.value)}>
                  <option value="date_desc">최신순</option>
                  <option value="date_asc">오래된순</option>
                  <option value="price_asc">단가 낮은순</option>
                  <option value="price_desc">단가 높은순</option>
                </select>
                <span style={{ fontSize:12, color:"#888" }}>{histItems.length}건</span>
              </div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr>{["일자","품목","카테고리","구매처","수량","단가","합계",""].map(h=>(
                      <th key={h} style={{ textAlign:"left", padding:"6px 8px", color:"#888", fontWeight:600, borderBottom:"1px solid #eee", whiteSpace:"nowrap" }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {histItems.length===0?(
                      <tr><td colSpan={8} style={{ textAlign:"center", color:"#aaa", padding:"2rem", fontSize:13 }}>항목이 없습니다</td></tr>
                    ):histItems.map(item=>{
                      const idx=allItems.indexOf(item);
                      const st=stats[item.name];
                      const up=n(item.unit_price)||(n(item.total)/Math.max(n(item.qty||1),1));
                      const isMin=st&&Math.abs(up-st.min)<1;
                      return (
                        <tr key={idx} style={{ background:isMin?"#f0faf0":undefined }}>
                          <td style={{ padding:"7px 8px", borderBottom:"1px solid #f3f3f3" }}>{item.date||"-"}</td>
                          <td style={{ padding:"7px 8px", borderBottom:"1px solid #f3f3f3" }}>
                            {item.name||"-"}
                            {isMin&&<span style={{ fontSize:10, background:"#EAF3DE", color:"#3B6D11", padding:"1px 6px", borderRadius:999, fontWeight:700, marginLeft:4 }}>최저가</span>}
                          </td>
                          <td style={{ padding:"7px 8px", borderBottom:"1px solid #f3f3f3" }}>
                            <span style={{ fontSize:10, padding:"2px 7px", borderRadius:999, fontWeight:600, background:CAT_COLORS[item.category]+"22", color:CAT_COLORS[item.category] }}>{item.category}</span>
                          </td>
                          <td style={{ padding:"7px 8px", borderBottom:"1px solid #f3f3f3" }}>
                            <span style={{ fontSize:11, background:"#f0f0f0", padding:"2px 7px", borderRadius:999 }}>{item.store}</span>
                          </td>
                          <td style={{ padding:"7px 8px", borderBottom:"1px solid #f3f3f3" }}>{n(item.qty)||1}</td>
                          <td style={{ padding:"7px 8px", borderBottom:"1px solid #f3f3f3", textAlign:"right" }}>{Math.round(up).toLocaleString()}</td>
                          <td style={{ padding:"7px 8px", borderBottom:"1px solid #f3f3f3", textAlign:"right" }}>{Math.round(n(item.total)).toLocaleString()}</td>
                          <td style={{ padding:"7px 8px", borderBottom:"1px solid #f3f3f3" }}>
                            <button style={{ background:"none", border:"none", cursor:"pointer", color:"#ccc", fontSize:13 }} onClick={()=>deleteItem(idx)}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
