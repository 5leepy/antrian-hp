# 🚕 AntriCas

Aplikasi web modern berbasis *mobile-first* (PWA) untuk manajemen antrian pengisian daya taksi listrik (EV) di SPKLU. Dirancang khusus untuk efisiensi operator lapangan dengan antarmuka sehalus aplikasi *native* dan estetika *Indigo Steel*.

## ✨ Fitur Unggulan

- ⚡ **Indigo Master Call**: Tombol panggil utama yang mencolok di tengah alur kerja untuk memanggil taksi berikutnya secara instan.
- 🏗️ **Smart Dispatch Dashboard**: Visualisasi 12 Nozzle (6 Dispenser) dengan indikator LED status (Charging, Ready, Maintenance).
- 🔄 **Advanced Undo System**: Perlindungan 7 detik untuk membatalkan aksi yang tidak sengaja (Selesai/Batal/Panggil).
- 📲 **Seamless QR Handoff**: Pindahkan seluruh data antrian ke HP rekan operator pengganti hanya dalam hitungan detik tanpa server awan.
- 🌓 **Hybrid Theme Control**: Deteksi otomatis tema gelap/terang perangkat dengan opsi kendali manual.
- ⏩ **Manajemen Cerdas**: Fitur *Skip* urutan, *Edit* nomor lambung, dan identifikasi taksi tak dikenal ("---").
- 🔊 **Notifikasi Audio & Haptic**: Konfirmasi taktil dan suara beep sintesis untuk setiap aksi penting.
- 🗄️ **Offline-First & Persisten**: Data tersimpan aman di *Local Storage* agar tidak hilang saat browser ditutup.

## 🛠️ Tech Stack

- **Framework**: Next.js 15+ (App Router)
- **Library UI**: React 19
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide Icons
- **Compression**: LZ-String (untuk payload QR yang sangat ringan)

## 🗺️ Rencana Pengembangan (Roadmap)

Berdasarkan kesepakatan dan rencana operasional, berikut adalah optimisasi yang akan datang:

1. 📳 **Differentiated Haptics**: Variasi pola getaran yang lebih spesifik untuk Input (Short), Sukses (Double), dan Panggil (Long).
2. 🚨 **Dashboard LED Indicators**: Indikator visual titik status yang lebih statis dan kontras di setiap nozzle untuk kemudahan pemantauan.
3. 🔔 **Advanced Sound Feedback**: Penambahan bunyi beep yang berbeda untuk setiap transisi status (Waiting to Charging vs Charging to Completed).
4. 📊 **Export History**: Fitur untuk mengekspor riwayat antrian hari ini ke format CSV/Excel untuk pelaporan admin.

## 🚀 Cara Menjalankan (Development)

Aplikasi ini dirancang untuk dijalankan di jaringan lokal agar bisa diakses langsung via HP petugas:

1. **Install Dependensi:**
   ```bash
   npm install
   ```

2. **Jalankan Dev Server:**
   ```bash
   npm run dev
   ```

3. **Akses Aplikasi:**
   - **PC/Laptop**: [http://localhost:3000](http://localhost:3000)
   - **Smartphone**: Gunakan IP Laptop Anda (misal: `http://192.168.1.15:3000`)

---
*Developed by **Nadir Nahdi** with ❤️ for efficiency.*

