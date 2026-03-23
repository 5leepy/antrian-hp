"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import LZString from "lz-string";
import { Scanner } from "@yudiel/react-qr-scanner";
import { Check, X, Clock, CarFront, History, List, BatteryCharging, Zap, Sun, Moon, Edit2, RotateCcw, Info, ChevronRight, SkipForward, QrCode, Trash2, Camera } from "lucide-react";

type QueueItem = {
  id: string;
  fleetNumber: string;
  enqueueTime: number;
  status: "waiting" | "charging" | "completed" | "cancelled";
  completedTime?: number;
  chargingTime?: number;
  assignedNozzle?: number;
};

type ToastType = {
  id: number;
  message: string;
  type: "success" | "error" | "info";
};

const AVG_CHARGING_TIME_MINS = 30; // 30 minutes average

// Make SwipeButton accept compact prop
export function SwipeButton({ onComplete, compact = false }: { onComplete: () => void; compact?: boolean }) {
  const [slide, setSlide] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const maxSlide = containerRef.current ? containerRef.current.offsetWidth - 56 : 200;

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isSwiping || isSuccess || !containerRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const trackRect = containerRef.current.getBoundingClientRect();
    const newSlide = Math.max(0, Math.min(clientX - trackRect.left - 24, maxSlide));
    setSlide(newSlide);
    
    if (newSlide >= maxSlide * 0.85) {
      setIsSuccess(true);
      setSlide(maxSlide);
      onComplete();
    }
  };
  
  const handleEnd = () => {
    setIsSwiping(false);
    if (!isSuccess) setSlide(0);
  };
  
  return (
    <div 
      ref={containerRef}
      className={`relative h-14 rounded-xl flex items-center justify-center overflow-hidden transition-colors flex-1 w-full select-none ${
        isSuccess ? 'bg-teal-500 text-white' : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
      }`}
      onMouseMove={handleTouchMove}
      onTouchMove={handleTouchMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchEnd={handleEnd}
    >
      <div 
        className={`absolute left-1 top-1 w-12 h-12 rounded-lg flex items-center justify-center z-10 touch-none ${
          isSwiping || isSuccess ? '' : 'transition-transform duration-300'
        } ${isSuccess ? 'bg-white text-teal-500' : 'bg-teal-500 text-white shadow-md cursor-grab active:cursor-grabbing'}`}
        style={{ transform: `translateX(${slide}px)` }}
        onMouseDown={(e) => { if (!isSuccess) setIsSwiping(true); }}
        onTouchStart={(e) => { if (!isSuccess) setIsSwiping(true); }}
      >
        {isSuccess ? <Check className="w-6 h-6" /> : <ChevronRight className="w-6 h-6" />}
      </div>
      <span className={`font-bold ${compact ? 'text-xs pl-8' : 'text-sm pl-8'} text-slate-500 dark:text-slate-400 pointer-events-none transition-opacity duration-200 ${isSuccess || slide > 30 ? 'opacity-0' : 'opacity-100'}`}>
        {compact ? 'Geser Selesai' : 'Geser untuk Selesai'}
      </span>
      {isSuccess && <span className="font-bold text-sm text-white pointer-events-none absolute w-full text-center pl-8 fade-in animate-in">Selesai!</span>}
    </div>
  );
}

export default function EVQueueApp() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<QueueItem[]>([]);
  const [maxNozzles, setMaxNozzles] = useState<number | null>(null);
  const [fleetInput, setFleetInput] = useState("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [toast, setToast] = useState<ToastType | null>(null);

  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showMainMenu, setShowMainMenu] = useState(false);
  const [showBulkStartModal, setShowBulkStartModal] = useState(false);
  const [identifyingCar, setIdentifyingCar] = useState<QueueItem | null>(null);
  const [identifyInput, setIdentifyInput] = useState("");

  // Bulk Start Handler
  const handleBulkStart = () => {
    const newCars: QueueItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: crypto.randomUUID(),
      fleetNumber: "---", // Special marker for unknown
      enqueueTime: Date.now(),
      chargingTime: Date.now(),
      assignedNozzle: i + 1,
      status: "charging",
      isUnknown: true
    }));
    
    setQueue(prev => [...prev, ...newCars]);
    setShowBulkStartModal(false);
    showToast("12 Nozzle telah diaktifkan secara otomatis", "success");
  };

  // Edit State
  const [editingItem, setEditingItem] = useState<{ id: string; fleetNumber: string } | null>(null);
  const [selectedDispenser, setSelectedDispenser] = useState<number | null>(null);

  // Undo State
  const [undoItem, setUndoItem] = useState<{ item: QueueItem; timeoutId: NodeJS.Timeout; prevStatus: QueueItem['status']; replacedCar?: QueueItem; startTime: number } | null>(null);

  // Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  // Transfer State
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrMode, setQrMode] = useState<"show" | "scan">("show");
  const [transferUrl, setTransferUrl] = useState("");
  const [incomingTransfer, setIncomingTransfer] = useState<{ queue: QueueItem[], maxNozzles: number | null } | null>(null);

  // Sound Synth Ref (to avoid multiple instances)
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000); // UI update every minute
    return () => clearInterval(timer);
  }, []);

  // Hydrate localstorage limits & Hybrid Theme
  useEffect(() => {
    const savedQueue = localStorage.getItem("ev_queue");
    const savedHistory = localStorage.getItem("ev_history");
    const savedNozzles = localStorage.getItem("ev_max_nozzles");

    if (savedQueue) setQueue(JSON.parse(savedQueue));
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    if (savedNozzles) {
      setMaxNozzles(parseInt(savedNozzles, 10));
    }

    const savedTheme = localStorage.getItem("ev_theme");
    const applyTheme = (isDark: boolean) => {
      setTheme(isDark ? "dark" : "light");
      if (isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    };

    if (savedTheme === "light" || savedTheme === "dark") {
       applyTheme(savedTheme === "dark");
       setIsLoaded(true);
    } else {
       const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
       applyTheme(mediaQuery.matches);
       
       const handleSystemThemeChange = (e: MediaQueryListEvent) => {
         if (!localStorage.getItem("ev_theme")) {
           applyTheme(e.matches);
         }
       };
       mediaQuery.addEventListener("change", handleSystemThemeChange);
       setIsLoaded(true);
       return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
    }
  }, []);

  const nozzleLabel = (n: number, max: number | null) => {
    const total = max || 2;
    if (total <= 2) return n === 1 ? 'A' : 'B';
    const disp = Math.ceil(n / 2);
    const side = n % 2 === 1 ? 'A' : 'B';
    return `${disp}-${side}`;
  };

  // Save to localstorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("ev_queue", JSON.stringify(queue));
      localStorage.setItem("ev_history", JSON.stringify(history));
      if (maxNozzles) localStorage.setItem("ev_max_nozzles", maxNozzles.toString());
      localStorage.removeItem("ev_theme"); // clean up legacy
    }
  }, [queue, history, maxNozzles, isLoaded]);

  // Handle incoming transfer URL
  useEffect(() => {
    if (!isLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      try {
        const decoded = LZString.decompressFromEncodedURIComponent(q);
        if (decoded) {
          const parsed = JSON.parse(decoded);
          if (Array.isArray(parsed)) {
            setIncomingTransfer({ queue: parsed, maxNozzles: null });
          } else if (parsed && parsed.q) {
            setIncomingTransfer({ queue: parsed.q, maxNozzles: parsed.m || null });
          }
        }
      } catch (e) {
        showToast("Data transfer tidak valid / rusak", "error");
      }
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [isLoaded]);



  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("ev_theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 3000);
  };

  const playBeep = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.error("Audio block", e);
    }
  };

  const generateTransferUrl = () => {
    const payload = { q: queue, m: maxNozzles };
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
    const url = `${window.location.origin}?q=${compressed}`;
    setTransferUrl(url);
    setShowQrModal(true);
  };

  const acceptTransfer = () => {
    if (incomingTransfer) {
      setQueue(incomingTransfer.queue);
      if (incomingTransfer.maxNozzles) {
        setMaxNozzles(incomingTransfer.maxNozzles);
      }
      setIncomingTransfer(null);
      showToast("Antrian berhasil ditimpa dengan data transfer!", "success");
    }
  };

  // Handle Incoming Scanner QR
  const handleScanQr = (text: string) => {
    try {
      const url = new URL(text);
      const encodedData = url.searchParams.get('q');
      if (!encodedData) throw new Error("No data flag");
      const decoded = LZString.decompressFromEncodedURIComponent(encodedData);
      if (!decoded) throw new Error("Failed decode");
      const parsed = JSON.parse(decoded);
      
      if (Array.isArray(parsed)) {
        setIncomingTransfer({ queue: parsed, maxNozzles: null });
      } else if (parsed && parsed.q) {
        setIncomingTransfer({ queue: parsed.q, maxNozzles: parsed.m || null });
      } else {
        throw new Error("Invalid structure");
      }
      setShowQrModal(false);
    } catch (e) {
      console.log("Scanner failed to parse QR:", text);
    }
  };

  const handleResetData = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Peringatan Berbahaya!",
      message: "Tindakan ini akan menghapus semua antrian, riwayat yang berlangsung, dan data aplikasi secara permanen dari perangkat ini. Lanjutkan?",
      onConfirm: () => {
        setQueue([]);
        setHistory([]);
        setMaxNozzles(null); // This will trigger the Setup Modal
        localStorage.removeItem("ev_queue");
        localStorage.removeItem("ev_history");
        localStorage.removeItem("ev_max_nozzles");
        setConfirmDialog(null);
        showToast("Seluruh data antrian & riwayat telah di-reset", "info");
      }
    });
  };

  const handleFleetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Hanya perbolehkan angka (0-9) dengan menghapus karakter lain
    const val = e.target.value.replace(/\D/g, '').slice(0, 3);
    setFleetInput(val);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const inputRaw = fleetInput.trim();
    if (!inputRaw) return;
    
    // Otomatis pad dengan 0 di depan agar selalu 3 digit
    const inputClean = inputRaw.padStart(3, '0');

    // Cek apakah sudah ada di queue aktif
    const isExist = queue.some(q => q.fleetNumber === inputClean);
    if (isExist) {
      showToast(`Taksi ${inputClean} sudah ada di antrian atau sedang charging!`, "error");
      return;
    }

    const newItem: QueueItem = {
      id: crypto.randomUUID(),
      fleetNumber: inputClean,
      enqueueTime: Date.now(),
      status: "waiting",
    };

    setQueue((prev) => [...prev, newItem]);
    setFleetInput("");
    showToast(`Taksi ${inputClean} berhasil masuk antrian`, "success");
  };

  const executeAction = (item: QueueItem, action: "charging" | "completed" | "cancelled") => {
    if (action === "charging") {
      setQueue((prev) => prev.map(q => q.id === item.id ? { ...q, status: "charging", chargingTime: Date.now() } : q));
      showToast(`Taksi ${item.fleetNumber} mulai charging`, "info");
    } else {
      // Completed or Cancelled
      const originalStatus = item.status;
      const updatedItem = { ...item, status: action, completedTime: Date.now() };
      
      setQueue((prev) => prev.filter((q) => q.id !== item.id));
      
      // STRICT: Never add to history if it's an 'Unknown' car
      if ((item as any).isUnknown || item.fleetNumber === "---") {
          showToast(`Sesi (Tanpa Riwayat) selesai`, "info");
      } else {
          setHistory((prev) => [updatedItem, ...prev]);
          showToast(`Taksi ${item.fleetNumber} selesai & tersimpan di riwayat`, "success");
      }

      if (action === "completed") {
        playBeep();
      }
      showToast(`Taksi ${item.fleetNumber} dipindah ke Riwayat (${action === 'completed' ? 'Selesai' : 'Batal'})`, "success");

      // Set Undo 
      if (undoItem) clearTimeout(undoItem.timeoutId);
      const timeoutId = setTimeout(() => setUndoItem(null), 7000); // 7 seconds undo window
      setUndoItem({ item: updatedItem, timeoutId, prevStatus: originalStatus as "charging" | "waiting", startTime: Date.now() });
    }
  };

  const handleAction = (item: QueueItem, action: "charging" | "completed" | "cancelled") => {
    if (action === "cancelled" || action === "completed") {
      const isCompleted = action === "completed";
      setConfirmDialog({
        isOpen: true,
        title: isCompleted ? "Selesai Charging" : "Batalkan Antrian",
        message: isCompleted 
          ? `Tandai taksi ${item.fleetNumber} selesai charging?` 
          : `Yakin ingin membatalkan taksi ${item.fleetNumber}?`,
        onConfirm: () => {
          executeAction(item, action);
          setConfirmDialog(null);
        }
      });
    } else {
      executeAction(item, action);
    }
  };

  const handleUndo = () => {
    if (!undoItem) return;
    clearTimeout(undoItem.timeoutId);

    // Check if this is a dispatch-undo (car is still in queue, status changed to charging)
    // vs a completed/cancelled undo (car was moved out of queue to history)
    const isDispatchUndo = undoItem.prevStatus === "waiting" && undoItem.item.status === "charging";

    if (isDispatchUndo) {
      // Revert the dispatched car from charging back to waiting in the queue
      setQueue(prev => prev.map(q => {
        if (q.id !== undoItem.item.id) return q;
        const reverted = { ...q, status: "waiting" as const };
        delete reverted.chargingTime;
        delete reverted.assignedNozzle;
        return reverted;
      }));

      // If there was a replaced car (nozzle swap), restore it from history back to charging
      if (undoItem.replacedCar) {
        const carToRestore = { ...undoItem.replacedCar, status: "charging" as const };
        delete carToRestore.completedTime;
        setHistory(prev => prev.filter(h => h.id !== carToRestore.id));
        setQueue(prev => [...prev, carToRestore]);
      }
    } else {
      // Remove from history and add back to queue (completed/cancelled undo)
      setHistory(prev => prev.filter(h => h.id !== undoItem.item.id));
      const restoredItem = { 
        ...undoItem.item, 
        status: undoItem.prevStatus 
      };
      delete restoredItem.completedTime;
      setQueue(prev => [...prev, restoredItem]);
    }

    showToast(`Undo berhasil: Taksi ${undoItem.item.fleetNumber} kembali ke antrian`, "success");
    setUndoItem(null);
  };

  const saveEdit = (id: string) => {
    if (!editingItem || !editingItem.fleetNumber.trim()) {
      setEditingItem(null);
      return;
    }
    const cleanFleet = editingItem.fleetNumber.replace(/\D/g, '').slice(0, 3).padStart(3, '0');
    if (cleanFleet === '000') {
      setEditingItem(null);
      return;
    }
    
    const isDuplicate = queue.some(q => q.id !== id && q.fleetNumber === cleanFleet);
    if (isDuplicate) {
      showToast(`Taksi ${cleanFleet} sudah ada di antrian!`, "error");
      return;
    }

    setQueue(prev => prev.map(q => q.id === id ? { ...q, fleetNumber: cleanFleet, isUnknown: false } : q));
    setEditingItem(null);
    showToast("Nomor lambung diperbarui", "success");
  };

  // Shared dispatch logic (used by modal AND auto-dispatch)
  const dispatchToNozzle = (nozzleNum: number, nextCar: QueueItem, occupied?: QueueItem) => {
    const now = Date.now();
    const label = nozzleLabel(nozzleNum, maxNozzles);
    if (occupied) {
      const completedOccupied = { ...occupied, status: "completed" as const, completedTime: now };
      setQueue(prev => prev.filter(q => q.id !== occupied.id));
      setHistory(prev => [completedOccupied, ...prev]);
      playBeep();
    }
    const dispatchedCar = { ...nextCar, status: "charging" as const, chargingTime: now, assignedNozzle: nozzleNum };
    setQueue(prev => prev.map(q => q.id === nextCar.id ? dispatchedCar : q));
    if (undoItem) clearTimeout(undoItem.timeoutId);
    const timeoutId = setTimeout(() => setUndoItem(null), 7000);
    setUndoItem({ item: dispatchedCar, timeoutId, prevStatus: "waiting", replacedCar: occupied ? { ...occupied } : undefined, startTime: now });
    showToast(`Taksi ${nextCar.fleetNumber} dipanggil ke Nozzle ${label}`, "info");
  };

  const handleSkip = (item: QueueItem, index: number) => {
    const waitingCarsList = queue.filter(q => q.status === "waiting").sort((a, b) => a.enqueueTime - b.enqueueTime);
    if (index >= waitingCarsList.length - 1) {
      showToast("Taksi ini sudah di urutan terakhir!", "info");
      return;
    }
    const nextItem = waitingCarsList[index + 1];
    
    // Swap their enqueueTimes to move item down 1 slot
    const timeCurrent = item.enqueueTime;
    const timeNext = nextItem.enqueueTime;
    
    setQueue(prev => prev.map(q => {
      if (q.id === item.id) return { ...q, enqueueTime: timeNext + 1 };
      if (q.id === nextItem.id) return { ...q, enqueueTime: timeCurrent - 1 };
      return q;
    }));
    showToast(`Taksi ${item.fleetNumber} dilewati (-1 urutan)`, "success");
  };

  if (!isLoaded) return null;

  // Global Modal Modifiers Moved downstream
  const chargingCars = queue.filter(q => q.status === "charging").sort((a,b) => (a.chargingTime || 0) - (b.chargingTime || 0));
  const waitingCars = queue.filter(q => q.status === "waiting").sort((a, b) => a.enqueueTime - b.enqueueTime);
  const isNozzleFull = chargingCars.length >= (maxNozzles || 2); // Default to 2 if maxNozzles is null (shouldn't happen after setup)

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const filteredHistory = history.filter(h => h.completedTime && h.completedTime >= todayStart.getTime());

  const completedTodayCount = history.filter(h => h.status === 'completed' && h.completedTime && h.completedTime >= todayStart.getTime()).length;
  const cancelledTodayCount = history.filter(h => h.status === 'cancelled' && h.completedTime && h.completedTime >= todayStart.getTime()).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300">
      
      {maxNozzles === null ? (
        <div className="flex flex-col items-center justify-center p-6 text-center flex-1 w-full max-w-md mx-auto animate-in zoom-in-95 duration-500">
          <div className="w-20 h-20 bg-teal-500 rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-teal-500/40 mb-8">
            <Zap className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white mb-3">Selamat Bertugas! 👋</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium mb-10 leading-relaxed">Pilih jumlah nozzle yang aktif di stasiun Anda sekarang untuk memulai.</p>
          
          <div className="flex flex-col gap-4 w-full">
            <button onClick={() => setMaxNozzles(1)} className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-teal-400 dark:hover:border-teal-500 p-5 rounded-2xl flex items-center gap-4 transition-all shadow-sm active:scale-95 group">
              <div className="w-12 h-12 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center group-hover:bg-teal-100 dark:group-hover:bg-teal-900/50 transition-colors"><span className="text-xl font-bold text-slate-600 dark:text-slate-300 group-hover:text-teal-600 dark:group-hover:text-teal-400">1</span></div>
              <div className="text-left"><h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Stasiun Kecil</h3><p className="text-sm text-slate-500">Hanya 1 Dispenser & 1 Nozzle aktif</p></div>
            </button>
            <button onClick={() => setMaxNozzles(2)} className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-teal-400 dark:hover:border-teal-500 p-5 rounded-2xl flex items-center gap-4 transition-all shadow-sm active:scale-95 group">
              <div className="w-12 h-12 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center group-hover:bg-teal-100 dark:group-hover:bg-teal-900/50 transition-colors"><span className="text-xl font-bold text-slate-600 dark:text-slate-300 group-hover:text-teal-600 dark:group-hover:text-teal-400">2</span></div>
              <div className="text-left"><h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Stasiun Standar</h3><p className="text-sm text-slate-500">Melayani 2 taksi (Dual Nozzle)</p></div>
            </button>
            <button onClick={() => { setMaxNozzles(12); setShowBulkStartModal(true); }} className="w-full bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-teal-400 dark:hover:border-teal-500 p-5 rounded-2xl flex items-center gap-4 transition-all shadow-sm active:scale-95 group">
              <div className="w-12 h-12 shrink-0 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center group-hover:bg-teal-100 dark:group-hover:bg-teal-900/50 transition-colors"><span className="text-xl font-bold text-slate-600 dark:text-slate-300 group-hover:text-teal-600 dark:group-hover:text-teal-400">12</span></div>
              <div className="text-left"><h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Pool Besar</h3><p className="text-sm text-slate-500">Kapasitas penuh hingga 12 Nozzle</p></div>
            </button>
            <div className="my-2 flex items-center gap-4">
               <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1"></div>
               <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">ATAU LANJUTKAN DARI HP LAIN</span>
               <div className="h-px bg-slate-200 dark:bg-slate-800 flex-1"></div>
            </div>
            <button onClick={() => { setQrMode("scan"); setShowQrModal(true); }} className="w-full bg-slate-100 dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 p-4 rounded-2xl flex items-center justify-center gap-3 transition-all text-slate-600 dark:text-slate-400 font-bold active:scale-95">
               <Camera className="w-5 h-5 text-teal-500" /> Operan Shift? Scan QR Rekan
            </button>
          </div>
        </div>
      ) : (
      <>
      <header className="sticky top-0 z-40 flex border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md justify-between items-center p-4">
        <div className="relative">
          <button 
            onClick={() => setShowMainMenu(!showMainMenu)}
            className="text-xl font-black bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent flex items-center gap-2 active:scale-95 transition-transform"
          >
            <CarFront className="w-6 h-6 text-teal-500" />
            AntriCas
            <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showMainMenu ? 'rotate-90' : ''}`} />
          </button>

          {/* MAIN MENU DROPDOWN */}
          {showMainMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMainMenu(false)}></div>
              <div className="absolute top-full left-0 mt-2 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-20 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <button 
                  onClick={() => { setShowHelpModal(true); setShowMainMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-100 dark:border-slate-800/50 transition-colors"
                >
                  <Info className="w-5 h-5 text-teal-500" /> Tutorial
                </button>
                <button 
                  onClick={() => { setShowHistoryModal(true); setShowMainMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold border-b border-slate-100 dark:border-slate-800/50 transition-colors"
                >
                  <History className="w-5 h-5 text-teal-500" /> Riwayat
                </button>
                <button 
                  onClick={() => { toggleTheme(); setShowMainMenu(false); }}
                  className="w-full flex items-center gap-3 px-4 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold transition-colors"
                >
                  {theme === "dark" ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-indigo-500" />} 
                  {theme === "dark" ? "Mode Terang" : "Mode Gelap"}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={generateTransferUrl} 
            className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-teal-500 active:scale-90 transition-all border border-transparent hover:border-teal-500/30" 
            aria-label="Transfer via QR"
          >
            <QrCode className="w-5 h-5 flex-shrink-0" />
          </button>
          <button 
            onClick={handleResetData} 
            className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 active:scale-90 transition-all border border-transparent hover:border-rose-500/30" 
            aria-label="Reset Data"
          >
            <Trash2 className="w-5 h-5 flex-shrink-0" />
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col gap-6 pb-24">
        {/* QUEUE MAIN CONTENT */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-5">
            {/* COMPACT ADD FORM */}
            <form onSubmit={handleAdd} className="flex items-center gap-3 relative bg-white dark:bg-slate-900 p-2 pl-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm focus-within:ring-2 focus-within:ring-teal-500/50 transition-all">
              <div className="flex-1 flex items-center gap-3">
                <CarFront className="w-5 h-5 text-teal-500 shrink-0" />
                <input
                  type="text"
                  value={fleetInput}
                  onChange={handleFleetInputChange}
                  placeholder="Ketik No. Lambung..."
                  maxLength={3}
                  pattern="[0-9]*"
                  className="w-full bg-transparent border-none py-3 text-2xl font-black text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700 placeholder:text-sm placeholder:font-medium focus:outline-none focus:ring-0 tracking-widest uppercase"
                  autoComplete="off"
                  inputMode="numeric"
                />
              </div>
              <button
                type="submit"
                disabled={!fleetInput.trim()}
                className="w-14 h-14 bg-gradient-to-br from-teal-400 to-emerald-500 hover:from-teal-300 hover:to-emerald-400 disabled:from-slate-200 disabled:to-slate-200 disabled:dark:from-slate-800 disabled:dark:to-slate-800 disabled:text-slate-400 disabled:dark:text-slate-600 text-white rounded-2xl shadow-md disabled:shadow-none flex items-center justify-center transition-all shrink-0 active:scale-95"
                aria-label="Masuk Antrian"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            </form>

            <div className="w-full h-px bg-slate-200 dark:bg-slate-800/50 my-1"></div>

            {/* MASTER CALL BUTTON */}
            {waitingCars.length > 0 && (
              <button 
                onClick={() => {
                  const nozzleCount = maxNozzles || 2;
                  const freeNozzles = Array.from({ length: nozzleCount }, (_, i) => i + 1).filter(n => {
                    return !chargingCars.find(c => c.assignedNozzle === n) && !(chargingCars[n-1] && !chargingCars[n-1].assignedNozzle);
                  });
                  // Auto-dispatch if exactly one nozzle is free (no choice needed)
                  if (freeNozzles.length === 1) {
                    dispatchToNozzle(freeNozzles[0], waitingCars[0]);
                  } else {
                    setShowDispatchModal(true);
                  }
                }}
                className="w-full mt-2 py-5 rounded-3xl bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-black text-xl shadow-lg shadow-teal-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 relative overflow-hidden group border-b-4 border-emerald-600/50"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <Zap className="w-7 h-7 fill-white drop-shadow-md" />
                PANGGIL BERIKUTNYA
              </button>
            )}

            {/* DASHBOARD CHARGER */}
            <div className="flex flex-col gap-3 mt-3">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-lg font-bold text-teal-600 dark:text-teal-400 flex items-center gap-2">
                  <BatteryCharging className="w-5 h-5" />
                  Dashboard Nozzle
                </h2>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${isNozzleFull ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20' : 'bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300 border-teal-200 dark:border-teal-500/20'}`}>
                  {chargingCars.length} / {maxNozzles} Terisi
                </span>
              </div>

              <div className={`grid gap-4 ${maxNozzles === 12 ? 'grid-cols-2' : maxNozzles === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {maxNozzles === 12 ? (
                  // Grouped Dispenser Layout for 12 Nozzles
                  Array.from({ length: 6 }, (_, i) => i + 1).map(dispenserNum => {
                    const nA = dispenserNum * 2 - 1;
                    const nB = dispenserNum * 2;
                    const carA = chargingCars.find(c => c.assignedNozzle === nA) || (chargingCars[nA-1] && !chargingCars[nA-1].assignedNozzle ? chargingCars[nA-1] : undefined);
                    const carB = chargingCars.find(c => c.assignedNozzle === nB) || (chargingCars[nB-1] && !chargingCars[nB-1].assignedNozzle ? chargingCars[nB-1] : undefined);
                    const isFull = carA && carB;

                    return (
                    <div key={dispenserNum} className={`bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-3xl p-3 flex flex-col gap-2 transition-all duration-500 ${isFull ? 'shadow-[0_0_15px_rgba(20,184,166,0.15)] bg-teal-50/30 dark:bg-teal-900/10 border-teal-200 dark:border-teal-500/20' : 'shadow-sm'}`}>
                      <div className="flex justify-between items-center px-1">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-black tracking-widest text-slate-400 dark:text-slate-500 uppercase">Dispenser {dispenserNum}</span>
                        </div>
                        {/* Status LEDs */}
                        <div className="flex gap-1.5 p-1 bg-slate-200/50 dark:bg-slate-700/50 rounded-full">
                          <div className={`w-2 h-2 rounded-full transition-all duration-500 ${carA ? 'bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)] animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                          <div className={`w-2 h-2 rounded-full transition-all duration-500 ${carB ? 'bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)] animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[nA, nB].map(n => {
                          const car = n === nA ? carA : carB;
                          const label = nozzleLabel(n, maxNozzles);
                          const side = label.split('-')[1]; // Get 'A' or 'B'
                          
                          return (
                            <div 
                              key={n} 
                              onClick={() => { 
                                if(car) {
                                    if ((car as any).isUnknown && car.fleetNumber === "---") {
                                        setIdentifyingCar(car);
                                        setIdentifyInput("");
                                    } else {
                                        setConfirmDialog({
                                          isOpen: true,
                                          title: "Selesai Pengecasan?",
                                          message: `Taksi lambung ${car.fleetNumber} (Nozzle ${label}) akan dipindahkan ke Riwayat sebagai Selesai. Apakah Anda yakin?`,
                                          onConfirm: () => {
                                            executeAction(car, "completed");
                                            setConfirmDialog(null);
                                          }
                                        });
                                    }
                                }
                              }}
                              className={`rounded-2xl p-3 border-2 relative overflow-hidden flex flex-col items-center justify-center text-center transition-all ${car ? 'bg-white dark:bg-slate-900 border-teal-400 dark:border-teal-500/50 shadow-md cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/30 active:scale-95 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950' : 'bg-white/50 dark:bg-slate-900/30 border-slate-200/60 dark:border-slate-800/60 border-dashed backdrop-blur-sm'}`}
                            >
                              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 mb-1">{side}</span>
                              {car ? (
                                <>
                                  {(car as any).isUnknown && car.fleetNumber === "---" ? (
                                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-full mb-1">
                                          <CarFront className="w-4 h-4 text-slate-400" />
                                      </div>
                                  ) : (
                                      <span className="text-xl font-black text-slate-800 dark:text-white leading-tight">{car.fleetNumber}</span>
                                  )}
                                  <span className="text-[8px] text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-500/10 px-1 py-0.5 rounded flex items-center gap-0.5 mt-1">
                                    <Clock className="w-2.5 h-2.5" /> {Math.floor((currentTime - (car.chargingTime || car.enqueueTime)) / 60000)}m
                                  </span>
                                </>
                              ) : (
                                <span className="text-[9px] font-bold text-slate-300 dark:text-slate-600 my-1 font-mono tracking-widest uppercase opacity-40">Ready</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )})
                ) : (
                  // Simple Grid Layout for 1-2 Nozzles
                  Array.from({ length: maxNozzles || 2 }, (_, i) => i + 1).map(n => {
                    const car = chargingCars.find(c => c.assignedNozzle === n) || (chargingCars[n-1] && !chargingCars[n-1].assignedNozzle ? chargingCars[n-1] : undefined);
                    const label = nozzleLabel(n, maxNozzles);
                    return (
                ) : (
                  // Dispenser Card Layout for 1-2 Nozzles (Synced with 12-Nozzle Design)
                  Array.from({ length: 1 }, (_, i) => i + 1).map(dispenserNum => {
                    const nA = 1;
                    const nB = 2;
                    const carA = chargingCars.find(c => c.assignedNozzle === nA) || (chargingCars[nA-1] && !chargingCars[nA-1].assignedNozzle ? chargingCars[nA-1] : undefined);
                    const carB = chargingCars.find(c => c.assignedNozzle === nB) || (chargingCars[nB-1] && !chargingCars[nB-1].assignedNozzle ? chargingCars[nB-1] : undefined);
                    const isFull = carA && carB;

                    return (
                    <div key={dispenserNum} className={`bg-slate-100/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 flex flex-col gap-3 transition-all duration-500 ${isFull ? 'shadow-[0_0_20px_rgba(20,184,166,0.2)] bg-teal-50/30 dark:bg-teal-900/10 border-teal-200 dark:border-teal-500/20' : 'shadow-sm'}`}>
                      <div className="flex justify-between items-center px-1">
                        <div className="flex flex-col">
                          <span className="text-xs font-black tracking-widest text-slate-400 dark:text-slate-500 uppercase">Dispenser 1 (Standar)</span>
                        </div>
                        {/* Status LEDs */}
                        <div className="flex gap-2 p-1.5 bg-slate-200/50 dark:bg-slate-700/50 rounded-full">
                          <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${carA ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                          <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${carB ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[nA, nB].map(n => {
                          const car = n === nA ? carA : carB;
                          const label = nozzleLabel(n, maxNozzles);
                          const side = label.split('-')[1] || (n === 1 ? 'A' : 'B');
                          
                          return (
                            <div 
                              key={n} 
                              onClick={() => { 
                                if(car) {
                                    if ((car as any).isUnknown && car.fleetNumber === "---") {
                                        setIdentifyingCar(car);
                                        setIdentifyInput("");
                                    } else {
                                        setConfirmDialog({
                                          isOpen: true,
                                          title: "Selesai Pengecasan?",
                                          message: `Taksi lambung ${car.fleetNumber} (Nozzle ${label}) akan dipindahkan ke Riwayat sebagai Selesai. Apakah Anda yakin?`,
                                          onConfirm: () => {
                                            executeAction(car, "completed");
                                            setConfirmDialog(null);
                                          }
                                        });
                                    }
                                }
                              }}
                              className={`rounded-2xl p-4 border-2 relative overflow-hidden flex flex-col items-center justify-center text-center transition-all min-h-[140px] ${car ? 'bg-white dark:bg-slate-900 border-teal-400 dark:border-teal-500/50 shadow-md cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/30 active:scale-95' : 'bg-white/50 dark:bg-slate-900/30 border-slate-200/60 dark:border-slate-800/60 border-dashed backdrop-blur-sm'}`}
                            >
                              <span className="text-xs font-black text-slate-400 dark:text-slate-500 mb-1">{side}</span>
                              {car ? (
                                <>
                                  {(car as any).isUnknown && car.fleetNumber === "---" ? (
                                      <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-full mb-1">
                                          <CarFront className="w-6 h-6 text-slate-400" />
                                      </div>
                                  ) : (
                                      <span className="text-2xl font-black text-slate-800 dark:text-white leading-tight">{car.fleetNumber}</span>
                                  )}
                                  <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold bg-teal-50 dark:bg-teal-500/10 px-2 py-1 rounded-lg flex items-center gap-1 mt-2">
                                    <Clock className="w-3 h-3" /> {Math.floor((currentTime - (car.chargingTime || car.enqueueTime)) / 60000)}m
                                  </span>
                                </>
                              ) : (
                                <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 my-1 font-mono tracking-widest uppercase opacity-40">Ready</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )})
                )}
              </div>
            </div>

            {/* WAITING */}
            <div className="flex flex-col gap-3 mt-2">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" /> Antrian Menunggu
                </h2>
                <span className="text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700">
                  {waitingCars.length} Mobil
                </span>
              </div>

              {waitingCars.length === 0 ? (
                <div className="bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-800/50 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                    <CarFront className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">Belum ada taksi di antrian.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {waitingCars.map((item, index) => {
                    const positionInBatch = Math.floor(index / (maxNozzles || 2));
                    const isNextBatch = index < (maxNozzles || 2);
                    
                    // Simple ETA (Very rough estimation: 30 mins per batch)
                    let etaText = "Segera";
                    if (!isNextBatch || isNozzleFull) {
                        const etaMinutes = (positionInBatch + (isNozzleFull ? 1 : 0)) * AVG_CHARGING_TIME_MINS;
                        etaText = `±${etaMinutes} mnt`;
                    }

                    return (
                    <li key={item.id} className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-4 shadow-sm relative overflow-hidden group ${isNozzleFull ? 'opacity-90' : ''}`}>
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-amber-400 to-amber-500"></div>
                      
                      <div className="flex justify-between items-start pl-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-xs font-bold bg-amber-50 dark:bg-slate-800 px-2 py-0.5 rounded text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-400/20">
                              Antrian #{index + 1}
                            </p>
                            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              <Clock className="w-3 h-3" /> ETA {etaText}
                            </span>
                          </div>
                          {editingItem?.id === item.id ? (
                            <input 
                              type="text" 
                              autoFocus
                              value={editingItem.fleetNumber}
                              onChange={(e) => setEditingItem({ ...editingItem, fleetNumber: e.target.value })}
                              onBlur={() => saveEdit(item.id)}
                              onKeyDown={(e) => e.key === 'Enter' && saveEdit(item.id)}
                              className="text-3xl font-black w-24 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-amber-400 rounded outline-none px-1 uppercase"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <h3 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">{item.fleetNumber}</h3>
                              <button onClick={() => setEditingItem({ id: item.id, fleetNumber: item.fleetNumber })} className="text-slate-400 opacity-70 hover:opacity-100 hover:text-amber-500 transition-opacity p-1">
                                <Edit2 className="w-5 h-5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                            {format(item.enqueueTime, "HH:mm")}
                          </span>
                          <span className="text-xs text-slate-500 mt-0.5 font-medium">
                            {Math.floor((currentTime - item.enqueueTime) / 60000)} mnt lalu
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2.5 mt-2">
                        <button onClick={() => handleSkip(item, index)} disabled={index >= waitingCars.length - 1} className="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:active:scale-100 py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-sm">
                          <SkipForward className="w-5 h-5" /> Lewati
                        </button>
                        <button onClick={() => handleAction(item, "cancelled")} className="flex-1 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 py-3 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-sm">
                          <X className="w-5 h-5" /> Batal
                        </button>
                      </div>
                    </li>
                  )})}
                </ul>
              )}
            </div>

            {/* DISPATCH MODAL */}
            {showDispatchModal && waitingCars[0] && (
              <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-10">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-slate-800 dark:text-white">
                        {maxNozzles === 12 && selectedDispenser === null ? "Pilih Dispenser" : "Pilih Nozzle Target"}
                      </h3>
                      <button 
                        onClick={() => {
                          setShowDispatchModal(false);
                          setSelectedDispenser(null);
                        }} 
                        className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div className="mb-6 bg-teal-50 dark:bg-teal-500/10 p-4 rounded-2xl border border-teal-100 dark:border-teal-500/20 flex items-center gap-4">
                      <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-xl flex items-center justify-center font-black text-2xl text-teal-600 dark:text-teal-400 shadow-sm border border-teal-100 dark:border-teal-500/20">{waitingCars[0].fleetNumber}</div>
                      <div>
                        {maxNozzles === 12 && selectedDispenser !== null ? (
                          <button 
                            onClick={() => setSelectedDispenser(null)}
                            className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 mb-0.5"
                          >
                            <ChevronRight className="w-3 h-3 rotate-180" /> Kembali ke Dispenser
                          </button>
                        ) : (
                          <p className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-widest mb-0.5">Antrian #1 Masuk</p>
                        )}
                        <p className="text-slate-600 dark:text-slate-300 text-sm font-medium leading-tight">
                          {maxNozzles === 12 && selectedDispenser === null 
                            ? "Pilih dispenser stasiun untuk pengecasan." 
                            : "Pilih kotak nozzle di bawah untuk mengalihkan taksi ini."}
                        </p>
                      </div>
                    </div>

                    {maxNozzles === 12 && selectedDispenser === null ? (
                      <div className="grid grid-cols-3 gap-3">
                        {Array.from({ length: 6 }, (_, i) => i + 1).map(disp => {
                          const nA = disp * 2 - 1;
                          const nB = disp * 2;
                          const carA = chargingCars.find(c => c.assignedNozzle === nA);
                          const carB = chargingCars.find(c => c.assignedNozzle === nB);
                          const isFull = carA && carB;

                          return (
                          <button
                            key={disp}
                            onClick={() => setSelectedDispenser(disp)}
                            className={`aspect-square rounded-3xl border-2 flex flex-col items-center justify-center transition-all active:scale-90 shadow-sm relative overflow-hidden group ${
                                isFull 
                                ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-500/30' 
                                : carA || carB
                                ? 'bg-white dark:bg-slate-900 border-amber-100 dark:border-amber-500/20 shadow-sm shadow-amber-500/5'
                                : 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-500/30 shadow-sm shadow-emerald-500/5'
                            }`}
                          >
                            <span className={`text-3xl font-black ${
                              isFull ? 'text-amber-600 dark:text-amber-400' : 
                              (carA || carB) ? 'text-slate-800 dark:text-white' : 
                              'text-emerald-600 dark:text-emerald-400'
                            }`}>D{disp}</span>
                            
                            {/* Occupancy Indicators */}
                            <div className="flex gap-1.5 mt-2 p-1 bg-white/60 dark:bg-slate-800/80 rounded-full shadow-inner">
                                <div className={`w-2 h-2 rounded-full transition-all ${carA ? 'bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)]' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                                <div className={`w-2 h-2 rounded-full transition-all ${carB ? 'bg-amber-400 shadow-[0_0_5px_rgba(251,191,36,0.5)]' : 'bg-slate-200 dark:bg-slate-700'}`}></div>
                            </div>

                            {isFull && (
                                <div className="absolute top-2 right-1 rotate-[15deg]">
                                    <span className="bg-rose-500/70 text-white text-[7px] font-black px-1.5 py-0.5 rounded shadow-md uppercase tracking-tighter border border-white/20">FULL</span>
                                </div>
                            )}
                            
                            {/* Inner Glow Effect */}
                            <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${isFull ? 'bg-amber-400/5 opacity-100' : (carA || carB) ? 'bg-amber-400/5 opacity-50' : 'bg-emerald-400/5 opacity-100'}`}></div>
                          </button>
                        )})}
                      </div>
                    ) : (
                      <div className={`grid gap-3 ${maxNozzles === 12 ? 'grid-cols-2' : maxNozzles === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                        {(maxNozzles === 12 
                          ? [selectedDispenser! * 2 - 1, selectedDispenser! * 2] 
                          : Array.from({ length: maxNozzles || 2 }, (_, i) => i + 1)
                        ).map(n => {
                          const occupied = chargingCars.find(c => c.assignedNozzle === n) || (chargingCars[n-1] && !chargingCars[n-1].assignedNozzle ? chargingCars[n-1] : undefined);
                          const chargingMins = occupied ? Math.floor((currentTime - (occupied.chargingTime || occupied.enqueueTime)) / 60000) : 0;
                          return (
                            <button 
                              key={n} 
                              onClick={() => {
                                dispatchToNozzle(n, waitingCars[0], occupied);
                                setShowDispatchModal(false);
                                setSelectedDispenser(null);
                              }}
                              className={`p-3 rounded-2xl border-2 flex flex-col items-center justify-center transition-all active:scale-95 ${occupied ? 'bg-amber-50 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/30' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-500/50'}`}
                            >
                              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-1">{nozzleLabel(n, maxNozzles)}</span>
                              {occupied ? (
                                <>
                                  <span className="font-black text-xl text-slate-800 dark:text-white">{occupied.fleetNumber}</span>
                                  <span className="text-[9px] text-amber-600 dark:text-amber-400 font-bold flex items-center gap-0.5 mt-0.5">
                                    <Clock className="w-2.5 h-2.5" />{chargingMins}m
                                  </span>
                                  <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded mt-1 font-bold tracking-widest shadow-sm">GANTI</span>
                                </>
                              ) : (
                                <span className="font-bold text-teal-600 dark:text-teal-400 text-sm mt-3 mb-1">KOSONG</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>

        {/* BULK START MODAL */}
      {showBulkStartModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-amber-100 dark:bg-amber-500/20 rounded-3xl flex items-center justify-center mb-6 mx-auto">
              <Zap className="w-10 h-10 text-amber-500 animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white text-center mb-3">Siapkan Pool Sekarang?</h2>
            <p className="text-slate-500 dark:text-slate-400 text-center font-medium mb-8 leading-relaxed">Apakah saat ini semua (12) Nozzle sudah terisi mobil? Jika ya, sistem akan mengaktifkan semua timer secara otomatis.</p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleBulkStart}
                className="w-full py-4 bg-teal-500 hover:bg-teal-600 text-white font-black rounded-2xl shadow-lg shadow-teal-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" /> YA, SEMUA PENUH
              </button>
              <button 
                onClick={() => setShowBulkStartModal(false)}
                className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
              >
                TIDAK, MASUK KOSONG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK IDENTIFY MODAL */}
      {identifyingCar && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-teal-100 dark:bg-teal-500/20 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <CarFront className="w-8 h-8 text-teal-500" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white text-center mb-2">Identifikasi Taksi</h2>
            <p className="text-slate-500 dark:text-slate-400 text-center text-sm font-medium mb-6">Input nomor lambung untuk menyimpan ke Riwayat, atau langsung selesaikan.</p>
            
            <div className="mb-6">
                <input
                  type="text"
                  value={identifyInput}
                  onChange={(e) => setIdentifyInput(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  placeholder="No. Lambung (Opsional)"
                  className="w-full bg-slate-100 dark:bg-slate-800 border-2 border-transparent focus:border-teal-500 rounded-2xl p-4 text-center text-2xl font-black text-slate-800 dark:text-white outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                  autoFocus
                />
            </div>

            <div className="flex flex-col gap-3">
              <button 
                onClick={() => {
                   if (identifyInput.trim()) {
                       const cleanFleet = identifyInput.padStart(3, '0');
                       const updated = { ...identifyingCar, fleetNumber: cleanFleet, isUnknown: false };
                       executeAction(updated, "completed");
                   } else {
                       executeAction(identifyingCar, "completed");
                   }
                   setIdentifyingCar(null);
                }}
                className="w-full py-4 bg-teal-500 hover:bg-teal-600 text-white font-black rounded-2xl shadow-lg shadow-teal-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {identifyInput.trim() ? <><Check className="w-5 h-5" /> SIMPAN & SELESAI</> : <><X className="w-5 h-5" /> SELESAI (TANPA RIWAYAT)</>}
              </button>
              <button 
                onClick={() => setIdentifyingCar(null)}
                className="w-full py-3 text-slate-400 dark:text-slate-500 font-bold hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                Kembali
              </button>
            </div>
          </div>
        </div>
      )}
        {/* HISTORY MODAL */}
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-950 flex flex-col animate-in slide-in-from-bottom-full duration-300 sm:duration-500">
            <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between shadow-sm sticky top-0 z-10 w-full max-w-md mx-auto">
              <h2 className="text-xl font-black text-slate-800 dark:text-teal-400 flex items-center gap-2">
                <History className="w-6 h-6 text-teal-500" /> Riwayat Hari Ini
              </h2>
              <button 
                onClick={() => setShowHistoryModal(false)} 
                className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-rose-500 transition-colors"
                aria-label="Tutup Riwayat"
              >
                <X className="w-5 h-5 flex-shrink-0" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6 pb-24 w-full max-w-md mx-auto bg-slate-50 dark:bg-slate-950">
              <div className="flex gap-3 shrink-0">
                <div className="flex-1 bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl p-4 flex items-center justify-between shadow-lg text-white">
                  <div>
                    <p className="text-teal-100 text-xs font-bold mb-1">Selesai Hari Ini</p>
                    <p className="text-3xl font-black">{completedTodayCount} <span className="text-sm font-bold">Mobil</span></p>
                  </div>
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
                    <Check className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div className="flex-1 bg-gradient-to-br from-rose-500 to-rose-600 rounded-2xl p-4 flex items-center justify-between shadow-lg text-white">
                  <div>
                    <p className="text-rose-100 text-xs font-bold mb-1">Batal Hari Ini</p>
                    <p className="text-3xl font-black">{cancelledTodayCount} <span className="text-sm font-bold">Mobil</span></p>
                  </div>
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center border border-white/30">
                    <X className="w-5 h-5 text-white" />
                  </div>
                </div>
              </div>

            <div className="flex flex-col gap-3">
               <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-1">
                <History className="w-5 h-5 text-slate-500" /> Riwayat
              </h2>
              

              {filteredHistory.length === 0 ? (
                <div className="bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-800/50 border-dashed rounded-2xl p-8 mt-2 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                    <History className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="text-slate-500 font-medium">Belum ada riwayat hari ini.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2 mt-2">
                  {filteredHistory.map((item) => (
                    <li key={item.id} className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex justify-between items-center shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-10 rounded-full ${item.status === 'completed' ? 'bg-teal-500' : 'bg-rose-500'}`}></div>
                        <div>
                          <h4 className="text-lg font-black text-slate-800 dark:text-slate-200">{item.fleetNumber}</h4>
                          <p className="text-xs text-slate-500 font-medium tracking-tight">
                            Mulai: {format(item.enqueueTime, "HH:mm")} • Selesai: {item.completedTime ? format(item.completedTime, "HH:mm") : "-"}
                          </p>
                        </div>
                      </div>
                      <div>
                        {item.status === "completed" ? (
                          <span className="bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-500/20 text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
                            <Check className="w-3 h-3" /> Selesai
                          </span>
                        ) : (
                          <span className="bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 text-xs font-bold px-2.5 py-1 rounded-md flex items-center gap-1">
                            <X className="w-3 h-3" /> Batal
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        )}

      </main>

      {/* FOOTER BRANDING */}
      <footer className="w-full py-6 text-center mt-auto border-t border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900/30">
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 tracking-wide uppercase">
          Developed by <span className="text-teal-500 font-bold">Nadir Nahdi</span>
        </p>
      </footer>
      </>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 border ${
            toast.type === "success" ? "bg-teal-50 border-teal-200 text-teal-800 dark:bg-teal-900/90 dark:border-teal-500/50 dark:text-teal-50" :
            toast.type === "error" ? "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/90 dark:border-rose-500/50 dark:text-rose-50" :
            "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/90 dark:border-blue-500/50 dark:text-blue-50"
          }`}>
            {toast.type === "success" && <Check className="w-5 h-5 flex-shrink-0" />}
            {toast.type === "error" && <X className="w-5 h-5 flex-shrink-0" />}
            {toast.type === "info" && <Info className="w-5 h-5 flex-shrink-0" />}
            <span className="font-semibold text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      {/* UNDO SNACKBAR */}
      {undoItem && (
        <div className="fixed bottom-6 left-4 right-4 z-40 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 animate-in slide-in-from-bottom-10 fade-in zoom-in-95 duration-300 overflow-hidden">
          <style>{`@keyframes undo-shrink { from { width: 100%; } to { width: 0%; } }`}</style>
          {/* Progress bar */}
          <div
            className="h-1 bg-teal-500 rounded-t-xl"
            style={{ animation: `undo-shrink 7s linear forwards`, animationDelay: '0ms' }}
          />
          <div className="flex items-center justify-between p-4">
            <div className="flex-1">
              <p className="font-bold text-sm">Taksi {undoItem.item.fleetNumber} {undoItem.item.status === 'completed' ? 'diselesaikan' : undoItem.item.status === 'charging' ? 'dipanggil ke nozzle' : 'dibatalkan'}.</p>
            </div>
            <button onClick={handleUndo} className="bg-slate-700 hover:bg-slate-600 text-teal-400 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors border border-slate-600">
              <RotateCcw className="w-4 h-4" /> Undo
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG */}
      {confirmDialog && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-300">
             <h3 className="text-xl font-black text-slate-800 dark:text-emerald-400 mb-2">{confirmDialog.title}</h3>
             <p className="text-slate-600 dark:text-slate-400 font-medium mb-8 leading-relaxed">{confirmDialog.message}</p>
             <div className="flex gap-3">
               <button 
                 onClick={() => setConfirmDialog(null)}
                 className="flex-1 py-3 px-4 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
               >
                 Tutup
               </button>
               <button 
                 onClick={confirmDialog.onConfirm}
                 className="flex-1 py-3 px-4 rounded-xl font-bold bg-teal-500 hover:bg-teal-400 text-white shadow-lg shadow-teal-500/30 transition-all active:scale-95"
               >
                 Yakin
               </button>
             </div>
           </div>
         </div>
       )}

      {/* QR CODE MODAL & SCANNER */}
      {showQrModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 flex flex-col items-center">
             
             {/* TOGGLE TABS */}
             {maxNozzles !== null && (
               <div className="flex w-full bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl mb-6">
                  <button onClick={() => setQrMode("show")} className={`flex-1 py-3 text-sm font-bold rounded-lg transition-all ${qrMode === 'show' ? 'bg-white dark:bg-slate-900 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>Tampilkan QR</button>
                  <button onClick={() => setQrMode("scan")} className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold rounded-lg transition-all ${qrMode === 'scan' ? 'bg-white dark:bg-slate-900 shadow-sm text-teal-600 dark:text-teal-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}><Camera className="w-5 h-5"/> Scan Kamera</button>
               </div>
             )}

             {qrMode === "show" && maxNozzles !== null ? (
               <>
                 <h3 className="text-xl font-black text-slate-800 dark:text-teal-400 mb-2">Transfer Antrian</h3>
                 <p className="text-slate-500 text-center text-sm mb-6">Minta operator pengganti untuk men-scan QR ini menggunakan kamera HP mereka.</p>
                 <div className="bg-white p-4 rounded-2xl shadow-inner border border-slate-200 mb-6">
                   <QRCodeSVG value={transferUrl} size={200} level="M" />
                 </div>
               </>
             ) : (
               <div className="w-full aspect-square bg-slate-950 rounded-2xl overflow-hidden mb-6 relative border-4 border-slate-800 flex items-center justify-center shadow-inner">
                 <Scanner 
                    onScan={(result) => {
                      const text = Array.isArray(result) ? result[0]?.rawValue : (result as any)?.rawValue || result;
                      if(text) handleScanQr(text.toString());
                    }} 
                 />
                 <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
                    <span className="bg-black/70 text-white text-xs font-bold px-4 py-2 rounded-full backdrop-blur-sm border border-white/20 shadow-xl">Arahkan ke layar HP operator asal</span>
                 </div>
               </div>
             )}

             <button onClick={() => setShowQrModal(false)} className="w-full py-4 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors active:scale-95">
               Tutup
             </button>
           </div>
         </div>
      )}

      {/* INCOMING TRANSFER CONFIRMATION */}
      {incomingTransfer && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95">
             <div className="w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center mb-4">
               <QrCode className="w-6 h-6 text-teal-600 dark:text-teal-400" />
             </div>
             <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">Terima Transfer Antrian?</h3>
             <p className="text-slate-600 dark:text-slate-400 font-medium mb-6 leading-relaxed">Ada data antrian masuk sejumlah {incomingTransfer.queue.length} mobil. Konfigurasi stasiun dan antrian saat ini akan <strong>ditimpa permanen</strong>.</p>
             <div className="flex gap-3">
               <button onClick={() => setIncomingTransfer(null)} className="flex-1 py-3 px-4 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                 Batal
               </button>
               <button onClick={acceptTransfer} className="flex-1 py-3 px-4 rounded-xl font-bold bg-teal-500 hover:bg-teal-400 text-white shadow-lg transition-all active:scale-95">
                 Terima Data
               </button>
             </div>
           </div>
         </div>
      )}

      {/* HELP / TUTORIAL MODAL */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2"><Info className="w-6 h-6 text-teal-500" /> Bantuan</h3>
              <button onClick={() => setShowHelpModal(false)} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:text-slate-700 transition-colors"><X className="w-5 h-5" /></button>
            </div>
            
            <div className="flex flex-col gap-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center shrink-0"><Zap className="w-5 h-5 text-teal-600 dark:text-teal-400" /></div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">1. Panggil Mobil</h4>
                  <p className="text-sm text-slate-500">Tekan tombol <strong className="text-teal-600 dark:text-teal-400">HIJAU</strong> untuk memasukkan taksi terdepan ke kotak nozzle yang kosong.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0"><Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" /></div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">2. Sedang Cas</h4>
                  <p className="text-sm text-slate-500">Mobil di kotak <strong className="text-amber-600 dark:text-amber-400">KUNING</strong> sedang mengisi daya. Klik kotaknya jika pengisian sudah <strong className="text-teal-600 dark:text-teal-400">Selesai</strong>.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0"><RotateCcw className="w-5 h-5 text-slate-600 dark:text-slate-400" /></div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">3. Salah Klik? (Undo)</h4>
                  <p className="text-sm text-slate-500">Gunakan tombol <strong>Undo</strong> yang muncul di bawah layar (selama 7 detik) untuk membatalkan kesalahan input data.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0"><QrCode className="w-5 h-5 text-blue-600 dark:text-blue-400" /></div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">4. Operan Shift (QR)</h4>
                  <p className="text-sm text-slate-500">Gunakan icon Barcode di pojok kanan atas untuk memindahkan seluruh daftar antrian ke HP rekan pengganti Anda.</p>
                </div>
              </div>
            </div>
            
            <button 
              onClick={() => setShowHelpModal(false)}
              className="w-full mt-8 py-4 rounded-xl font-bold bg-teal-500 text-white hover:bg-teal-400 transition-colors shadow-lg shadow-teal-500/20"
            >
              Saya Mengerti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
