import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { Telegraf } from "telegraf";
import { GoogleGenAI } from "@google/genai";
import fetch from "node-fetch";
import fs from "fs";
import os from "os";
import multer from "multer";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);
const upload = multer({ dest: os.tmpdir() });

// We can just use the global fetch in Node 18+
// but node-fetch is fine if we needed it

const PORT = 4000;
const parsedRABs = new Map<string, any>();

// Deterministic Mathematical Validator (Audit Guard)
function runDeterministicAudit(data: any): any[] {
  const extraAudits: any[] = [];
  try {
    const parseRupiah = (val: string): number => {
      if (!val) return 0;
      const clean = val.replace(/[^\d]/g, "");
      return parseInt(clean, 10) || 0;
    };

    const parseJutaOrRupiah = (val: string): number => {
      if (!val) return 0;
      if (val.toLowerCase().includes("juta")) {
        const clean = val.replace(/[^\d.,]/g, "").replace(",", ".");
        return Math.round(parseFloat(clean) * 1000000);
      }
      return parseRupiah(val);
    };

    const totalBiaya = parseRupiah(data.totalBiaya);
    const t1 = parseJutaOrRupiah(data.tahap1);
    const t2 = parseJutaOrRupiah(data.tahap2);
    const sumTahapan = t1 + t2;

    if (totalBiaya > 0 && sumTahapan > 0) {
      const diff = Math.abs(totalBiaya - sumTahapan);
      if (diff > 1000) {
        extraAudits.push({
          text: `[SISTEM] Selisih Perhitungan Tahap: Jumlah Tahap I (${data.tahap1}) & Tahap II (${data.tahap2}) = Rp ${sumTahapan.toLocaleString("id-ID")} memiliki selisih Rp ${diff.toLocaleString("id-ID")} dengan Total Biaya (${data.totalBiaya}).`,
          type: "warn",
          page: 1
        });
      } else {
        extraAudits.push({
          text: `[SISTEM] Verifikasi Matematika: Komposisi Tahap I dan Tahap II klop secara matematis dengan total biaya.`,
          type: "",
          page: 1
        });
      }
    }

    const p1 = parseInt(data.tahap1Pct?.replace(/[^\d]/g, "") || "0", 10);
    const p2 = parseInt(data.tahap2Pct?.replace(/[^\d]/g, "") || "0", 10);
    if (p1 > 0 && p2 > 0 && p1 + p2 !== 100) {
      extraAudits.push({
        text: `[SISTEM] Selisih Persentase Tahap: Total persentase Tahap I (${data.tahap1Pct}) + Tahap II (${data.tahap2Pct}) adalah ${p1 + p2}%, bukan 100%.`,
        type: "warn",
        page: 1
      });
    }

    if (Array.isArray(data.top4)) {
      let top4Total = 0;
      data.top4.forEach((item: any) => {
        const itemNilai = parseRupiah(item.nilai);
        top4Total += itemNilai;
        
        if (Array.isArray(item.breakdown)) {
          let bdTotal = 0;
          item.breakdown.forEach((bd: any) => {
            bdTotal += parseRupiah(bd.nilai);
          });
          const diffBd = Math.abs(itemNilai - bdTotal);
          if (diffBd > 1000) {
            extraAudits.push({
              text: `[SISTEM] Ketidakcocokan Rincian: Sub-pekerjaan ${item.nama} memiliki selisih Rp ${diffBd.toLocaleString("id-ID")} dengan total kelompok pekerjaan tersebut.`,
              type: "warn",
              page: 2
            });
          }
        }
      });

      if (totalBiaya > 0 && top4Total > totalBiaya) {
        extraAudits.push({
          text: `[SISTEM] Anomali Anggaran: Total akumulasi 4 pekerjaan terbesar (Rp ${top4Total.toLocaleString("id-ID")}) melebihi total keseluruhan biaya proyek (${data.totalBiaya})!`,
          type: "warn",
          page: 1
        });
      }
    }
  } catch (err) {
    console.error("Error in deterministic audit validator:", err);
  }
  return extraAudits;
}

function parseExcelTextToSheets(text: string): Record<string, string> {
  const sheets: Record<string, string> = {};
  const regex = /===\s*Sheet:\s*(.*?)\s*===/g;
  let match;
  const positions: { name: string, index: number }[] = [];
  
  while ((match = regex.exec(text)) !== null) {
    positions.push({ name: match[1].trim(), index: match.index + match[0].length });
  }
  
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end = (i + 1 < positions.length) ? text.indexOf("===", positions[i + 1].index - 50) : text.length;
    let sheetText = text.substring(start, end > start ? end : text.length).trim();
    
    // Batasi baris agar tidak terlalu besar di memory
    const lines = sheetText.split("\n").slice(0, 100);
    sheets[positions[i].name] = lines.join("\n");
  }
  
  return sheets;
}

async function startServer() {
  const app = express();
  
  const uploadsDir = path.join(__dirname, "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }
  app.use("/uploads", express.static(uploadsDir));
  
  // Storage for our mocked/tested data too, so we have at least one to show if none are provided
  parsedRABs.set("default", {
    nama: "SDN TROSOBO I",
    kabupaten: "Kab. Sidoarjo",
    totalBiaya: "Rp 394.390.258",
    tahap1: "Rp 276.07 Juta",
    tahap1Pct: "70%",
    tahap2: "Rp 118.31 Juta",
    tahap2Pct: "30%",
    pembangunanBaru: "Rp 252.31 Juta",
    pembangunanBaruPct: 64,
    rehabilitasiPct: 36,
    fileName: "RAB_SDN_Trosobo_I_2026.pdf",
    tanggal: "18 April 2026",
    top4: [
      { 
        nama: "Pekerjaan Dinding", nilai: "Rp 69.047.585", pct: "17.51%", color: "bg-blue-600",
        breakdown: [
          { nama: "Pek. Plesteran Dinding 1:4", nilai: "Rp 27.377.838" },
          { nama: "Pas. Bata Ringan/hebel 10cm", nilai: "Rp 18.622.238" },
          { nama: "Pek. Acian Dinding 1:4", nilai: "Rp 15.510.882" },
          { nama: "Pas. Dinding Batubata 1:6", nilai: "Rp 5.772.181" },
          { nama: "Lain-lain", nilai: "Rp 1.764.446" }
        ]
      },
      { 
        nama: "Pekerjaan Tangga", nilai: "Rp 58.334.205", pct: "14.79%", color: "bg-indigo-600",
        breakdown: [
          { nama: "Pemasangan Besi Tulangan", nilai: "Rp 18.550.000" },
          { nama: "Pek. Beton Tangga 1:2:3", nilai: "Rp 11.747.000" },
          { nama: "Pondasi Tapak Beton", nilai: "Rp 10.312.000" },
          { nama: "Pek. Plat Lantai", nilai: "Rp 9.200.000" },
          { nama: "Lain-lain", nilai: "Rp 8.525.205" }
        ]
      },
      { 
        nama: "Pekerjaan Cat", nilai: "Rp 48.575.962", pct: "12.32%", color: "bg-purple-600",
        breakdown: [
          { nama: "Cat Dinding Interior Baru", nilai: "Rp 11.350.398" },
          { nama: "Cat Dinding Exterior Baru", nilai: "Rp 11.309.216" },
          { nama: "Pembersihan Cat Tembok", nilai: "Rp 10.611.500" },
          { nama: "Cat Dinding Exterior Lama", nilai: "Rp 5.571.348" },
          { nama: "Lain-lain", nilai: "Rp 9.733.500" }
        ]
      },
      { 
        nama: "Lantai / Keramik", nilai: "Rp 45.230.565", pct: "11.47%", color: "bg-teal-600",
        breakdown: [
          { nama: "Keramik Interior 40x40", nilai: "Rp 23.319.578" },
          { nama: "Beton Tumbuk Lantai Kerja", nilai: "Rp 8.805.561" },
          { nama: "Urugan Pasir", nilai: "Rp 6.344.990" },
          { nama: "Keramik Exterior 40x40", nilai: "Rp 4.755.427" },
          { nama: "Lain-lain", nilai: "Rp 2.005.009" }
        ]
      },
    ],
    audit: [
      { text: "Dokumen dipindai: 17 halaman OCR diekstrak.", type: "info", page: 1 },
      { text: "Verifikasi struktural RAB selesai.", type: "info", page: 1 },
      { text: "Item 'Tangga Beton' mengindikasikan bangunan bertingkat.", type: "warn", page: 2 },
      { text: "Verifikasi rumus: Nilai cocok dengan total Halaman 2.", type: "", page: 2 },
      { text: "4 Kategori utama terdeteksi secara otomatis.", type: "info", page: 1 }
    ]
  });

  parsedRABs.set("geluran", {
    nama: "SDN GELURAN 1",
    kabupaten: "Kab. Sidoarjo",
    totalBiaya: "Rp 831.000.000",
    tahap1: "Rp 597.00 Juta",
    tahap1Pct: "70%",
    tahap2: "Rp 255.00 Juta",
    tahap2Pct: "30%",
    pembangunanBaru: "Rp 504.62 Juta",
    pembangunanBaruPct: 69,
    rehabilitasiPct: 31,
    fileName: "RAB_SDN_Geluran_1.pdf",
    tanggal: "6 April 2026",
    top4: [
      { 
        nama: "Pekerjaan Beton", nilai: "Rp 143.189.099", pct: "18.2%", color: "bg-blue-600",
        breakdown: [
          { nama: "Ruang Kelas Baru 1", nilai: "Rp 74.595.283" },
          { nama: "Ruang Kelas Baru 2", nilai: "Rp 68.593.815" }
        ]
      },
      { 
        nama: "Kuda-Kuda & Atap", nilai: "Rp 133.032.445", pct: "16.9%", color: "bg-indigo-600",
        breakdown: [
          { nama: "Ruang Kelas Baru 2", nilai: "Rp 52.105.570" },
          { nama: "Rehab Ruang Kelas", nilai: "Rp 43.822.590" },
          { nama: "Ruang Kelas Baru 1", nilai: "Rp 37.104.285" }
        ]
      },
      { 
        nama: "Pekerjaan Dinding", nilai: "Rp 65.233.204", pct: "8.3%", color: "bg-purple-600",
        breakdown: [
          { nama: "Ruang Kelas Baru 1", nilai: "Rp 31.808.660" },
          { nama: "Ruang Kelas Baru 2", nilai: "Rp 31.808.660" },
          { nama: "Rehab Ruang Kelas", nilai: "Rp 1.615.884" }
        ]
      },
      { 
        nama: "Interior & Perabot", nilai: "Rp 50.455.960", pct: "6.4%", color: "bg-teal-600",
        breakdown: [
          { nama: "Meja Siswa Tunggal", nilai: "Rp 42.119.280" },
          { nama: "Kursi Kerja/Guru", nilai: "Rp 4.727.740" },
          { nama: "Meja Kerja/Guru", nilai: "Rp 3.029.520" },
          { nama: "Lain-lain", nilai: "Rp 579.420" }
        ]
      }
    ],
    audit: [
      { text: "Berhasil memindai dan mem-parsing 15 halaman PDF.", type: "info", page: 1 },
      { text: "ANOMALI FATAL: Tahap I (Rp 597 Jt) + Tahap II (Rp 255 Jt) = Rp 852 Jt. Namun Total Bantuan tertulis Rp 831 Jt.", type: "warn", page: 1 },
      { text: "ANOMALI DATA: Rekapitulasi halaman 1 (Rp 731.092.000) != RAB halaman 2 (Rp 753.183.815).", type: "warn", page: 2 },
      { text: "Porsi Pembangunan Kelas Baru mendominasi (69%) dibanding Rehabilitasi.", type: "info", page: 1 },
      { text: "Nihil penganggaran pada kategori Biaya Pengelolaan Administrasi.", type: "warn", page: 1 }
    ]
  });

  parsedRABs.set("kalijaten", {
    nama: "SDN KALIJATEN",
    kabupaten: "Kab. Sidoarjo",
    totalBiaya: "Rp 785.678.000",
    tahap1: "Rp 549.97 Juta",
    tahap1Pct: "70%",
    tahap2: "Rp 235.70 Juta",
    tahap2Pct: "30%",
    pembangunanBaru: "Rp 548.56 Juta",
    pembangunanBaruPct: 70,
    rehabilitasiPct: 30,
    fileName: "RAB SDN Kalijaten.xlsx",
    isXlsx: true,
    sheets: [
      "DAFTAR  BESI IWF", "DAFTAR BESI KANAL C SIKU", "Daftar KAB", "Data Kerusakan", 
      "Input Data", "Rekap RPD", "Rekap RAB per ruang", "KURVA S", "Harga Bahan & Upah", 
      "Harsat Pekerjaan", "RAW", "Perhitungan Besi", "Rekap Pekerjaan", "Rekap Total", 
      "Rekap Volume", "Analisa", "PERSIAPAN", "RKB 2 Kopel", "1 UKS BARU ", "1A Vol. UKS", 
      "BOQ C1 (3)", "2.PERPUS BARU ", "3 TOILET BARU", "4 C1", "5 Rehab Toilet Putra"
    ],
    tanggal: "26-Apr-26",
    top4: [
      { 
        nama: "Pekerjaan Kuda-Kuda & Atap", nilai: "Rp 61.097.537", pct: "7.77%", color: "bg-indigo-600",
        breakdown: [
          { nama: "Rehab: Rangka Atap Baja Ringan", nilai: "Rp 22.603.091" },
          { nama: "Baru: Spandek / Galvalyum", nilai: "Rp 10.410.563" },
          { nama: "Rehab: Penutup Atap Genteng Tanah", nilai: "Rp 9.578.455" },
          { nama: "Baru: Rangka Atap Baja Ringan", nilai: "Rp 8.727.053" },
          { nama: "Lain-lain", nilai: "Rp 9.778.375" }
        ]
      },
      { 
        nama: "Pekerjaan Beton", nilai: "Rp 101.426.629", pct: "12.91%", color: "bg-blue-600",
        breakdown: [
          { nama: "Rehab: Beton Balok Konsol", nilai: "Rp 13.367.640" },
          { nama: "Rehab: Pasang bekisting balok", nilai: "Rp 6.014.580" },
          { nama: "Rehab: Beton Balok 1:2:3", nilai: "Rp 4.379.472" },
          { nama: "Rehab: Beton Ring Balok", nilai: "Rp 4.177.388" },
          { nama: "Lain-lain", nilai: "Rp 73.487.549" }
        ]
      },
      { 
        nama: "Pekerjaan Dinding", nilai: "Rp 49.978.785", pct: "6.36%", color: "bg-purple-600",
        breakdown: [
          { nama: "Rehab: Plesteran Dinding 1:4", nilai: "Rp 13.104.000" },
          { nama: "Rehab: Bata ringan/hebel 10cm", nilai: "Rp 12.133.200" },
          { nama: "Baru: Dinding Batubata 1:4", nilai: "Rp 7.970.300" },
          { nama: "Baru: Plesteran Dinding 1:4", nilai: "Rp 6.690.684" },
          { nama: "Lain-lain", nilai: "Rp 10.080.601" }
        ]
      },
      { 
        nama: "Pekerjaan Sanitasi & Instalasi", nilai: "Rp 43.654.485", pct: "5.55%", color: "bg-teal-600",
        breakdown: [
          { nama: "Rehab: Urinoir", nilai: "Rp 17.367.400" },
          { nama: "Baru: Urinoir", nilai: "Rp 4.339.960" },
          { nama: "Rehab: Klosed Duduk", nilai: "Rp 4.072.440" },
          { nama: "Baru: Wastafel", nilai: "Rp 2.583.570" },
          { nama: "Lain-lain", nilai: "Rp 15.291.115" }
        ]
      }
    ],
    audit: [
      { text: "Berhasil memindai RAB SDN KALIJATEN sebanyak 16 halaman.", type: "info", page: 1 },
      { text: "Pembangunan Baru lebih dominan (70%) dibanding Rehabilitasi.", type: "info", page: 1 },
      { text: "Item 'Beton Mutu Sedang Secara Manual' nilainya 0 pada RAB.", type: "warn", page: 3 },
      { text: "Nilai di rekapitulasi (785.678.926) klop dengan total di uraian.", type: "", page: 1 },
      { text: "Akurasi matematika pembulatan telah diverifikasi.", type: "info", page: 1 }
    ]
  });

  app.use(express.json());

  // API Routes
  app.get("/api/rab/:id", (req, res) => {
    const data = parsedRABs.get(req.params.id);
    if (data) {
      res.json({ success: true, data });
    } else {
      res.status(404).json({ success: false, message: "Not found" });
    }
  });

  const generatePrompt = () => `Anda adalah seorang ahli penghitung kuantitas (Quantity Surveyor) dan auditor biaya proyek.
Tugas Anda adalah membaca dokumen Rencana Anggaran Biaya (RAB) yang diberikan dalam format PDF, lalu mengekstrak datanya ke dalam sebuah format JSON yang baku dan kaku EXACTLY seperti schema yang diberikan.

Berikut adalah kriteria ekstraksi:
1. "nama": Nama sekolah / proyek. 
2. "kabupaten": Lokasi dari RAB.
3. "totalBiaya": Total Biaya Akhir / Grand Total dari RAB (format "Rp xxx.xxx.xxx").
4. "tahap1", "tahap1Pct", "tahap2", "tahap2Pct": Ekstrak atau kalkulasi komposisi tahap (biasanya persentase seperti 70% dan 30%).
5. "pembangunanBaru", "pembangunanBaruPct", "rehabilitasiPct": Ekstrak proporsi antara Pembangunan Baru dan Rehabilitasi dari Rekap RAB.
6. "fileName": Gunakan nama file yang tertera di dokumen atau buat berdasarkan nama proyek.
7. "tanggal": Tanggal dokumen / pembuatan dokumen.
8. "top4": 4 komponen biaya / pekerjaan dengan persentase tertinggi dan rinciannya. (Berikan nama komponen, nilai nominal, persentase, dan color Tailwind acak e.g. "bg-blue-600" dsb). Tiap item harus memiliki list "breakdown" maksimal 5 turunan pekerjaan. Urutkan turunan pekerjaan dari nilai terbesar ke terkecil, sehingga item kelima "Lain-lain" menjadi sisa yang paling kecil secara rasional.
9. "audit": Berikan minimal 5 finding dari hasil audit / review sederhana (array berisi objek text, tipe, dan page). Type "info" (biru), "warn" (kuning), atau kosongi (hijau/OK). Sifat "page" adalah integer (misal: 1, 2, dll.) yang menunjukkan di halaman mana temuan ini dideteksi dalam PDF.
10. Jangan berikan balasan markdown lain selain raw JSON saja!.
11. PENTING: Seluruh teks hasil ekstraksi, nama komponen pekerjaan, rincian detail breakdown sub-pekerjaan, serta poin-poin analisis temuan audit WAJIB ditulis dalam BAHASA INDONESIA yang baku, formal, dan profesional (SAMA SEKALI JANGAN menggunakan Bahasa Inggris)!
12. DETEKSI BIAYA PENGELOLAAN: Periksa secara ketat jika terdapat "Biaya Pengelolaan" atau "Biaya Administrasi/Operasional/Bintek" dalam dokumen RAB. Jika ada, Anda WAJIB memberikan rincian nominal dan persentasenya terhadap total anggaran di dalam daftar temuan "audit". Berikan catatan peringatan ("warn") jika nilainya tidak diperinci secara transparan menjadi sub-pekerjaan yang jelas (seperti perjalanan dinas, ATK, pelaporan) ATAU jika nilainya melebihi batas wajar (misalnya > 5% dari total RAB), dan berikan catatan "info" jika nilainya nihil atau wajar. Ini demi menjamin transparansi anggaran proyek!
13. KONSISTENSI DATA & ANGKA MUTLAK: Seluruh data nominal (Rupiah) dan persentase yang Anda sebutkan di dalam daftar temuan "audit" WAJIB 100% konsisten, sinkron, dan klop dengan angka yang Anda tulis di "totalBiaya", "tahap1", "tahap2", dan "top4". JANGAN PERNAH menyebutkan angka nominal yang berbeda, bertentangan, atau membulatkannya secara tidak konsisten antara tabel hasil ekstraksi dengan narasi kesimpulan audit Anda!

JSON Schema:
{
  "nama": "SDN XXX",
  "kabupaten": "Kab. XXX",
  "totalBiaya": "Rp XX.XXX.XXX.XXX",
  "tahap1": "Rp XX.XX Juta",
  "tahap1Pct": "70%",
  "tahap2": "Rp XX.XX Juta",
  "tahap2Pct": "30%",
  "pembangunanBaru": "Rp XX.XX Juta",
  "pembangunanBaruPct": 64,
  "rehabilitasiPct": 36,
  "fileName": "RAB.pdf",
  "tanggal": "18 April 2026",
  "top4": [
    { 
      "nama": "Pekerjaan X", 
      "nilai": "Rp XXX.XXX.XXX", 
      "pct": "17.5%", 
      "color": "bg-blue-600",
      "breakdown": [
        { "nama": "Sub Pekerjaan Utama", "nilai": "Rp XX.XXX" },
        { "nama": "Lain-lain", "nilai": "Rp X.XXX" }
      ]
    }
  ],
  "audit": [
    { "text": "Auditing text finding", "type": "warn", "page": 2 }
  ]
}`;
  async function callLLM(prompt: string, textContext?: string): Promise<string> {
    const fullPrompt = textContext ? `${prompt}\n\nEkstrak dari teks RAB berikut:\n${textContext}` : prompt;

    // 1. OpenRouter
    if (process.env.OPENROUTER_API_KEY) {
      const model = process.env.OPENROUTER_MODEL || "meta-llama/llama-3-8b-instruct:free";
      console.log(`[LLM] Calling OpenRouter with model: ${model}`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/pcchopath-sys/analyza-pro",
          "X-Title": "Analyza Pro"
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: fullPrompt }],
          response_format: { type: "json_object" }
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || "";
    }

    // 2. OpenAI Compatible
    if (process.env.OPENAI_API_KEY) {
      const baseUrl = (process.env.OPENAI_API_BASE || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
      const model = process.env.OPENAI_MODEL || "gpt-4o";
      console.log(`[LLM] Calling OpenAI Compatible API at ${baseUrl} with model: ${model}`);
      
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: fullPrompt }],
          response_format: { type: "json_object" }
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json() as any;
      return data.choices?.[0]?.message?.content || "";
    }

    // 3. Fallback to Gemini API
    if (process.env.GEMINI_API_KEY) {
      console.log(`[LLM] Falling back to Gemini API (gemini-2.5-flash)`);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const chatResult = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: { responseMimeType: 'application/json' }
      });
      return chatResult.text || "";
    }

    throw new Error("No LLM API keys configured! Please set OPENROUTER_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY.");
  }

  const backgroundTasks = new Map<string, { status: string, result?: any, error?: string }>();

  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const taskId = Math.random().toString(36).substring(7);
    backgroundTasks.set(taskId, { status: "processing" });
    res.json({ success: true, taskId });

    // Background processing
    const filePath = req.file.path;
    const fileName = req.file.originalname;
    const fileExt = path.extname(fileName).toLowerCase();
    const isXlsx = [".xlsx", ".xls"].includes(fileExt);

    (async () => {
      try {
        let parsed: any = null;
        let fileContentText = "";
        let excelSheets: string[] = [];

        if (isXlsx) {
          console.log(`[PARSER] Processing Excel file: ${fileName}`);
          try {
            const scriptPath = os.homedir() + "/.hermes/scripts/perception_layer.py";
            const cmd = `python3 "${scriptPath}" --file "${filePath}" --json`;
            const { stdout } = await execPromise(cmd);
            const parsedRes = JSON.parse(stdout.trim());
            if (parsedRes.success && parsedRes.text) {
              fileContentText = parsedRes.text;
              excelSheets = parsedRes.sheets || [];
              console.log(`[PARSER] Excel extraction succeeded. Character count: ${parsedRes.chars_extracted}`);
            } else {
              throw new Error(parsedRes.error || "Gagal mengekstrak konten Excel");
            }
          } catch (excelError: any) {
            console.error("Excel perception parsing failed:", excelError);
            throw new Error("Gagal mengekstrak teks Excel: " + excelError.message);
          }

          if (fileContentText) {
            console.log("Using LLM for Excel JSON extraction...");
            const jsonResponse = await callLLM(generatePrompt(), fileContentText.substring(0, 30000));
            if (jsonResponse) {
              const cleaned = jsonResponse.replace(/```json\n?/g, '').replace(/```/g, '').trim();
              parsed = JSON.parse(cleaned);
              parsed.isXlsx = true;
              parsed.sheets = excelSheets;
              parsed.sheetData = parseExcelTextToSheets(fileContentText);
              parsed.audit.unshift({ text: "Sistem menerapkan OCR tabular pintar untuk memetakan sheet Excel secara terstruktur.", type: "info", page: 1 });
            }
          }
        } else {
          // Standard PDF parsing flow
          let pdfText = "";
          // 1. Deterministic Extraction First
          try {
            const pdfParseModule = await import("pdf-parse");
            const pdfParse = (pdfParseModule as any).default || pdfParseModule;
            const dataBuffer = fs.readFileSync(filePath);
            const pdfData = await (pdfParse as any)(dataBuffer);
            pdfText = pdfData.text;
            
            if (pdfText && pdfText.length > 50) {
              // RegEx Deterministic Parsing
              const result: any = {
                nama: "Tidak Diketahui",
                kabupaten: "Tidak Diketahui",
                totalBiaya: "Rp 0",
                tahap1: "Rp 0",
                tahap1Pct: "70%",
                tahap2: "Rp 0",
                tahap2Pct: "30%",
                pembangunanBaru: "Rp 0",
                pembangunanBaruPct: 0,
                rehabilitasiPct: 0,
                fileName: fileName,
                tanggal: "-",
                top4: [],
                audit: [
                  { text: "Dokumen berhasil diekstrak melalui pemindaian teks standar (Efisiensi Tinggi).", type: "info", page: 1 }
                ]
              };

              const namaMatch = pdfText.match(/Nama Sekolah\s*:\s*([^\n]+)/i);
              if (namaMatch) result.nama = namaMatch[1].trim();

              const kabMatch = pdfText.match(/Kab(?:upaten|\.\/kota)?\s*:\s*([^\n]+)/i);
              if (kabMatch) result.kabupaten = kabMatch[1].trim();

              const tglMatch = pdfText.match(/Tanggal\s+Bintek\s*:\s*([^\n]+)/i);
              if (tglMatch) result.tanggal = tglMatch[1].trim();

              const totalMatch = pdfText.match(/(?:TOTAL BANTUAN\s*\(Rp\.\s*\)|PEMBULATAN TOTAL)\s*([\d,.]+)/i);
              if (totalMatch) {
                result.totalBiaya = "Rp " + totalMatch[1].replace(/,/g, '.').trim();
              }

              if (result.nama !== "Tidak Diketahui" && totalMatch) {
                parsed = result;
              }
            }
          } catch (deterministicError) {
            console.log("Deterministic Regex parsing failed or incomplete, falling back to LLM...");
          }

          // 2. LLM Text-only fallback
          if (!parsed && pdfText && pdfText.length > 50) {
            console.log("Using LLM Text Fallback...");
            const jsonResponse = await callLLM(generatePrompt(), pdfText.substring(0, 30000));
            if (jsonResponse) {
              const cleaned = jsonResponse.replace(/```json\n?/g, '').replace(/```/g, '').trim();
              parsed = JSON.parse(cleaned);
              parsed.audit.unshift({ text: "Sistem menerapkan analisis teks semantik untuk memproses format yang tidak standar.", type: "info", page: 1 });
            }
          }

          // 3. Multimodal LLM as last resort
          if (!parsed) {
            console.log("Using Multimodal File API Last Resort...");
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const uploadResponse = await ai.files.upload({
              file: filePath,
              config: { mimeType: "application/pdf" }
            });

            let fileStatus = uploadResponse;
            let attempts = 0;
            while (fileStatus.state === "PROCESSING" && attempts < 30) {
              await new Promise(r => setTimeout(r, 2000));
              fileStatus = await ai.files.get({ name: uploadResponse.name });
              attempts++;
            }

            if (fileStatus.state === "FAILED") {
              throw new Error("Gagal memproses file di server Gemini");
            }

            const chatResult = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: [
                {
                  role: 'user',
                  parts: [
                    { fileData: { fileUri: uploadResponse.uri, mimeType: uploadResponse.mimeType } },
                    { text: generatePrompt() }
                  ]
                }
              ],
              config: {
                responseMimeType: 'application/json',
              }
            });
            
            let jsonResponse = chatResult.text;
            if (jsonResponse) {
              jsonResponse = jsonResponse.replace(/```json\n?/g, '').replace(/```/g, '').trim();
              parsed = JSON.parse(jsonResponse);
              parsed.audit.unshift({ text: "Struktur kompleks terdeteksi: Sistem melakukan analisis pemindaian dokumen visual secara menyeluruh.", type: "warn", page: 1 });
            } else {
              throw new Error("Failed to generate json from Gemini");
            }
          }
        }

        if (parsed) {
          // Copy PDF/Excel to uploads dir persistently
          const destPath = path.join(uploadsDir, `${taskId}${fileExt}`);
          fs.copyFileSync(filePath, destPath);
          
          // Run deterministic audit validator
          const extraFindings = runDeterministicAudit(parsed);
          parsed.audit = [...extraFindings, ...parsed.audit];
          
          parsedRABs.set(taskId, parsed);
          backgroundTasks.set(taskId, { status: "done", result: taskId });
        } else {
          throw new Error("Gagal memparsing berkas");
        }
      } catch (e: any) {
        console.error("Background task error:", e);
        backgroundTasks.set(taskId, { status: "error", error: e.message });
      } finally {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    })();
  });

  app.get("/api/upload/status/:id", (req, res) => {
    const task = backgroundTasks.get(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: "Task not found" });
    }
    res.json({ success: true, task });
  });

  app.get("/api/sync/changes", (req, res) => {
    const logPath = "/root/.hermes/data/audit_changes.json";
    if (fs.existsSync(logPath)) {
      try {
        const raw = fs.readFileSync(logPath, "utf-8");
        res.json({ success: true, changes: JSON.parse(raw) });
      } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
      }
    } else {
      res.json({ success: true, changes: [] });
    }
  });

  app.post("/api/sync/force", async (req, res) => {
    try {
      const scriptPath = "/root/.hermes/scripts/sync_office_to_boss.py";
      console.log("[SYNC] Memicu sinkronisasi manual dari dashboard...");
      
      const { exec } = await import("child_process");
      exec(`python3 "${scriptPath}"`, (error, stdout, stderr) => {
        if (error) {
          console.error(`[SYNC ERROR] ${error.message}`);
          return;
        }
        console.log(`[SYNC SUCCESS] ${stdout.trim()}`);
      });

      res.json({ success: true, message: "Sinkronisasi berhasil dipicu di latar belakang." });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Telegram bot setup
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const isTokenValid = token && /^\d+:[a-zA-Z0-9_-]{35,}$/.test(token);

  if (isTokenValid) {
    console.log("Starting Telegram Bot...");
    const bot = new Telegraf(token!);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    bot.start((ctx) => ctx.reply('Halo Boss! Kirimkan file PDF atau Excel (.xlsx/.xls) RAB ke sini, biar Gemma analisa pake Gemini AI secara otomatis.'));
    
    bot.on('document', async (ctx) => {
      try {
        const file = ctx.message.document;
        const fileName = file.file_name || "";
        const fileExt = path.extname(fileName).toLowerCase();
        const allowedExts = [".pdf", ".xlsx", ".xls"];
        
        if (!allowedExts.includes(fileExt)) {
          return ctx.reply('⚠️ Format file tidak didukung, Boss. Kirimkan file RAB berformat PDF (.pdf) atau Excel (.xlsx/.xls) aja ya.');
        }
        
        ctx.reply('⏳ Sedang mengunduh dan menganalisa dokumen RAB Boss. Mohon tunggu...');
        
        const fileLink = await ctx.telegram.getFileLink(file.file_id);
        
        // Download file to temp
        const response = await fetch(fileLink.href);
        const buffer = await response.arrayBuffer();
        const tempPath = path.join(os.tmpdir(), `${file.file_id}${fileExt}`);
        fs.writeFileSync(tempPath, Buffer.from(buffer));
        
        let jsonResponse = "";
        let parsed: any = null;
        let fileContentText = "";
        let excelSheets: string[] = [];
        const isXlsx = [".xlsx", ".xls"].includes(fileExt);
        
        if (isXlsx) {
          console.log(`[TELEGRAM BOT] Processing Excel file: ${fileName}`);
          try {
            const scriptPath = os.homedir() + "/.hermes/scripts/perception_layer.py";
            const cmd = `python3 "${scriptPath}" --file "${tempPath}" --json`;
            const { stdout } = await execPromise(cmd);
            const parsedRes = JSON.parse(stdout.trim());
            if (parsedRes.success && parsedRes.text) {
              fileContentText = parsedRes.text;
              excelSheets = parsedRes.sheets || [];
              console.log(`[TELEGRAM BOT] Excel extraction succeeded. Character count: ${parsedRes.chars_extracted}`);
            } else {
              throw new Error(parsedRes.error || "Gagal mengekstrak konten Excel");
            }
          } catch (excelError: any) {
            console.error("Excel perception parsing failed:", excelError);
            throw new Error("Gagal mengekstrak teks Excel: " + excelError.message);
          }

          if (fileContentText) {
            console.log("Telegram Bot: Using LLM for Excel JSON extraction...");
            jsonResponse = await callLLM(generatePrompt(), fileContentText.substring(0, 30000));
            if (jsonResponse) {
              const cleaned = jsonResponse.replace(/```json\n?/g, '').replace(/```/g, '').trim();
              parsed = JSON.parse(cleaned);
              parsed.isXlsx = true;
              parsed.sheets = excelSheets;
              parsed.sheetData = parseExcelTextToSheets(fileContentText);
              parsed.audit.unshift({ text: "Sistem menerapkan OCR tabular pintar untuk memetakan sheet Excel secara terstruktur.", type: "info", page: 1 });
            }
          }
        } else {
          // Standard PDF parsing flow
          let pdfText = "";
          let parsedWithText = false;
          try {
            const pdfParseModule = await import("pdf-parse");
            const pdfParse = (pdfParseModule as any).default || pdfParseModule;
            const dataBuffer = fs.readFileSync(tempPath);
            const pdfData = await (pdfParse as any)(dataBuffer);
            pdfText = pdfData.text;
            
            if (pdfText && pdfText.length > 50) {
              console.log("Telegram Bot: Using callLLM Text Parser...");
              jsonResponse = await callLLM(generatePrompt(), pdfText.substring(0, 30000));
              parsedWithText = true;
            }
          } catch (err) {
            console.log("Telegram Bot: Local PDF text extraction failed or returned no text, falling back to Multimodal...", err);
          }

          // Multimodal Fallback using Gemini File API
          if (!parsedWithText) {
            if (process.env.GEMINI_API_KEY) {
              console.log("Telegram Bot: Using Multimodal Gemini Files API...");
              const uploadResponse = await ai.files.upload({
                file: tempPath,
                config: {
                  mimeType: "application/pdf"
                }
              });
              
              const prompt = generatePrompt();
              const chatResult = await ai.models.generateContent({
                 model: 'gemini-2.5-flash',
                 contents: [
                   {
                     role: 'user',
                     parts: [
                       { fileData: { fileUri: uploadResponse.uri, mimeType: uploadResponse.mimeType } },
                       { text: prompt }
                     ]
                   }
                 ],
                 config: {
                   responseMimeType: 'application/json',
                 }
              });
              jsonResponse = chatResult.text || "";
            } else {
              throw new Error("Local text extraction failed and no GEMINI_API_KEY configured for multimodal fallback.");
            }
          }
          
          if (jsonResponse) {
            jsonResponse = jsonResponse.replace(/```json\n?/g, '').replace(/```/g, '').trim();
            parsed = JSON.parse(jsonResponse);
          }
        }

        if (parsed) {
          const id = file.file_id;
          
          // Save PDF/Excel persistently in uploads with correct extension
          const destPath = path.join(uploadsDir, `${id}${fileExt}`);
          fs.copyFileSync(tempPath, destPath);
          
          // Run deterministic audit validator
          const extraFindings = runDeterministicAudit(parsed);
          parsed.audit = [...extraFindings, ...parsed.audit];
          
          parsedRABs.set(id, parsed);
          
          const appUrl = process.env.APP_URL || `http://${os.hostname()}:3000`;
          const resultUrl = `${appUrl}?id=${id}`;
          
          await ctx.reply(`✅ Analisa RAB selesai, Boss!\n\n📄 Proyek: ${parsed.nama}\n💰 Total: ${parsed.totalBiaya}\n\nLihat laporan detail terpadu: ${resultUrl}`);
        } else {
          await ctx.reply('❌ Gagal menghasilkan struktur JSON dari dokumen RAB, Boss.');
        }

        // Clean up
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (e: any) {
        console.error(e);
        ctx.reply(`❌ Ada yang error pas analisis RAB, Boss: ${e.message}`);
      }
    });

    bot.launch().catch((err) => {
      console.error("❌ Gagal meluncurkan Telegram Bot (Token mungkin salah atau duplikat):", err.message);
    });
    
    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));
  } else {
    console.warn("TELEGRAM_BOT_TOKEN is not set atau tidak valid. Telegram bot tidak dijalankan.");
  }

  app.use((err: any, req: any, res: any, next: any) => {
    console.error('Express Error:', err);
    res.status(500).json({ success: false, message: err.message || "Internal server error" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Self-Cleaning Storage Guard (Capped at 12 hours)
  function runStorageCleanup() {
    try {
      if (!fs.existsSync(uploadsDir)) return;
      const files = fs.readdirSync(uploadsDir);
      const now = Date.now();
      const maxAge = 12 * 60 * 60 * 1000; // 12 jam toleransi dalam milidetik

      files.forEach(file => {
        // JANGAN hapus sampel default visualizer
        if (["default.pdf", "geluran.pdf", "kalijaten.pdf"].includes(file)) {
          return;
        }

        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (stats.isFile() && age > maxAge) {
          fs.unlinkSync(filePath);
          console.log(`[STORAGE GUARD] Deleted old cached PDF: ${file} (Age: ${Math.round(age / 3600000)}h)`);
        }
      });
    } catch (err) {
      console.error("Storage Guard error:", err);
    }
  }

  // Jalankan pembersihan saat startup & berkala setiap 1 jam
  runStorageCleanup();
  setInterval(runStorageCleanup, 60 * 60 * 1000);

  // Jalankan parsing asinkron untuk sampel kalijaten saat startup secara otonom
  (async () => {
    try {
      const kalijatenPath = path.join(uploadsDir, "kalijaten.xlsx");
      if (fs.existsSync(kalijatenPath)) {
        console.log("[STARTUP] Parsing Excel sampel Kalijaten secara otonom...");
        const scriptPath = os.homedir() + "/.hermes/scripts/perception_layer.py";
        const cmd = `python3 "${scriptPath}" --file "${kalijatenPath}" --json`;
        const { stdout } = await execPromise(cmd);
        const parsedRes = JSON.parse(stdout.trim());
        if (parsedRes.success && parsedRes.text) {
          const kalData = parsedRABs.get("kalijaten");
          if (kalData) {
            kalData.sheets = parsedRes.sheets || [];
            kalData.sheetData = parseExcelTextToSheets(parsedRes.text);
            parsedRABs.set("kalijaten", kalData);
            console.log("[STARTUP] Sukses memparsing & menyuntikkan sheetData sampel Kalijaten!");
          }
        }
      }
    } catch (startupErr) {
      console.error("[STARTUP] Gagal memparsing sampel Kalijaten:", startupErr);
    }
  })();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
