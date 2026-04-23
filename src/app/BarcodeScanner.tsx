"use client";
import { useEffect, useRef, useState } from "react";

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const [error, setError] = useState<string>("");
  const [manualCode, setManualCode] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animRef = useRef<number>(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    stoppedRef.current = false;

    const stop = () => {
      stoppedRef.current = true;
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };

    const start = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/library");
        const reader = new BrowserMultiFormatReader();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stoppedRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const scan = () => {
          if (stoppedRef.current || !videoRef.current) return;
          reader.decodeFromVideoElement(videoRef.current)
            .then(result => {
              if (!stoppedRef.current) { stop(); onScan(result.getText()); }
            })
            .catch(() => { animRef.current = requestAnimationFrame(scan); });
        };
        animRef.current = requestAnimationFrame(scan);
      } catch (e) {
        setError("카메라 접근 실패: " + (e instanceof Error ? e.message : String(e)));
      }
    };

    start();
    return () => {
      stoppedRef.current = true;
      cancelAnimationFrame(animRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [onScan]);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:12, padding:20, maxWidth:500, width:"100%" }} onClick={e=>e.stopPropagation()}>
        <h2 style={{ fontSize:18, fontWeight:600, marginBottom:12 }}>📷 바코드 스캔</h2>
        <div style={{ position:"relative", width:"100%", marginBottom:12, borderRadius:8, overflow:"hidden", background:"#000" }}>
          <video ref={videoRef} style={{ width:"100%", display:"block" }} muted playsInline/>
          <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center", pointerEvents:"none" }}>
            <div style={{ width:260, height:120, border:"2px solid #3B6D11", borderRadius:6, boxShadow:"0 0 0 9999px rgba(0,0,0,0.4)" }}/>
          </div>
        </div>
        {error && <div style={{ padding:10, background:"#FCEBEB", color:"#A32D2D", borderRadius:8, fontSize:12, marginBottom:12 }}>{error}</div>}
        <div style={{ fontSize:12, color:"#888", marginBottom:8 }}>또는 바코드 번호 직접 입력</div>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <input value={manualCode} onChange={e=>setManualCode(e.target.value)}
            onKeyDown={e=>{ if (e.key==="Enter" && manualCode) onScan(manualCode); }}
            placeholder="8801234567890"
            style={{ flex:1, padding:"8px 10px", borderRadius:8, border:"1px solid #ccc", fontSize:13 }}/>
          <button onClick={()=>{ if (manualCode) onScan(manualCode); }}
            style={{ padding:"8px 14px", borderRadius:8, border:"none", background:"#3B6D11", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>조회</button>
        </div>
        <button onClick={onClose} style={{ width:"100%", padding:"8px 16px", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontSize:13 }}>닫기</button>
      </div>
    </div>
  );
}
