"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { format } from "date-fns";
import { QRCodeSVG } from "qrcode.react";
import LZString from "lz-string";
import { Check, X, Clock, CarFront, History, List, BatteryCharging, Zap, Sun, Moon, Search, Edit2, RotateCcw, Info, ChevronRight, SkipForward, QrCode, Trash2 } from "lucide-react";

type QueueItem = {
  id: string;
  fleetNumber: string;
  enqueueTime: number;
  status: "waiting" | "charging" | "completed" | "cancelled";
  completedTime?: number;
  chargingTime?: number;
};

type ToastType = {
  id: number;
  message: string;
  type: "success" | "error" | "info";
};

const MAX_NOZZLES = 2;
const AVG_CHARGING_TIME_MINS = 30; // 30 minutes average

function SwipeButton({ onConfirm, successText = "Selesai" }: { onConfirm: () => void, successText?: string }) {
  const [slide, setSlide] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  
  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isSwiping || isSuccess || !trackRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const trackRect = trackRef.current.getBoundingClientRect();
    const maxSlide = trackRect.width - 56;
    const newSlide = Math.max(0, Math.min(clientX - trackRect.left - 24, maxSlide));
    setSlide(newSlide);
    
    if (newSlide >= maxSlide * 0.85) {
      setIsSuccess(true);
      setSlide(maxSlide);
      onConfirm();
    }
  };
  
  const handleEnd = () => {
    setIsSwiping(false);
    if (!isSuccess) setSlide(0);
  };
  
  return (
    <div 
      ref={trackRef}
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
      <span className={`font-bold text-sm text-slate-500 dark:text-slate-400 pl-8 pointer-events-none transition-opacity duration-200 ${isSuccess || slide > 30 ? 'opacity-0' : 'opacity-100'}`}>
        Geser untuk Selesai
      </span>
      {isSuccess && <span className="font-bold text-sm text-white pointer-events-none absolute w-full text-center pl-8 fade-in animate-in">Selesai!</span>}
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"queue" | "history">("queue");
  const [fleetInput, setFleetInput] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<QueueItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [toast, setToast] = useState<ToastType | null>(null);
  const [searchHistory, setSearchHistory] = useState("");

  // Edit State
  const [editingItem, setEditingItem] = useState<{ id: string; fleetNumber: string } | null>(null);

  // Undo State
  const [undoItem, setUndoItem] = useState<{ item: QueueItem; timeoutId: NodeJS.Timeout; prevStatus: QueueItem['status'] } | null>(null);

  // Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  // Transfer State
  const [showQrModal, setShowQrModal] = useState(false);
  const [transferUrl, setTransferUrl] = useState("");
  const [incomingTransfer, setIncomingTransfer] = useState<QueueItem[] | null>(null);

  // Sound Synth Ref (to avoid multiple instances)
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000); // UI update every minute
    return () => clearInterval(timer);
  }, []);

  // Hydrate localstorage limits
  useEffect(() => {
    const savedQueue = localStorage.getItem("ev_queue");
    const savedHistory = localStorage.getItem("ev_history");
    const savedTheme = localStorage.getItem("ev_theme");

    if (savedQueue) setQueue(JSON.parse(savedQueue));
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      if (savedTheme === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.add("dark");
      }
    } else {
      // Default to dark
      document.documentElement.classList.add("dark");
    }

    setIsLoaded(true);
  }, []);

  // Save to localstorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("ev_queue", JSON.stringify(queue));
      localStorage.setItem("ev_history", JSON.stringify(history));
      localStorage.setItem("ev_theme", theme);
    }
  }, [queue, history, theme, isLoaded]);

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
            setIncomingTransfer(parsed);
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
    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(queue));
    const url = `${window.location.origin}?q=${compressed}`;
    setTransferUrl(url);
    setShowQrModal(true);
  };

  const acceptTransfer = () => {
    if (incomingTransfer) {
      setQueue(incomingTransfer);
      setIncomingTransfer(null);
      showToast("Antrian berhasil ditimpa dengan data transfer!", "success");
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
        localStorage.removeItem("ev_queue");
        localStorage.removeItem("ev_history");
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
    const inputClean = fleetInput.trim().toUpperCase();
    if (!inputClean) return;

    const isDuplicate = queue.some(q => q.fleetNumber === inputClean);
    if (isDuplicate) {
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
      setHistory((prev) => [updatedItem, ...prev]);

      if (action === "completed") {
        playBeep();
      }
      showToast(`Taksi ${item.fleetNumber} dipindah ke Riwayat (${action === 'completed' ? 'Selesai' : 'Batal'})`, "success");

      // Set Undo 
      if (undoItem) clearTimeout(undoItem.timeoutId);
      const timeoutId = setTimeout(() => setUndoItem(null), 7000); // 7 seconds undo window
      setUndoItem({ item: updatedItem, timeoutId, prevStatus: originalStatus as "charging" | "waiting" });
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
    
    // Remove from history
    setHistory(prev => prev.filter(h => h.id !== undoItem.item.id));
    
    // Add back to queue
    const restoredItem = { 
      ...undoItem.item, 
      status: undoItem.prevStatus 
    };
    delete restoredItem.completedTime;
    
    setQueue(prev => [...prev, restoredItem]);
    showToast(`Undo berhasil: Taksi ${restoredItem.fleetNumber} kembali ke antrian`, "success");
    setUndoItem(null);
  };

  const saveEdit = (id: string) => {
    if (!editingItem || !editingItem.fleetNumber.trim()) {
      setEditingItem(null);
      return;
    }
    const cleanFleet = editingItem.fleetNumber.trim().toUpperCase();
    
    const isDuplicate = queue.some(q => q.id !== id && q.fleetNumber === cleanFleet);
    if (isDuplicate) {
      showToast(`Taksi ${cleanFleet} sudah ada di antrian!`, "error");
      return;
    }

    setQueue(prev => prev.map(q => q.id === id ? { ...q, fleetNumber: cleanFleet } : q));
    setEditingItem(null);
    showToast("Nomor lambung diperbarui", "success");
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

  const chargingCars = queue.filter(q => q.status === "charging").sort((a,b) => (a.chargingTime || 0) - (b.chargingTime || 0));
  const waitingCars = queue.filter(q => q.status === "waiting").sort((a, b) => a.enqueueTime - b.enqueueTime);
  const isNozzleFull = chargingCars.length >= MAX_NOZZLES;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  let filteredHistory = history;
  if (searchHistory.trim()) {
      filteredHistory = history.filter(h => h.fleetNumber.includes(searchHistory.toUpperCase()));
  } else {
      filteredHistory = history.filter(h => h.completedTime && h.completedTime >= todayStart.getTime());
  }

  const completedTodayCount = history.filter(h => h.status === 'completed' && h.completedTime && h.completedTime >= todayStart.getTime()).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans transition-colors duration-300">
      <header className="sticky top-0 z-40 flex border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md justify-between items-center p-4">
        <h1 className="text-xl font-black bg-gradient-to-r from-teal-500 to-emerald-500 bg-clip-text text-transparent flex items-center gap-2">
          <CarFront className="w-6 h-6 text-teal-500" />
          Green SM Charging
        </h1>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button onClick={handleResetData} className="p-2 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-500 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors" aria-label="Reset Data">
            <Trash2 className="w-5 h-5 flex-shrink-0" />
          </button>
          <button onClick={generateTransferUrl} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-teal-500 transition-colors" aria-label="Transfer via QR">
            <QrCode className="w-5 h-5 flex-shrink-0" />
          </button>
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-teal-500 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col gap-6 pb-24">
        {/* TABS */}
        <div className="flex bg-slate-200 dark:bg-slate-900 rounded-xl p-1 gap-1 border border-slate-300 dark:border-slate-800 shadow-inner">
          <button
            onClick={() => setActiveTab("queue")}
            className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
              activeTab === "queue"
                ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm border border-slate-200 dark:border-slate-700"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <List className="w-4 h-4" />
            Antrian ({queue.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
              activeTab === "history"
                ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm border border-slate-200 dark:border-slate-700"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <History className="w-4 h-4" />
            Riwayat
          </button>
        </div>

        {/* TAB: QUEUE */}
        {activeTab === "queue" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-5">
            <form onSubmit={handleAdd} className="flex flex-col gap-4 relative bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="relative w-full flex items-center">
                <input
                  id="fleet"
                  type="text"
                  value={fleetInput}
                  onChange={handleFleetInputChange}
                  placeholder="000"
                  maxLength={3}
                  pattern="[0-9]*"
                  className="w-full bg-slate-100 dark:bg-slate-950 border-2 border-transparent focus:border-teal-500/50 rounded-2xl py-5 px-6 pr-20 text-5xl font-black text-center tracking-[0.2em] placeholder:text-slate-300 dark:placeholder:text-slate-800 focus:outline-none focus:ring-4 focus:ring-teal-500/20 transition-all shadow-inner text-slate-800 dark:text-slate-100"
                  autoComplete="off"
                  inputMode="numeric"
                />
                <button
                  type="submit"
                  disabled={!fleetInput.trim()}
                  className="absolute right-3 w-14 h-14 bg-gradient-to-br from-teal-400 to-emerald-500 hover:from-teal-300 hover:to-emerald-400 disabled:from-slate-200 disabled:to-slate-200 disabled:dark:from-slate-800 disabled:dark:to-slate-800 disabled:text-slate-400 disabled:dark:text-slate-600 text-white rounded-xl shadow-lg shadow-teal-500/30 disabled:shadow-none flex items-center justify-center transition-all active:scale-[0.95]"
                  aria-label="Masuk Antrian"
                >
                  <ChevronRight className="w-8 h-8" />
                </button>
              </div>
              <p className="text-center text-xs font-semibold text-slate-400 dark:text-slate-500">
                Masukkan maks. 3 digit nomor lambung taksi
              </p>
            </form>

            <div className="w-full h-px bg-slate-200 dark:bg-slate-800/50 my-1"></div>

            {/* CHARGING */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-lg font-bold text-teal-600 dark:text-teal-400 flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Sedang Charging
                </h2>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${isNozzleFull ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20' : 'bg-teal-50 dark:bg-teal-900/40 text-teal-600 dark:text-teal-300 border-teal-200 dark:border-teal-500/20'}`}>
                  {chargingCars.length} / {MAX_NOZZLES} Nozzle
                </span>
              </div>

              {chargingCars.length === 0 ? (
                <div className="bg-slate-100 dark:bg-slate-900/30 border border-slate-300 dark:border-slate-800/50 border-dashed rounded-2xl p-6 text-center">
                  <p className="text-slate-500">Tidak ada taksi yang sedang charging.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {chargingCars.map((item) => (
                    <li key={item.id} className="bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-500/30 rounded-2xl p-4 flex flex-col gap-4 shadow-sm relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-teal-400 to-emerald-500 animate-pulse"></div>
                      
                      <div className="flex justify-between items-start pl-2">
                        <div>
                          <p className="text-xs font-bold bg-teal-50 dark:bg-teal-500/10 inline-flex px-2 py-0.5 rounded text-teal-600 dark:text-teal-300 border border-teal-200 dark:border-teal-500/20 mb-1 items-center gap-1">
                            <BatteryCharging className="w-3 h-3" /> Charging
                          </p>
                          {editingItem?.id === item.id ? (
                            <input 
                              type="text" 
                              autoFocus
                              value={editingItem.fleetNumber}
                              onChange={(e) => setEditingItem({ ...editingItem, fleetNumber: e.target.value })}
                              onBlur={() => saveEdit(item.id)}
                              onKeyDown={(e) => e.key === 'Enter' && saveEdit(item.id)}
                              className="text-3xl font-black w-24 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-teal-400 rounded outline-none px-1 uppercase"
                            />
                          ) : (
                            <div className="flex items-center gap-2">
                              <h3 className="text-3xl font-black tracking-tight text-slate-800 dark:text-white">{item.fleetNumber}</h3>
                              <button onClick={() => setEditingItem({ id: item.id, fleetNumber: item.fleetNumber })} className="text-slate-400 opacity-70 hover:opacity-100 hover:text-teal-500 transition-opacity p-1">
                                <Edit2 className="w-5 h-5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="text-right flex flex-col items-end">
                           <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                             Mulai: {format(item.chargingTime || item.enqueueTime, "HH:mm")}
                           </span>
                           <span className="text-xs text-teal-600 dark:text-teal-400/80 font-bold mt-0.5">
                             {Math.floor((currentTime - (item.chargingTime || item.enqueueTime)) / 60000)} mnt berjalan
                           </span>
                        </div>
                      </div>

                      <div className="flex gap-2.5 mt-1">
                        <SwipeButton onConfirm={() => executeAction(item, "completed")} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
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
                    const positionInBatch = Math.floor(index / MAX_NOZZLES);
                    const isNextBatch = index < MAX_NOZZLES;
                    
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

                      <div className="flex gap-2.5 mt-1">
                        <button onClick={() => handleAction(item, "charging")} disabled={isNozzleFull} className="flex-1 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-500/20 disabled:opacity-50 disabled:bg-slate-100 disabled:dark:bg-slate-900 disabled:text-slate-400 disabled:border-slate-200 disabled:dark:border-slate-800 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-sm">
                          <Zap className="w-5 h-5" /> {isNozzleFull ? 'Penuh' : 'Panggil'}
                        </button>
                        <button onClick={() => handleSkip(item, index)} disabled={index >= waitingCars.length - 1} className="w-[52px] h-[52px] shrink-0 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:active:scale-100 rounded-xl flex items-center justify-center active:scale-[0.98] transition-all shadow-sm" aria-label="Lewati ke bawah">
                          <SkipForward className="w-5 h-5" />
                        </button>
                        <button onClick={() => handleAction(item, "cancelled")} className="w-[52px] h-[52px] shrink-0 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-rose-500 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 rounded-xl flex items-center justify-center active:scale-[0.98] transition-all shadow-sm" aria-label="Batal">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </li>
                  )})}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* TAB: HISTORY */}
        {activeTab === "history" && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300 flex flex-col gap-6">
            <div className="bg-gradient-to-br from-teal-500 to-emerald-600 rounded-2xl p-5 flex items-center justify-between shadow-lg text-white">
              <div>
                <p className="text-teal-100 text-sm font-bold mb-1 drop-shadow-sm">Total Selesai Hari Ini</p>
                <p className="text-4xl font-black drop-shadow-md">{completedTodayCount} <span className="text-lg font-bold">Mobil</span></p>
              </div>
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center border border-white/30 backdrop-blur-sm shadow-inner">
                <Check className="w-7 h-7 text-white" />
              </div>
            </div>

            <div className="flex flex-col gap-3">
               <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 mb-1">
                <History className="w-5 h-5 text-slate-500" /> Riwayat
              </h2>
              
              {/* Search History */}
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Cari nomor lambung..."
                  value={searchHistory}
                  onChange={e => setSearchHistory(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 pl-10 pr-4 py-3 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none text-slate-800 dark:text-slate-100 shadow-sm"
                />
              </div>

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
        )}

      </main>

      {/* FOOTER BRANDING */}
      <footer className="w-full py-6 text-center mt-auto border-t border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900/30">
        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 tracking-wide uppercase">
          Developed by <span className="text-teal-500 font-bold">Nadir Nahdi</span>
        </p>
      </footer>

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
        <div className="fixed bottom-6 left-4 right-4 z-40 bg-slate-900 text-white p-4 rounded-xl shadow-2xl flex items-center justify-between border border-slate-700 animate-in slide-in-from-bottom-10 fade-in zoom-in-95 duration-300">
          <div className="flex-1">
            <p className="font-bold text-sm">Taksi {undoItem.item.fleetNumber} {undoItem.item.status === 'completed' ? 'diselesaikan' : 'dibatalkan'}.</p>
          </div>
          <button onClick={handleUndo} className="bg-slate-700 hover:bg-slate-600 text-teal-400 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors border border-slate-600">
            <RotateCcw className="w-4 h-4" /> Undo
          </button>
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

      {/* QR CODE MODAL */}
      {showQrModal && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 flex flex-col items-center">
             <h3 className="text-xl font-black text-slate-800 dark:text-teal-400 mb-2">Transfer Antrian</h3>
             <p className="text-slate-500 text-center text-sm mb-6">Minta operator pengganti untuk men-scan QR ini menggunakan kamera HP mereka.</p>
             <div className="bg-white p-4 rounded-2xl shadow-inner border border-slate-200 mb-6">
               <QRCodeSVG value={transferUrl} size={200} level="M" />
             </div>
             <button onClick={() => setShowQrModal(false)} className="w-full py-3 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
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
             <p className="text-slate-600 dark:text-slate-400 font-medium mb-6 leading-relaxed">Ada data antrian masuk sejumlah {incomingTransfer.length} mobil. Jika diterima, antrian Anda saat ini akan <strong>ditimpa / terhapus</strong>.</p>
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
    </div>
  );
}
