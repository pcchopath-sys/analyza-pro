import React, { useState, useEffect } from 'react';
import { Loader2, FileText, Search, X, Folder, AlertTriangle } from 'lucide-react';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

interface DriveFilePickerProps {
  accessToken: string;
  onFileSelect: (fileId: string, fileName: string) => void;
  onClose: () => void;
}

export function DriveFilePicker({ accessToken, onFileSelect, onClose }: DriveFilePickerProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async (query: string = '') => {
    setLoading(true);
    setError(null);
    try {
      const pengawasanId = "1QP4ZQ9PdnpHiPY4208yhE7XPRUfiFkVL";
      const parentIds = [pengawasanId];
      
      let q = "mimeType='application/pdf' and trashed = false";
      
      // 2. Cari subfolder (folder sekolah) di dalam "Pengawasan"
      try {
        const subfolderQuery = `'${pengawasanId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const subfolderRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(subfolderQuery)}&fields=files(id)&pageSize=100`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (subfolderRes.ok) {
          const subfolderData = await subfolderRes.json();
          const subfolders = subfolderData.files || [];
          subfolders.forEach((sub: any) => parentIds.push(sub.id));
        }
      } catch (subfolderErr) {
        console.warn("Gagal mengambil subfolder, hanya memindai folder utama Pengawasan:", subfolderErr);
      }
      
      // Batasi pencarian hanya di folder Pengawasan atau subfoldernya
      const parentConditions = parentIds.map(id => `'${id}' in parents`).join(" or ");
      q += ` and (${parentConditions})`;

      if (query) {
        q += ` and name contains '${query.replace(/'/g, "\\'")}'`;
      }
      
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&pageSize=50&orderBy=recency desc`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error('Gagal memuat file dari Google Drive.');
      }
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    // basic debounce
    setTimeout(() => {
      fetchFiles(e.target.value);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <Folder size={18} className="text-blue-600" />
            <h2 className="font-bold text-slate-800">Pilih dari Google Drive</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-4 border-b border-slate-100 pb-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari file PDF..." 
              value={search}
              onChange={handleSearch}
              className="w-full bg-slate-100 border-none rounded-xl pl-9 pr-4 py-3 text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <Loader2 size={32} className="animate-spin mb-3 text-blue-500" />
              <span className="text-sm font-medium">Memuat file Drive...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 text-red-500 p-6 text-center">
              <AlertTriangle size={32} className="mb-3" />
              <span className="text-sm font-bold">{error}</span>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <FileText size={32} className="mb-3 opacity-50" />
              <span className="text-sm font-medium">Tidak ada file PDF ditemukan.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              {files.map(file => (
                <button
                  key={file.id}
                  onClick={() => onFileSelect(file.id, file.name)}
                  className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl text-left transition-colors border border-transparent hover:border-slate-200"
                >
                  <div className="w-10 h-10 bg-red-100 text-red-600 rounded-lg flex items-center justify-center shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="overflow-hidden flex-1">
                    <p className="text-sm font-bold text-slate-700 truncate">{file.name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">PDF Document</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
