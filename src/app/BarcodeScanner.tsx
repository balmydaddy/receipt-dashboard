"use client";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

export default function BarcodeScanner({ onScan, onClose }: Props) {
  const [error, setError] = useState<string>("");
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const elementId = "barcode-reader";
    const start = async () => {
      if (startedRef.current) return;
      startedRef.current = true;
      try {
        const html5Qr = new Html5Qrcode(elementId);
        scannerRef.current = html5Qr;
        await html5Qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decoded) => {
            html5Qr.stop().then(() => { scannerRef.current = null; onScan(decoded); });
          },
          () => {}
        );
      } catch (e) {
        setError("카메라 접근 실패: " + (e instanceof Error ? e.message : String(e)));
      }
    };
    start();
    return () => {
      if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null; }
    };
  }, [onScan]);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:10001, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={onClose}>
      <div style={{ background:"#fff", borderRadius:12, padding:20, maxWidth:500, width:"100%" }} onClick={e=>e.stopPropagation()}>
        <h2 style={{ fontSize:18, fontWeight:600, marginBottom:12 }}>📷 바코드 스캔</h2>
        <div id="barcode-reader" style={{ width:"100%", marginBottom:12 }}/>
        {error && <div style={{ padding:10, background:"#FCEBEB", color:"#A32D2D", borderRadius:8, fontSize:12, marginBottom:12 }}>{error}</div>}
        <div style={{ fontSize:12, color:"#888", marginBottom:8 }}>또는 바코드 번호 직접 입력</div>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <input value={manualCode} onChange={e=>setManualCode(e.target.value)} placeholder="8801234567890"
            style={{ flex:1, padding:"8px 10px", borderRadius:8, border:"1px solid #ccc", fontSize:13 }}/>
          <button onClick={()=>{ if (manualCode) onScan(manualCode); }}
            style={{ padding:"8px 14px", borderRadius:8, border:"none", background:"#3B6D11", color:"#fff", cursor:"pointer", fontSize:13, fontWeight:600 }}>조회</button>
        </div>
        <button onClick={onClose} style={{ width:"100%", padding:"8px 16px", borderRadius:8, border:"1px solid #ddd", background:"#fff", cursor:"pointer", fontSize:13 }}>닫기</button>
      </div>
    </div>
  );
}
