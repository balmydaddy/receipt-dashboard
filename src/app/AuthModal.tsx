"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

interface Props { onClose: () => void; }

export default function AuthModal({ onClose }: Props) {
  const [mode, setMode] = useState<"login"|"signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleSubmit = async () => {
    setLoading(true); setMsg("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          const code = familyCode || Math.random().toString(36).slice(2, 8).toUpperCase();
          await supabase.from("profiles").insert({
            id: data.user.id, email, name,
            family_code: code,
          });
          setMsg(`가입 완료! 가족 코드: ${code} (메모해두세요)`);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onClose();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "오류 발생");
    }
    setLoading(false);
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:10000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:12, padding:24, maxWidth:400, width:"100%" }} onClick={e=>e.stopPropagation()}>
        <h2 style={{ fontSize:18, fontWeight:600, marginBottom:16 }}>
          {mode === "login" ? "🔐 로그인" : "✏️ 회원가입"}
        </h2>

        <div style={{ display:"flex", gap:8, marginBottom:16 }}>
          {(["login","signup"] as const).map(m=>(
            <button key={m} onClick={()=>setMode(m)} style={{
              flex:1, padding:"8px", borderRadius:8, cursor:"pointer",
              border:"1px solid "+(mode===m?"#3B6D11":"#ddd"),
              background:mode===m?"#EAF3DE":"#fff",
              color:mode===m?"#3B6D11":"#666", fontWeight:mode===m?600:400, fontSize:13,
            }}>{m==="login"?"로그인":"회원가입"}</button>
          ))}
        </div>

        {[
          ...(mode==="signup"?[{label:"이름", val:name, set:setName, type:"text", ph:"홍길동"}]:[]),
          {label:"이메일", val:email, set:setEmail, type:"email", ph:"your@email.com"},
          {label:"비밀번호", val:password, set:setPassword, type:"password", ph:"6자 이상"},
          ...(mode==="signup"?[{label:"가족 코드 (선택)", val:familyCode, set:setFamilyCode, type:"text", ph:"있으면 입력, 없으면 자동 생성"}]:[]),
        ].map(f=>(
          <div key={f.label} style={{ marginBottom:12 }}>
            <label style={{ fontSize:12, color:"#666", display:"block", marginBottom:4 }}>{f.label}</label>
            <input type={f.type} value={f.val} onChange={e=>f.set(e.target.value)}
              placeholder={f.ph} onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
              style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:"1px solid #ccc", fontSize:13 }}/>
          </div>
        ))}

        {msg && <div style={{ padding:10, borderRadius:8, fontSize:12, marginBottom:12,
          background:msg.includes("완료")?"#EAF3DE":"#FCEBEB",
          color:msg.includes("완료")?"#3B6D11":"#A32D2D" }}>{msg}</div>}

        <button onClick={handleSubmit} disabled={loading} style={{
          width:"100%", padding:"10px", borderRadius:8, border:"none",
          background:"#3B6D11", color:"#fff", cursor:"pointer", fontSize:14, fontWeight:600,
        }}>{loading?"처리중...":(mode==="login"?"로그인":"가입하기")}</button>

        <button onClick={onClose} style={{ width:"100%", padding:"8px", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontSize:13, marginTop:8 }}>닫기</button>
      </div>
    </div>
  );
}
