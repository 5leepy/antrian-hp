# 🚕 AntriCas

Aplikasi web modern berbasis *mobile-first* (PWA) untuk manajemen antrian pengisian daya taksi listrik (EV) di SPKLU. Dirancang khusus untuk efisiensi operator lapangan dengan antarmuka sehalus aplikasi *native*.

## ✨ Fitur Unggulan

- ⚡ **Smart Dispatch Dashboard**: Satu tombol utama untuk mengalihkan antrian ke stasiun pengisian secara otomatis.
- 🏗️ **Konfigurasi Stasiun Fleksibel**: Mendukung pengaturan 1, 2, hingga 12 Nozzle sekaligus (Pool Besar).
- 📲 **Seamless QR Handoff**: Pindahkan seluruh data antrian ke HP rekan operator pengganti hanya dalam hitungan detik tanpa server awan.
- 🌓 **Hybrid Theme Control**: Deteksi otomatis tema gelap/terang perangkat dengan opsi kendali manual.
- ⏩ **Manajemen Cerdas**: Fitur *Skip* urutan, *Edit* nomor lambung, dan tombol *Undo* untuk meminimalkan kesalahan input.
- 🔊 **Notifikasi Audio**: Bunyi beep sintesis untuk memberikan sinyal konfirmasi saat taksi selesai dicas.
- 🗄️ **Offline-First & Persisten**: Menggunakan *Local Storage* agar data tidak hilang saat browser ditutup atau sinyal internet buruk.

## 🛠️ Tech Stack

- **Framework**: Next.js 15+ (App Router)
- **Library UI**: React 19
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide Icons
- **Compression**: LZ-String (untuk QR payload yang ringan)

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
