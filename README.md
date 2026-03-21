# EV Charging Queue Management

Aplikasi web modern berbasis *mobile* untuk manajemen antrian pengisian daya taksi listrik (EV). Dibangun menggunakan **Next.js 16**, **React 19**, **Tailwind CSS 4**, dan **Lucide Icons**.

## ✨ Fitur Utama

- 🚗 **Manajemen Antrian Fleksibel**: Tambahkan armada (*fleet number*) ke antrian, masukkan ke stasiun *charging* (maks. 2 nozzle), dan operasikan status (*Selesai* atau *Batal*) sehalus aplikasi native.
- ⏭️ **Lewati (Skip) Rank**: Taksi dapat di-skip / bertukar antrian ke bawah hanya lewat satu tombol.
- 📱 **Swipe-to-Confirm**: Modul pergeseran tombol kustom layaknya fitur "Slide to Unlock" untuk menyelesaikan antrian dan mencegah aksi tak disengaja.
- 💱 **Shift Handover via QR Code**: Fitur tanpa-server yang menjejali seluruh antrian aktif melalui *QR Code* ke layar HP operator selanjutnya dalam hitungan detik. 
- 🌓 **Sistem Mode Terang & Gelap**: Kompatibilitas tema (*Light Mode*) bagi teknisi jika layar *smartphone* kurang terlihat di lingkungan pengisian _outdoor_.
- ⏱️ **Kalkulasi ETA**: Secara langsung memberikan estimasi durasi *charging* rata-rata berdasarkan tempat antrian mobil.
- 🔊 **Tone Notifikasi Suara**: Generator efek "Beep" sintesis langsung dari kode JS (Web Audio API) yang hemat memori tanpa file audio.
- 🗄 **Penyimpanan Lokal Persisten**: Otomatis menyimpan riwayat dan antrian ke dalam perangkat itu sendiri dengan aman, mencegah hilangnya data akibat _reload_.

## 🚀 Cara Menjalankan (Development)

Sistem akan otomatis berjalan di semua alamat (*network host*) sehingga Anda dapat mengaksesnya lewat HP dan laptop Anda asalkan menggunakan paket Wi-Fi / jaringan yang persis sama.

**1. Install Dependensi:**
```bash
npm install
```

**2. Jalankan Dev Server:**
```bash
npm run dev
```

**3. Buka di Browser:**
- Dari Laptop: Kunjungi [http://localhost:3000](http://localhost:3000)
- Dari HP: Kunjungi `http://<IP_LAPTOP_ANDA>:3000` (contoh: `http://192.168.1.15:3000`)

## 🌐 Publikasi Online / Deployment

Karena menggunakan **Next.js**, aplikasi antrian ini sudah disiapkan agar bisa langsung tayang menjadi web sungguhan secara gratis menggunakan platform **Vercel**. Anda hanya perlu menge-_push_ kode ke GitHub atau menggunakan *Vercel CLI*. 

Repositori ini hanya menyimpan logika klien (tanpa interaksi *database* berat) sehingga eksekusi per halamannya akan bekerja dengan kilat di Vercel. 
