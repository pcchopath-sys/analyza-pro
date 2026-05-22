#!/bin/bash
# ==============================================================================
# 🚀 ANALYZA PRO - AUTO UPDATER & DEPLOYMENT SCRIPT (CENAI DOCTRINE)
# ==============================================================================
# Skrip ini berjalan secara lokal di server Armbian untuk melakukan sinkronisasi
# kode terbaru dari GitHub Boss secara aman tanpa menimpa data konfigurasi lokal.

echo "============================================="
echo "⚙️  MEMULAI PEMBARUAN OTOMATIS ANALYZA PRO"
echo "============================================="

# 1. Tarik pembaruan kode dari GitHub
echo "📥 Menarik kode terbaru dari GitHub..."
git pull origin main
if [ $? -ne 0 ]; then
  echo "❌ Gagal menarik perubahan dari GitHub. Silakan periksa koneksi internet Anda."
  exit 1
fi

# 2. Instal dependensi baru jika ada perubahan di package.json
echo "📦 Memasang dependensi baru (jika ada)..."
npm install
if [ $? -ne 0 ]; then
  echo "❌ Gagal menginstal dependensi."
  exit 1
fi

# 3. Lakukan build backend secara bersih
echo "🏗️  Membangun aplikasi (build)..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Gagal membangun aplikasi (build error)."
  exit 1
fi

# 4. Deteksi dan restart service yang aktif (Systemd atau PM2)
echo "🔄 Me-restart layanan aplikasi..."
if systemctl list-units --type=service | grep -q "analyza-pro.service"; then
  echo "⚡ Mendeteksi layanan Systemd aktif. Me-restart 'analyza-pro'..."
  systemctl restart analyza-pro
  echo "✅ Layanan Systemd berhasil direstart!"
elif command -v pm2 &> /dev/null && pm2 list | grep -q "analyza-pro"; then
  echo "⚡ Mendeteksi layanan PM2 aktif. Me-restart 'analyza-pro'..."
  pm2 restart analyza-pro
  echo "✅ Layanan PM2 berhasil direstart!"
else
  echo "⚠️  Layanan Systemd/PM2 tidak terdeteksi berjalan."
  echo "💡 Silakan restart server secara manual atau daftarkan ke Systemd menggunakan panduan."
fi

echo "============================================="
echo "🎉 PEMBARUAN SELESAI DENGAN SUKSES! (CENAI)"
echo "============================================="
