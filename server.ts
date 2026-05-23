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

const upload = multer({ dest: os.tmpdir() });

// We can just use the global fetch in Node 18+
// but node-fetch is fine if we needed it

const PORT = 4000;
const parsedRABs = new Map<string, any>();

async function startServer() {
  const app = express();
  
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
      { text: "Dokumen dipindai: 17 halaman OCR diekstrak." },
      { text: "Verifikasi struktural RAB selesai." },
      { text: "Item 'Tangga Beton' mengindikasikan bangunan bertingkat.", type: "warn" },
      { text: "Verifikasi rumus: Nilai cocok dengan total Halaman 2." },
      { text: "4 Kategori utama terdeteksi secara otomatis.", type: "info" }
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
      { text: "Berhasil memindai dan mem-parsing 15 halaman PDF.", type: "info" },
      { text: "ANOMALI FATAL: Tahap I (Rp 597 Jt) + Tahap II (Rp 255 Jt) = Rp 852 Jt. Namun Total Bantuan tertulis Rp 831 Jt.", type: "warn" },
      { text: "ANOMALI DATA: Rekapitulasi halaman 1 (Rp 731.092.000) != RAB halaman 2 (Rp 753.183.815).", type: "warn" },
      { text: "Porsi Pembangunan Kelas Baru mendominasi (69%) dibanding Rehabilitasi.", type: "info" },
      { text: "Nihil penganggaran pada kategori Biaya Pengelolaan Administrasi.", type: "warn" }
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
    fileName: "RAB SDN Kalijaten.pdf",
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
      { text: "Berhasil memindai RAB SDN KALIJATEN sebanyak 16 halaman.", type: "info" },
      { text: "Pembangunan Baru lebih dominan (70%) dibanding Rehabilitasi.", type: "info" },
      { text: "Item 'Beton Mutu Sedang Secara Manual' nilainya 0 pada RAB.", type: "warn" },
      { text: "Nilai di rekapitulasi (785.678.926) klop dengan total di uraian.", type: "" },
      { text: "Akurasi matematika pembulatan telah diverifikasi.", type: "" }
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
9. "audit": Berikan minimal 5 finding dari hasil audit / review sederhana (array berisi objek text dan tipe). Type "info" (biru), "warn" (kuning), atau kosongi (hijau/OK).
10. Jangan berikan balasan markdown lain selain raw JSON saja!.

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
    { "text": "Auditing text finding", "type": "warn" }
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
    (async () => {
      try {
        let parsed: any = null;
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
                { text: "Dokumen berhasil diekstrak melalui pemindaian teks standar (Efisiensi Tinggi).", type: "info" }
              ]
            };

            const namaMatch = pdfText.match(/Nama Sekolah\s*:\s*([^\n]+)/i);
            if (namaMatch) result.nama = namaMatch[1].trim();

            const kabMatch = pdfText.match(/Kab(?:upaten|\.\/kota)?\s*:\s*([^\n]+)/i);
            if (kabMatch) result.kabupaten = kabMatch[1].trim();

            const tglMatch = pdfText.match(/Tanggal\s+Bintek\s*:\s*([^\n]+)/i);
            if (tglMatch) result.tanggal = tglMatch[1].trim();

            // Total Biaya
            const totalMatch = pdfText.match(/(?:TOTAL BANTUAN\s*\(Rp\.\s*\)|PEMBULATAN TOTAL)\s*([\d,.]+)/i);
            if (totalMatch) {
              result.totalBiaya = "Rp " + totalMatch[1].replace(/,/g, '.').trim();
            }

            // We require minimum these to count as "success"
            if (result.nama !== "Tidak Diketahui" && totalMatch) {
              parsed = result;
            }
          }
        } catch (deterministicError) {
          console.log("Deterministic Regex parsing failed or incomplete, falling back to LLM...");
        }

        // 2. LLM Text-only fallback (Cheaper than File API)
        if (!parsed && pdfText && pdfText.length > 50) {
          console.log("Using LLM Text Fallback...");
          const jsonResponse = await callLLM(generatePrompt(), pdfText.substring(0, 30000));
          if (jsonResponse) {
            const cleaned = jsonResponse.replace(/```json\n?/g, '').replace(/```/g, '').trim();
            parsed = JSON.parse(cleaned);
            parsed.audit.unshift({ text: "Sistem menerapkan analisis teks semantik untuk memproses format yang tidak standar.", type: "info" });
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
            parsed.audit.unshift({ text: "Struktur kompleks terdeteksi: Sistem melakukan analisis pemindaian dokumen visual secara menyeluruh.", type: "warn" });
          } else {
            throw new Error("Failed to generate json from Gemini");
          }
        }
        
        if (parsed) {
          parsedRABs.set(taskId, parsed);
          backgroundTasks.set(taskId, { status: "done", result: taskId });
        } else {
          throw new Error("Gagal memparsing PDF");
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

  // Telegram bot setup
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const isTokenValid = token && /^\d+:[a-zA-Z0-9_-]{35,}$/.test(token);

  if (isTokenValid) {
    console.log("Starting Telegram Bot...");
    const bot = new Telegraf(token!);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    bot.start((ctx) => ctx.reply('Halo! Kirimkan file PDF RAB ke sini, dan saya akan menganalisanya menggunakan Gemini AI.'));
    
    bot.on('document', async (ctx) => {
      try {
        const file = ctx.message.document;
        if (file.mime_type !== 'application/pdf') {
          return ctx.reply('Mohon kirimkan file dalam format PDF.');
        }
        
        ctx.reply('⏳ Sedang mengunduh dan menganalisa dokumen RAB Anda. Mohon tunggu...');
        
        const fileLink = await ctx.telegram.getFileLink(file.file_id);
        
        // Download file to temp
        const response = await fetch(fileLink.href);
        const buffer = await response.arrayBuffer();
        const tempPath = path.join(os.tmpdir(), `${file.file_id}.pdf`);
        fs.writeFileSync(tempPath, Buffer.from(buffer));
        
        let jsonResponse = "";
        let parsedWithText = false;
        
        // 1. Try local PDF text extraction first
        try {
          const pdfParseModule = await import("pdf-parse");
          const pdfParse = (pdfParseModule as any).default || pdfParseModule;
          const dataBuffer = fs.readFileSync(tempPath);
          const pdfData = await (pdfParse as any)(dataBuffer);
          const pdfText = pdfData.text;
          
          if (pdfText && pdfText.length > 50) {
            console.log("Telegram Bot: Using callLLM Text Parser...");
            jsonResponse = await callLLM(generatePrompt(), pdfText.substring(0, 30000));
            parsedWithText = true;
          }
        } catch (err) {
          console.log("Telegram Bot: Local PDF text extraction failed or returned no text, falling back to Multimodal...", err);
        }

        // 2. Multimodal Fallback using Gemini File API if local extraction failed and Gemini key is available
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
          // Strip markdown backticks if present
          jsonResponse = jsonResponse.replace(/```json\n?/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(jsonResponse);
          const id = file.file_id;
          parsedRABs.set(id, parsed);
          
          const appUrl = process.env.APP_URL || `http://${os.hostname()}:3000`;
          const resultUrl = `${appUrl}?id=${id}`;
          
          await ctx.reply(`✅ Analisa RAB selesai!\n\n📄 Proyek: ${parsed.nama}\n💰 Total: ${parsed.totalBiaya}\n\nLihat laporan detail: ${resultUrl}`);
        } else {
           await ctx.reply('❌ Gagal menghasilkan struktur JSON dari dokumen.');
        }

        // Clean up
        fs.unlinkSync(tempPath);
      } catch (e: any) {
        console.error(e);
        ctx.reply(`❌ Terjadi kesalahan: ${e.message}`);
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
