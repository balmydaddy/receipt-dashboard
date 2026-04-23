"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

interface Correction { id: string; raw_name: string; clean_name: string; }
interface Props { onClose: () => void; }

export default function NameCorrectionModal({ onClose }: Props) {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [raw, setRaw] = useState("");
  const [clean, setClean] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("name_corrections").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setCorrections(data); });
  }, []);

  const add = async () => {
    if (!raw || !clean) return;
    setLoading(true);
    const { error } = await supabase.from("name_corrections")
      .upsert({ raw_name: raw.trim(), clean_name: clean.trim() }, { onConflict: "raw_name" });
    if (!error) {
      setCorrections(prev => [{ id: Date.now().toString(), raw_name: raw, clean_name: clean }, ...prev.filter(c => c.raw_name !== raw)]);
      setRaw(""); setClean(""); setMsg("저장완료!");
      setTimeout(() => setMsg(""), 2000);
    }
    setLoading(false);
  };

  const remove = async (id: string, rawName: string) => {
    await supabase.from("name_corrections").delete().eq("raw_name", rawName);
    setCorrections(prev => prev.filter(c => c.id !== id));
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:12, padding:24, maxWidth:500, width:"100%", maxHeight:"80vh", overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
        <h2 style={{ fontSize:18, fontWeight:600, marginBottom:8 }}>✏️ 품명 보정 사전</h2>
        <p style={{ fontSize:12, color:"#666", marginBottom:16 }}>영수증 약어/오인식 품명을 올바른 품명으로 매핑합니다.</p>

        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
          <input value={raw} onChange={e=>setRaw(e.target.value)} placeholder="영수증 원본 (예: 매일카피속모카)"
            style={{ flex:1, padding:"8px 10px", borderRadius:8, border:"1px solid #ccc", fontSize:13 }}/>
          <span style={{ display:"flex", alignItems:"center", color:"#888" }}>→</span>
          <input value={clean} onChange={e=>setClean(e.target.value)} placeholder="정제 품명 (예: 매일 카피아토 모카)"
            style={{ flex:1, padding:"8px 10px", borderRadius:8, border:"1px solid #ccc", fontSize:13 }}/>
          <button onClick={add} disabled={loading} style={{ padding:"8px 12px", borderRadius:8, border:"none", background:"#3B6D11", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>추가</button>
        </div>

        {msg && <div style={{ padding:"6px 10px", borderRadius:6, background:"#EAF3DE", color:"#3B6D11", fontSize:12, marginBottom:8 }}>{msg}</div>}

        <div style={{ maxHeight:320, overflowY:"auto" }}>
          {corrections.length === 0
            ? <p style={{ fontSize:12, color:"#aaa", textAlign:"center", padding:"1rem" }}>보정 데이터가 없습니다</p>
            : corrections.map(c => (
              <div key={c.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 8px", background:"#f8f8f8", borderRadius:6, marginBottom:4 }}>
                <span style={{ flex:1, fontSize:12, color:"#888" }}>{c.raw_name}</span>
                <span style={{ color:"#aaa" }}>→</span>
                <span style={{ flex:1, fontSize:12, fontWeight:600 }}>{c.clean_name}</span>
                <button onClick={()=>remove(c.id, c.raw_name)} style={{ background:"none", border:"none", cursor:"pointer", color:"#ccc", fontSize:13 }}>✕</button>
              </div>
            ))
          }
        </div>

        <button onClick={onClose} style={{ width:"100%", padding:"8px", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontSize:13, marginTop:12 }}>닫기</button>
      </div>
    </div>
  );
}
