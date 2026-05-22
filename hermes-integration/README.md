# 🤖 INTEGRASI HERMES AGENT & DEPLOYMENT PANDUAN OTONOM

Panduan ini ditujukan bagi Agen Kecerdasan Buatan (atau Administrator Sistem) untuk melakukan deploy dan integrasi **Analyza Pro** ke server **Armbian** (`root@192.168.1.11`) secara mandiri.

---

## 🚀 LANGKAH DEPLOYMENT & INTEGRASI OTONOM

Jalankan seluruh langkah di bawah ini langsung dari dalam sesi terminal server **Armbian**:

### 1️⃣ Uji Persyaratan Node.js
Pastikan Node.js v18+ dan npm telah terinstal di server Armbian:
```bash
node -v && npm -v
```
*Jika belum terpasang, jalankan:*
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs
```

### 2️⃣ Clone Repositori Analyza Pro ke Server
Clone proyek mandiri ini langsung dari GitHub Boss ke direktori kerja `/opt/analyza-pro`:
```bash
git clone https://github.com/pcchopath-sys/analyza-pro.git /opt/analyza-pro
```

### 3️⃣ Instal Dependensi & Jalankan Build
Masuk ke folder proyek, salin konfigurasi env, instal dependensi secara bersih, lalu bangun proyek:
```bash
cd /opt/analyza-pro
cp .env.example .env
npm install
npm run build
```
*(Sesuaikan isi `.env` jika memerlukan konfigurasi API Key spesifik).*

### 4️⃣ Jalankan Backend Secara Persisten
Gunakan **PM2** (jika tersedia) atau buat **Systemd Service** agar aplikasi berjalan stabil di port 4000:

*   **Menggunakan Systemd Service (Rekomendasi)**:
    Buat berkas `/etc/systemd/system/analyza-pro.service`:
    ```ini
    [Unit]
    Description=Analyza Pro RAB Service
    After=network.target

    [Service]
    Type=simple
    User=root
    WorkingDirectory=/opt/analyza-pro
    ExecStart=/usr/bin/node dist/server.cjs
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target
    ```
    Jalankan layanan tersebut:
    ```bash
    systemctl daemon-reload && systemctl enable analyza-pro && systemctl start analyza-pro
    ```

### 5️⃣ Pasang Skrip Integrasi ke Hermes Agent
1. Buat folder skrip Hermes jika belum ada:
   ```bash
   mkdir -p /root/.hermes/scripts/
   ```
2. Salin skrip python integrasi dari folder repositori ke folder sistem Hermes:
   ```bash
   cp /opt/analyza-pro/hermes-integration/rab_analyzer.py /root/.hermes/scripts/rab_analyzer.py
   chmod +x /root/.hermes/scripts/rab_analyzer.py
   ```

### 6️⃣ Konfigurasikan Hermes Agent
1. Buka berkas konfigurasi tambahan Hermes Agent di server Anda (biasanya `hermes_config_additions.yaml` atau berkas konfigurasi YAML di `/root/.hermes` atau `/opt/hermes-agent/`).
2. Sisipkan deklarasi tool `rab_analyzer` berikut ke dalam konfigurasi tools:
   ```yaml
     - name: "rab_analyzer"
       type: "python"
       script: "/root/.hermes/scripts/rab_analyzer.py"
       description: "Analisis cerdas tabel RAB PDF menggunakan model hibrida CENAI (Deterministic + LLM Fallback)"
       input:
         file_path: "string"
   ```
3. Lakukan restart pada layanan Hermes Agent di server Anda (misal via PM2 atau Systemd) agar konfigurasi baru terbaca secara dinamis.

---

## 🏁 VERIFIKASI AKHIR

*   **Uji API Server**: Pastikan server merespons dengan benar:
    ```bash
    curl -s http://localhost:4000/api/rab/default | grep -q 'success' && echo '✅ Server Aktif!' || echo '❌ Server Offline'
    ```
*   **Uji Skrip Integrasi**: Jalankan pengujian otonom:
    ```bash
    python3 /root/.hermes/scripts/rab_analyzer.py '{"file_path": "/opt/analyza-pro/dummy.txt"}'
    ```
