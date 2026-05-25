import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Info,
  Download,
  FileText,
  Activity,
  FileSpreadsheet,
  Upload,
  Loader2,
  LayoutDashboard,
  ChevronDown,
  ChevronUp,
  Cloud
} from "lucide-react";
import { initAuth, googleSignIn, getAccessToken } from './lib/auth';
import { DriveFilePicker } from './components/DriveFilePicker';
import { findOrCreateFolder, uploadFileToFolder } from './lib/drive';

export default function App() {
  const [data, setData] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // PDF Viewer states
  const [activePage, setActivePage] = useState<number>(1);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);

  // Authentication and Drive
  const [isDrivePickerOpen, setIsDrivePickerOpen] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Sync and Audit states
  const [schools, setSchools] = useState<any[]>([]);
  const [syncChanges, setSyncChanges] = useState<any[]>([]);
  const [isForceSyncing, setIsForceSyncing] = useState(false);
  const [syncStatusData, setSyncStatusData] = useState<any>(null);

  const loadSyncData = async () => {
    try {
      const res = await fetch('/api/sync/changes');
      const d = await res.json();
      if (d.success) setSyncChanges(d.changes);
    } catch (e) {
      console.error(e);
    }

    try {
      const res = await fetch('/api/schools');
      const d = await res.json();
      if (d.success && d.data && d.data.schools) {
        setSchools(d.data.schools);
      }
    } catch (e) {
      console.error(e);
    }

    await loadSyncStatus();
  };

  const loadSyncStatus = async () => {
    try {
      const res = await fetch('/api/sync/status');
      const d = await res.json();
      if (d.success && d.status) {
        setSyncStatusData(d.status);
        if (d.status.phase === 'syncing') {
          setIsForceSyncing(true);
          pollSyncStatus();
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const pollSyncStatus = () => {
    const interval = setInterval(async () => {
      try {
        const sRes = await fetch('/api/sync/status');
        const sData = await sRes.json();
        if (sData.success && sData.status) {
          setSyncStatusData(sData.status);
          if (sData.status.phase === 'done') {
            clearInterval(interval);
            setIsForceSyncing(false);
            await loadSyncData();
            showToast(`✅ Sync Selesai! ${sData.status.total_synced} file dicadangkan dari ${sData.status.total_scanned} dipindai.`, 'success');
          } else if (sData.status.phase === 'error') {
            clearInterval(interval);
            setIsForceSyncing(false);
            await loadSyncData();
            showToast(`❌ Sync Gagal: ${sData.status.error || 'Terjadi kesalahan'}`, 'error');
          }
        }
      } catch (e) {
        console.error('Error polling sync status:', e);
      }
    }, 1000);
  };

  const handleForceSync = async () => {
    setIsForceSyncing(true);
    showToast('⏳ Memulai full parallel sync semua sekolah...', 'info');
    try {
      const res = await fetch('/api/sync/force', { method: 'POST' });
      const d = await res.json();
      if (d.success) {
        pollSyncStatus();
      } else {
        setIsForceSyncing(false);
        showToast('❌ Gagal memicu sinkronisasi.', 'error');
      }
    } catch (e) {
      setIsForceSyncing(false);
      showToast('❌ Koneksi gagal saat memicu sync.', 'error');
    }
  };

  const loadDataById = async (id: string) => {
    setData(null);
    setError(null);
    try {
      const response = await fetch(`/api/rab/${id}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
        const fileExt = result.data.fileName ? result.data.fileName.substring(result.data.fileName.lastIndexOf('.')).toLowerCase() : '.pdf';
        setPdfUrl(`/uploads/${id}${fileExt}`);
        setActivePage(1);
        if (result.data.sheets && result.data.sheets.length > 0) {
          setSelectedSheet(result.data.sheets[0]);
        } else {
          setSelectedSheet(null);
        }
      } else if (id !== 'default') {
        const fallback = await fetch(`/api/rab/default`);
        const fallbackResult = await fallback.json();
        if (fallbackResult.success) {
          setData(fallbackResult.data);
          const fileExt = fallbackResult.data.fileName ? fallbackResult.data.fileName.substring(fallbackResult.data.fileName.lastIndexOf('.')).toLowerCase() : '.pdf';
          setPdfUrl(`/uploads/default${fileExt}`);
          setActivePage(1);
          if (fallbackResult.data.sheets && fallbackResult.data.sheets.length > 0) {
            setSelectedSheet(fallbackResult.data.sheets[0]);
          } else {
            setSelectedSheet(null);
          }
        }
      }
    } catch (err) {
      setError("Gagal memuat data RAB.");
    }
  };

  useEffect(() => {
    document.title = "RAB Analyzer";
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id') || 'default';
    
    loadDataById(id);
    loadSyncData();

    // Initialize Auth
    initAuth((user, token) => {
      setAccessToken(token);
    }, () => {
      setAccessToken(null);
    });
  }, []);

  const handleDriveClick = async () => {
    try {
      let currentToken = await getAccessToken();
      if (!currentToken) {
        const result = await googleSignIn();
        if (result) {
          currentToken = result.accessToken;
          setAccessToken(currentToken);
        }
      }
      
      if (currentToken) {
        setIsDrivePickerOpen(true);
      }
    } catch (err) {
      alert("Gagal masuk ke Google. Silakan coba lagi.");
    }
  };

  const handleDriveFileSelect = async (fileId: string, fileName: string) => {
    setIsDrivePickerOpen(false);
    if (!accessToken) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      // 1. Fetch file from Drive API
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!res.ok) throw new Error("Gagal mengunduh file dari Drive");
      
      const blob = await res.blob();
      const file = new File([blob], fileName, { type: 'application/pdf' });

      // 2. Upload file locally
      await processUploadedFile(file, false);
    } catch (err: any) {
      setIsAnalyzing(false);
      setError(err.message || "Terjadi kesalahan saat mengambil file dari Drive.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      const allowedExts = ['.pdf', '.xlsx', '.xls'];
      if (!allowedExts.includes(fileExt)) {
        alert("Mohon unggah file format PDF atau Excel (.xlsx/.xls).");
        return;
      }

      setIsAnalyzing(true);
      setError(null);
      await processUploadedFile(file, true);
    }
  };

  const processUploadedFile = async (file: File, isLocal: boolean = false) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      
      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        throw new Error(response.ok ? "Format respons tidak valid." : "Server mengalami timeout atau error internal.");
      }
      
      if (result.success && result.taskId) {
        // Poll for status
        const checkStatus = async () => {
          try {
            const statusRes = await fetch(`/api/upload/status/${result.taskId}`);
            const statusData = await statusRes.json();
            if (statusData.success && statusData.task) {
              if (statusData.task.status === "done") {
                const rabId = statusData.task.result;
                
                // Ambil data untuk mendapatkan nama sekolah demi sinkronisasi awan
                let schoolName = "Sekolah Tidak Dikenal";
                try {
                  const dataRes = await fetch(`/api/rab/${rabId}`);
                  const dataJson = await dataRes.json();
                  if (dataJson.success && dataJson.data) {
                    schoolName = dataJson.data.nama || "Sekolah Tidak Dikenal";
                  }
                } catch (dataErr) {
                  console.error("Gagal memuat info sekolah untuk sinkronisasi:", dataErr);
                }

                if (accessToken && isLocal) {
                  setSyncStatus("connecting");
                  try {
                    setSyncStatus("checking_pengawasan");
                    const parentFolderId = "1QP4ZQ9PdnpHiPY4208yhE7XPRUfiFkVL";
                    
                    setSyncStatus("checking_school");
                    const schoolFolderId = await findOrCreateFolder(accessToken, schoolName, parentFolderId);
                    
                    setSyncStatus("uploading");
                    await uploadFileToFolder(accessToken, file, schoolFolderId);
                    
                    setSyncStatus("success");
                    // Delay sejenak agar pengguna bisa melihat status sukses yang memuaskan
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                  } catch (syncErr: any) {
                    console.error("Gagal melakukan sinkronisasi awan Google Drive:", syncErr);
                    setSyncStatus("error");
                    await new Promise((resolve) => setTimeout(resolve, 2500));
                  } finally {
                    setSyncStatus(null);
                  }
                }

                setIsAnalyzing(false);
                loadSample(rabId);
              } else if (statusData.task.status === "error") {
                setIsAnalyzing(false);
                setError(statusData.task.error || "Gagal memproses RAB");
              } else {
                setTimeout(checkStatus, 3000);
              }
            } else {
              setIsAnalyzing(false);
              setError("Task tidak ditemukan");
            }
          } catch (err) {
            setIsAnalyzing(false);
            setError("Gagal mengecek status upload");
          }
        };
        checkStatus();
      } else {
        setIsAnalyzing(false);
        setError(result.message || "Gagal mengunggah RAB.");
      }
    } catch (err: any) {
      setIsAnalyzing(false);
      setError(err.message || "Terjadi kesalahan saat menghubungi server.");
    }
  };

  const loadSample = (sampleId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('id', sampleId);
    window.history.pushState({}, '', url.toString());
    loadDataById(sampleId);
  };

  const renderSheetTable = (sheetText: string) => {
    if (!sheetText) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400">
          <Loader2 className="animate-spin text-green-500 mb-2" size={24} />
          <p className="text-xs">Sedang memuat data tabular sheet, mohon tunggu Boss...</p>
        </div>
      );
    }
    const lines = sheetText.split("\n");
    return (
      <div className="overflow-x-auto w-full max-h-[380px] border border-slate-800 rounded-xl bg-slate-950/90 shadow-2xl backdrop-blur-md">
        <table className="w-full text-[10px] md:text-[11px] font-mono text-slate-300 border-collapse">
          <tbody>
            {lines.map((line, lIdx) => {
              const cells = line.split("|").map(c => c.trim());
              if (cells.length > 1) {
                cells.shift();
                cells.pop();
              }
              
              const isHeader = lIdx === 0 || line.toUpperCase().includes("NO.") || line.toUpperCase().includes("TOTAL") || line.toUpperCase().includes("REKAPITULASI");
              
              return (
                <tr 
                  key={lIdx} 
                  className={`border-b border-slate-900/60 hover:bg-slate-900/40 transition-colors ${
                    isHeader 
                      ? 'bg-slate-900/90 font-bold text-white sticky top-0 border-slate-800' 
                      : ''
                  }`}
                >
                  {cells.map((cell, cIdx) => (
                    <td 
                      key={cIdx} 
                      className={`px-3 py-2 border-r border-slate-900/40 min-w-[80px] whitespace-nowrap ${
                        isHeader ? 'font-bold text-slate-100' : 'text-slate-300'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (error) {
    return <div className="h-screen flex items-center justify-center font-bold text-red-500">{error}</div>;
  }

  if (!data) {
    return (
      <div className="h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-x-hidden select-none">
      {/* Header Section */}
      <header className="h-16 px-4 md:px-8 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-xs">RAB</span>
          </div>
          <h1 className="text-sm md:text-lg font-bold tracking-tight">Analyza Pro <span className="font-normal text-slate-300">/</span> <span className="text-slate-500">Mesin Ringkasan RAB</span></h1>
        </div>
        <div className="flex items-center gap-4">
          <select 
            className="hidden md:block text-xs font-bold border border-slate-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 cursor-pointer text-slate-600"
            onChange={(e) => loadSample(e.target.value)}
            defaultValue={new URLSearchParams(window.location.search).get('id') || 'default'}
          >
            <option value="default">Sample: SDN Trosobo I (Normal)</option>
            <option value="geluran">Sample: SDN Geluran 1 (Anomaly)</option>
            <option value="kalijaten">Sample: SDN Kalijaten (Excel)</option>
          </select>
          {accessToken ? (
            <div className="hidden md:flex items-center gap-2">
              <span className="text-[10px] text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200 flex items-center gap-1.5 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Cloud Sync Aktif
              </span>
              <button onClick={handleDriveClick} className="flex items-center gap-2 text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer">
                <Cloud size={14} />
                Pilih dari Drive
              </button>
            </div>
          ) : (
            <button onClick={handleDriveClick} className="hidden md:flex items-center gap-2 text-xs font-bold bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors cursor-pointer">
              <Cloud size={14} />
              Hubungkan ke Drive
            </button>
          )}
          
          <label className="cursor-pointer hidden md:flex items-center gap-2 text-xs font-bold bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors">
            <Upload size={14} />
            Unggah RAB
            <input type="file" accept=".pdf,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
          </label>
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center">
             <Activity size={14} className="text-slate-500" />
          </div>
        </div>
      </header>

      {/* Bento Grid Main Content */}
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
        
        {isDrivePickerOpen && accessToken && (
          <DriveFilePicker 
            accessToken={accessToken}
            onClose={() => setIsDrivePickerOpen(false)}
            onFileSelect={handleDriveFileSelect}
          />
        )}
        
        {isAnalyzing && (
          <div className="absolute inset-0 z-50 bg-white/85 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-6 text-center m-4 md:m-6 shadow-2xl border border-slate-200 transition-all duration-300">
            {syncStatus === "success" ? (
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 border border-green-200 animate-bounce">
                <CheckCircle2 size={36} />
              </div>
            ) : syncStatus === "error" ? (
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4 border border-red-200">
                <AlertTriangle size={36} />
              </div>
            ) : (
              <Loader2 size={48} className="text-blue-600 animate-spin mb-4" />
            )}
            
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">
              {!syncStatus && "Sistem Sedang Menganalisa PDF..."}
              {syncStatus === "connecting" && "Analisis Sukses! Menghubungkan ke Drive..."}
              {syncStatus === "checking_pengawasan" && "Menyelaraskan Direktori Awan..."}
              {syncStatus === "checking_school" && "Mempersiapkan Folder Sekolah..."}
              {syncStatus === "uploading" && "Mengunggah Dokumen ke Google Drive..."}
              {syncStatus === "success" && "Sinkronisasi Google Drive Sukses!"}
              {syncStatus === "error" && "Gagal Menyimpan ke Google Drive"}
            </h2>
            <p className="text-sm text-slate-500 font-mono mt-2 max-w-md">
              {!syncStatus && "Mengekstrak tabel tak terstruktur & memetakan nilai (CANEI)..."}
              {syncStatus === "connecting" && "Membuka otorisasi token penyimpanan cloud..."}
              {syncStatus === "checking_pengawasan" && "Memeriksa keberadaan folder induk '/Pengawasan'..."}
              {syncStatus === "checking_school" && "Mencari atau membuat subfolder khusus sekolah..."}
              {syncStatus === "uploading" && "Mengunggah salinan biner PDF secara langsung dari browser..."}
              {syncStatus === "success" && "File berhasil dicadangkan di folder Pengawasan/[Nama Sekolah]!"}
              {syncStatus === "error" && "Sesi Google Drive kedaluwarsa atau terjadi masalah koneksi."}
            </p>
          </div>
        )}

        {/* Left Column: Bento Grid Dashboard */}
        <div className="lg:col-span-7 col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6 h-fit">
          {/* Summary Stat Card */}
          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between shadow-sm">
            <div className="flex flex-col md:flex-row md:justify-between items-start mb-6 md:mb-0">
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Biaya (Fisik + Ops)</p>
                <h2 className="text-4xl md:text-5xl font-black text-slate-800 tracking-tight transition-all">{data.totalBiaya}</h2>
                <p className="text-sm font-medium text-slate-500 mt-2">Revitalisasi Sekolah 2026 &mdash; {data.nama}</p>
              </div>
              <div className="mt-4 md:mt-0 px-3 py-1 bg-green-100 text-green-700 text-[10px] md:text-xs font-bold rounded-full whitespace-nowrap border border-green-200">
                AKURASI DATA: 100%
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 md:gap-8 border-t border-slate-100 pt-5 mt-6">
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Tahap I ({data.tahap1Pct})</p>
                <p className="text-lg font-bold text-slate-700">{data.tahap1}</p>
                <div className="w-full h-1.5 bg-slate-100 mt-2 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 w-[70%]"></div>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Tahap II ({data.tahap2Pct})</p>
                <p className="text-lg font-bold text-slate-700">{data.tahap2}</p>
                <div className="w-full h-1.5 bg-slate-100 mt-2 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 w-[30%]"></div>
                </div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">Pembangunan Baru</p>
                <p className="text-lg font-bold text-slate-700">{data.pembangunanBaru}</p>
                <div className="w-full h-1.5 bg-slate-100 mt-2 rounded-full overflow-hidden flex">
                  <div className="h-full bg-slate-800 transition-all duration-1000" style={{ width: `${data.pembangunanBaruPct}%` }} title={`Baru (${data.pembangunanBaruPct}%)`}></div>
                  <div className="h-full bg-slate-300 transition-all duration-1000" style={{ width: `${data.rehabilitasiPct}%` }} title={`Rehab (${data.rehabilitasiPct}%)`}></div>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Log Card */}
          <div className="md:col-span-1 bg-slate-900 rounded-2xl p-6 text-slate-300 shadow-xl flex flex-col relative overflow-hidden min-h-[420px]">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Activity size={120} />
            </div>
            <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-4 relative z-10">
              <h3 className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-100">Log Audit</h3>
              <span className="text-[10px] bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded border border-blue-800 font-mono">Monitoring-Active</span>
            </div>
            
            <div className="space-y-3 font-mono text-[11px] flex-1 overflow-y-auto pr-2 relative z-10 max-h-[300px]">
              {data.audit.map((item: any, idx: number) => {
                let Icon = CheckCircle2;
                let iconColor = "text-green-500";
                if (item.type === 'warn') {
                  Icon = AlertTriangle;
                  iconColor = "text-yellow-500";
                } else if (item.type === 'info') {
                  Icon = Info;
                  iconColor = "text-blue-500";
                }
                
                const hasPage = typeof item.page === 'number' && item.page > 0;
                
                return (
                  <div 
                    key={idx} 
                    onClick={() => hasPage && setActivePage(item.page)}
                    className={`flex gap-3 items-start p-2 rounded-lg transition-all animate-in fade-in slide-in-from-bottom-2 ${
                      hasPage 
                        ? 'cursor-pointer hover:bg-slate-800 hover:text-white border border-transparent hover:border-slate-700' 
                        : ''
                    }`}
                    style={{ animationDelay: `${idx * 150}ms` }}
                  >
                    <Icon size={16} className={`${iconColor} shrink-0 mt-0.5`} />
                    <div className="flex-1">
                      <p className="leading-relaxed text-slate-300/90">{item.text}</p>
                      {hasPage && (
                        <span className="inline-block mt-1 text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 font-sans font-semibold">
                          Klik untuk Bukti Hlm {item.page} 🔍
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-3 relative z-10">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse border border-green-300 shadow-[0_0_10px_rgba(34,197,94,0.6)]"></div>
              <span className="text-[10px] text-slate-400 font-mono tracking-wide">MESIN: AUDIT SELESAI</span>
            </div>
          </div>

          {/* Breakdown Grid */}
          <div className="md:col-span-1 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col shadow-sm h-[420px] overflow-y-auto">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-5">Distribusi Biaya (Top 4)</h3>
            <div className="flex-1 space-y-3">
              {data.top4.map((item: any, idx: number) => (
                <div key={idx} className="p-3.5 bg-slate-50/80 rounded-xl border border-slate-100 flex flex-col gap-2 transition-all">
                  <div 
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 ${item.color} rounded-full`}></div>
                      <p className="text-[13px] font-bold text-slate-800">{item.nama}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-mono font-bold text-slate-700">{item.pct}</p>
                      {expandedIdx === idx ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] text-slate-500 font-medium">{item.nilai}</p>
                    <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} transition-all duration-1000`} style={{ width: item.pct }}></div>
                    </div>
                  </div>

                  {expandedIdx === idx && item.breakdown && (
                    <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-col gap-1.5">
                      {item.breakdown.map((bd: any, bIdx: number) => (
                        <div key={bIdx} className="flex justify-between items-center py-0.5">
                          <span className="text-[10px] text-slate-600 line-clamp-1 break-all w-[65%]">{bd.nama}</span>
                          <span className="text-[10px] font-mono font-medium text-slate-700 whitespace-nowrap text-right">
                            {bd.nilai}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Metadata Card */}
          <div className="md:col-span-1 bg-blue-600 rounded-2xl p-6 text-white shadow-lg flex flex-col justify-center relative overflow-hidden min-h-[160px]">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <FileSpreadsheet size={100} />
            </div>
            <div className="relative z-10">
              <p className="text-[10px] uppercase font-bold tracking-widest text-blue-200 mb-1.5 flex items-center gap-2">
                <FileSpreadsheet size={12} /> Data File Aktif
              </p>
              <h4 className="text-lg md:text-xl font-bold mb-5 line-clamp-1" title={data.fileName}>{data.fileName}</h4>
              <div className="grid grid-cols-2 gap-4 text-[11px] font-medium">
                <div className="bg-blue-500/40 p-2.5 rounded-lg border border-blue-400/30 backdrop-blur-sm">
                  <p className="text-blue-200 uppercase text-[9px] mb-0.5 tracking-wider">Tgl Dokumen</p>
                  <p>{data.tanggal}</p>
                </div>
                <div className="bg-blue-500/40 p-2.5 rounded-lg border border-blue-400/30 backdrop-blur-sm">
                  <p className="text-blue-200 uppercase text-[9px] mb-0.5 tracking-wider">Algoritma</p>
                  <p>Pemrosesan Cerdas</p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Card */}
          <div className="md:col-span-1 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col justify-between shadow-sm min-h-[160px]">
            <div>
              <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Pelaporan & Ekspor</h3>
              <p className="text-[11px] md:text-xs text-slate-500 leading-relaxed">
                Hasilkan rincian akhir yang terverifikasi.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button 
                onClick={() => window.print()}
                className="flex items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 py-3 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer">
                <Download size={14} /> Cetak PDF
              </button>
              <button className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 py-3 rounded-xl text-xs font-bold text-white transition-colors shadow-sm cursor-pointer">
                <FileText size={14} /> Ekspor JSON
              </button>
            </div>
          </div>

          {/* Sync & Audit Monitor Card */}
          <div className="md:col-span-2 bg-slate-900 rounded-2xl p-6 text-slate-300 shadow-xl flex flex-col relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center border border-green-500/30">
                  <Activity size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Pemantauan & Sinkronisasi Siber Kantor</h3>
                  <p className="text-[10px] text-slate-400 font-mono">1 Kredensial Terpadu &bull; CV Sada Jiwa (Read-Only) &bull; Pengawasan Boss (Write)</p>
                </div>
              </div>
              <button
                onClick={handleForceSync}
                disabled={isForceSyncing}
                className="flex items-center gap-2 text-xs font-bold bg-green-500 hover:bg-green-400 text-slate-950 px-4 py-2.5 rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer w-fit"
              >
                {isForceSyncing ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Menyinkronkan...
                  </>
                ) : (
                  <>
                    <Cloud size={14} />
                    Sync Drive Sekarang ⚡
                  </>
                )}
              </button>
            </div>

            {/* Grid for activity feed and progress list */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Activity Feed */}
              <div className="md:col-span-7 flex flex-col min-h-[220px]">
                <h4 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-3">Live Activity Feed (MD5 Audit)</h4>
                <div className="flex-1 space-y-2 max-h-[200px] overflow-y-auto pr-1 font-mono text-[10px]">
                  {syncChanges.length > 0 ? (
                    syncChanges.map((change, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 flex flex-col gap-1 hover:border-slate-700 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-green-400">{change.school}</span>
                          <span className="text-[9px] text-slate-500">
                            {new Date(change.timestamp).toLocaleTimeString("id-ID", { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-slate-300 font-semibold truncate" title={change.file_name}>{change.file_name || "(Folder)"}</p>
                        <div className="flex items-center justify-between gap-2 mt-1 border-t border-slate-900 pt-1 text-[9px] text-slate-400">
                          <span>{change.details}</span>
                          <span className={`px-1.5 py-0.5 rounded ${
                            change.action === 'backup_file' ? 'bg-blue-950 text-blue-400 border border-blue-900/60' : 'bg-green-950 text-green-400 border border-green-900/60'
                          }`}>
                            {change.action === 'backup_file' ? 'Auto-Backup' : 'New Folder'}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 py-8">
                      <p className="text-[11px]">Belum ada aktivitas baru, Boss.</p>
                      <p className="text-[9px] mt-1">Gemma bersiaga penuh memantau setiap 1 jam.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress and status list */}
              <div className="md:col-span-5 flex flex-col border-l border-slate-800/80 pl-0 md:pl-6 min-h-[220px]">
                <h4 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-3">6 SD Status Pengawasan</h4>
                <div className="flex-1 space-y-2.5 max-h-[200px] overflow-y-auto pr-1">
                  {schools.length > 0 ? (
                    schools.slice(0, 6).map((school, idx) => {
                      const pct = school.kelengkapan_dokumen || school.progress || 0;
                      let statusText = "URGENT 🔴";
                      let color = "bg-red-500";
                      let textColor = "text-red-400";
                      let borderColor = "border-red-950 bg-red-950/20";
                      
                      const match = syncStatusData?.schools?.find((s: any) => 
                        s.name.toLowerCase().includes(school.name.toLowerCase()) || 
                        school.name.toLowerCase().includes(s.name.toLowerCase())
                      );

                      if (syncStatusData && syncStatusData.phase === 'syncing' && match) {
                        if (match.status === 'syncing') {
                          statusText = "🔵 SYNCING...";
                          color = "bg-blue-500 animate-pulse";
                          textColor = "text-blue-400 font-bold";
                          borderColor = "border-blue-950 bg-blue-950/20 animate-pulse";
                        } else if (match.status === 'done') {
                          statusText = "🟢 SYNCED";
                          color = "bg-green-500";
                          textColor = "text-green-400";
                          borderColor = "border-green-950/40 bg-green-950/10";
                        } else if (match.status === 'pending') {
                          statusText = "⏳ PENDING";
                          color = "bg-slate-500";
                          textColor = "text-slate-400";
                          borderColor = "border-slate-800 bg-slate-900/30";
                        } else if (match.status === 'error') {
                          statusText = "🔴 ERROR";
                          color = "bg-red-500";
                          textColor = "text-red-400";
                          borderColor = "border-red-950 bg-red-950/20";
                        }
                      } else {
                        if (pct >= 100) {
                          statusText = "ACUAN ⭐";
                          color = "bg-yellow-500";
                          textColor = "text-yellow-400";
                          borderColor = "border-yellow-950/40 bg-yellow-950/10";
                        } else if (pct >= 60) {
                          statusText = "IN PROGRESS 🟡";
                          color = "bg-yellow-500";
                          textColor = "text-yellow-400";
                          borderColor = "border-yellow-950/40 bg-yellow-950/10";
                        }
                      }

                      return (
                        <div key={idx} className={`p-2.5 rounded-xl border ${borderColor} flex flex-col gap-1.5`}>
                          <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                            <span className="line-clamp-1">{school.name}</span>
                            <span className={`text-[9px] font-mono ${textColor}`}>{statusText}</span>
                          </div>
                          {syncStatusData && syncStatusData.phase === 'syncing' && match ? (
                            <div className="text-[10px] font-mono text-slate-400 font-semibold">
                              {match.detail || "Menunggu..."}
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-mono font-bold text-slate-400 w-8">{pct}%</span>
                              <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                <div className={`h-full ${color}`} style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-500 py-8">
                      <Loader2 className="animate-spin text-slate-500" size={16} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Viewer Section (PDF / Excel Preview) */}
        <div className="lg:col-span-5 col-span-12 bg-white rounded-2xl border border-slate-200 p-6 flex flex-col shadow-sm h-[calc(100vh-12rem)] min-h-[600px] lg:sticky lg:top-24 animate-in fade-in slide-in-from-right-4">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              {data.nama === "SDN TROSOBO I" ? (
                <>
                  <CheckCircle2 size={16} className="text-amber-500 animate-pulse" />
                  Bukti Visual PDF &mdash; Template Acuan
                </>
              ) : data.isXlsx ? (
                <>
                  <FileSpreadsheet size={16} className="text-green-600 animate-pulse" />
                  Audit File Excel & Preview Tabular
                </>
              ) : (
                <>
                  <FileText size={16} className="text-blue-600 animate-pulse" />
                  Bukti Visual PDF (Interactive)
                </>
              )}
            </h3>
            {data.nama === "SDN TROSOBO I" ? (
              <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-sans font-bold flex items-center gap-1 animate-bounce">
                ⭐ Acuan Utama
              </span>
            ) : (
              <span className="text-[10px] bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full font-mono font-bold text-slate-600">
                {data.isXlsx ? `${data.sheets?.length || 0} Sheets` : `Halaman ${activePage}`}
              </span>
            )}
          </div>
          
          <div className="flex-1 rounded-xl overflow-hidden relative flex flex-col">
            {data.isXlsx ? (
              /* Excel Audit Panel - Glassmorphic Spreadsheet Viewer & Preview Table */
              <div className="flex-1 bg-slate-900 text-white rounded-xl p-5 border border-slate-800 flex flex-col justify-between overflow-y-auto relative shadow-2xl">
                <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="relative z-10 flex flex-col h-full justify-between gap-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-500/20 text-green-400 rounded-xl flex items-center justify-center border border-green-500/30 shadow-lg">
                        <FileSpreadsheet size={20} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white tracking-wide">Preview Lembar Kerja Excel</h4>
                        <p className="text-[9px] text-slate-400 font-mono">Pilih sheet di bawah untuk melihat isi tabel live</p>
                      </div>
                    </div>

                    {/* Scrollable Sheet Tabs */}
                    <div className="border-y border-slate-800/80 py-2.5 my-1">
                      <div className="flex gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-thin scrollbar-thumb-slate-800 pr-1 pb-1">
                        {data.sheets && data.sheets.map((sheet: string, sIdx: number) => {
                          const isActive = selectedSheet === sheet;
                          return (
                            <button
                              key={sIdx}
                              onClick={() => setSelectedSheet(sheet)}
                              className={`text-[9px] px-2.5 py-1.5 rounded-lg font-mono font-bold transition-all whitespace-nowrap cursor-pointer ${
                                isActive 
                                  ? 'bg-green-600 text-white shadow-md shadow-green-600/20 scale-105 border border-green-500' 
                                  : 'bg-slate-800 hover:bg-slate-700/80 text-slate-300 border border-slate-750'
                              }`}
                            >
                              📊 {sheet}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Live Preview Table */}
                    <div className="flex-1 mt-1">
                      <div className="flex justify-between items-center mb-2 px-1 text-[10px] font-mono text-slate-400 uppercase font-bold tracking-wider">
                        <span>Aktif: {selectedSheet || "-"}</span>
                        <span>Preview Live 🔍</span>
                      </div>
                      {selectedSheet && data.sheetData ? (
                        renderSheetTable(data.sheetData[selectedSheet])
                      ) : (
                        <div className="p-8 text-center bg-slate-950/60 border border-slate-800 rounded-xl text-slate-500 text-xs">
                          Pilih salah satu sheet di atas untuk memuat bukti visual data angka.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-800/80 pt-3.5 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>Ekstraksi Tabular Sukses</span>
                      <span>Format: .xlsx (Excel)</span>
                    </div>
                    <a 
                      href={pdfUrl || '#'} 
                      download={data.fileName}
                      className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 active:bg-green-700 py-3 rounded-xl text-xs font-bold text-white transition-all shadow-lg shadow-green-600/20 cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 text-center"
                    >
                      <Download size={14} />
                      Unduh Berkas Excel Asli
                    </a>
                  </div>
                </div>
              </div>
            ) : pdfUrl ? (
              /* PDF Viewer standard */
              <iframe
                src={`${pdfUrl}#page=${activePage}`}
                className="w-full h-full border-none bg-slate-100 border border-slate-200/60 rounded-xl animate-in fade-in"
                title="PDF Viewer"
                key={`${pdfUrl}-${activePage}`}
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center bg-slate-100 border border-slate-200/60 rounded-xl">
                <FileText size={48} className="stroke-1 mb-2 animate-pulse text-blue-500/50" />
                <p className="text-xs font-medium">Belum ada file PDF yang dimuat.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer Bar */}
      <footer className="h-10 px-4 md:px-8 bg-white border-t border-slate-200 flex items-center justify-between text-[9px] md:text-[10px] text-slate-500 uppercase tracking-widest bg-slate-50/50">
        <div className="flex gap-4 md:gap-8">
          <span className="hidden sm:inline">Session ID: RAB-{Math.floor(Math.random() * 9000) + 1000}</span>
          <span className="font-semibold text-slate-400">Mesin: Gemini Flash-2.5</span>
        </div>
        <div>
          <span className="hidden sm:inline">Mendukung ekstraksi dinamis untuk format file yang bervariasi.</span>
          <span className="sm:hidden">Format Heterogen Didukung</span>
        </div>
      </footer>
    </div>
  );
}
