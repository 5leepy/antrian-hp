"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Check, X, Clock, CarFront, History, List, BatteryCharging, Zap } from "lucide-react";

type QueueItem = {
  id: string;
  fleetNumber: string;
  enqueueTime: number;
  status: "waiting" | "charging" | "completed" | "cancelled";
  completedTime?: number;
  chargingTime?: number;
};

const MAX_NOZZLES = 2;

export default function Home() {
  const [activeTab, setActiveTab] = useState<"queue" | "history">("queue");
  const [fleetInput, setFleetInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [history, setHistory] = useState<QueueItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Timer for relative time updates
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Load state from LocalStorage
  useEffect(() => {
    const savedQueue = localStorage.getItem("ev_queue");
    const savedHistory = localStorage.getItem("ev_history");
    if (savedQueue) setQueue(JSON.parse(savedQueue));
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    setIsLoaded(true);
  }, []);

  // Save state to LocalStorage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem("ev_queue", JSON.stringify(queue));
      localStorage.setItem("ev_history", JSON.stringify(history));
    }
  }, [queue, history, isLoaded]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const inputClean = fleetInput.trim().toUpperCase();
    if (!inputClean) return;

    // Validation: Check duplicate in active queue
    const isDuplicate = queue.some(q => q.fleetNumber === inputClean);
    if (isDuplicate) {
      setErrorMsg(`Taksi ${inputClean} sudah ada di antrian atau sedang charging!`);
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
  };

  const handleAction = (item: QueueItem, action: "charging" | "completed" | "cancelled") => {
    if (action === "charging") {
      setQueue((prev) => prev.map(q => q.id === item.id ? { ...q, status: "charging", chargingTime: Date.now() } : q));
    } else {
      const updatedItem = { ...item, status: action, completedTime: Date.now() };
      setQueue((prev) => prev.filter((q) => q.id !== item.id));
      setHistory((prev) => [updatedItem, ...prev]);
    }
  };

  if (!isLoaded) return null; // Avoid hydration mismatch

  // Split queue items
  const chargingCars = queue.filter(q => q.status === "charging").sort((a,b) => (a.chargingTime || 0) - (b.chargingTime || 0));
  const waitingCars = queue.filter(q => q.status === "waiting").sort((a, b) => a.enqueueTime - b.enqueueTime);
  const isNozzleFull = chargingCars.length >= MAX_NOZZLES;

  // History variables
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayHistory = history.filter(
    (h) => h.completedTime && h.completedTime >= todayStart.getTime()
  );
  const completedTodayCount = todayHistory.filter(h => h.status === 'completed').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500/30">
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10 shadow-sm shadow-black/20">
        <h1 className="text-xl font-bold text-center bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent flex items-center justify-center gap-2">
          <CarFront className="w-6 h-6 text-teal-400" />
          EV Charging Queue
        </h1>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col gap-6 pb-20">
        <div className="flex bg-slate-900 rounded-xl p-1 gap-1 border border-slate-800 shadow-inner">
          <button
            onClick={() => setActiveTab("queue")}
            className={`flex-1 py-3 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
              activeTab === "queue"
                ? "bg-slate-800 text-teal-400 shadow-md border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <List className="w-4 h-4" />
            Antrian ({queue.length})
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex-1 py-3 px-4 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-all duration-200 ${
              activeTab === "history"
                ? "bg-slate-800 text-teal-400 shadow-md border border-slate-700"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <History className="w-4 h-4" />
            Riwayat
          </button>
        </div>

        {activeTab === "queue" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col gap-5">
            {/* Input Form */}
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <label htmlFor="fleet" className="text-sm font-medium text-slate-300 ml-1">
                Masukan Nomor Lambung
              </label>
              <div className="relative">
                <input
                  id="fleet"
                  type="text"
                  value={fleetInput}
                  onChange={(e) => {
                    setFleetInput(e.target.value);
                    if (errorMsg) setErrorMsg("");
                  }}
                  onClick={() => { if (errorMsg) setErrorMsg(""); }}
                  placeholder="Contoh: 023"
                  className={`w-full bg-slate-900 border ${errorMsg ? 'border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'} rounded-2xl py-4 px-5 text-3xl font-bold text-center uppercase tracking-wider placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all shadow-inner`}
                  autoComplete="off"
                  inputMode="numeric"
                />
              </div>
              {errorMsg && (
                <p className="text-rose-400 text-sm font-medium text-center bg-rose-500/10 py-2 rounded-lg border border-rose-500/20 animate-in fade-in zoom-in duration-200">
                  {errorMsg}
                </p>
              )}
              <button
                type="submit"
                disabled={!fleetInput.trim()}
                className="w-full bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-bold text-lg py-4 rounded-2xl shadow-lg hover:shadow-teal-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-1"
              >
                Masuk Antrian
              </button>
            </form>

            <div className="w-full h-px bg-slate-800/50 my-1"></div>

            {/* CHARGING SECTION */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-lg font-semibold text-teal-400 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-teal-400" />
                  Sedang Charging
                </h2>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${isNozzleFull ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-teal-900/40 text-teal-300 border-teal-500/20'}`}>
                  {chargingCars.length} / {MAX_NOZZLES} Nozzle
                </span>
              </div>

              {chargingCars.length === 0 ? (
                <div className="bg-slate-900/30 border border-slate-800/50 border-dashed rounded-2xl p-6 text-center">
                  <p className="text-slate-500 text-sm">Tidak ada taksi yang sedang charging.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {chargingCars.map((item) => (
                    <li
                      key={item.id}
                      className="bg-gradient-to-br from-teal-950/40 to-slate-900 border border-teal-500/30 rounded-2xl p-4 flex flex-col gap-4 shadow-sm relative overflow-hidden group"
                    >
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-teal-400 to-emerald-500 animate-pulse"></div>
                      
                      <div className="flex justify-between items-start pl-2">
                        <div>
                          <p className="text-xs font-medium bg-teal-500/10 inline-block px-2 py-0.5 rounded text-teal-300 border border-teal-500/20 mb-1 flex items-center gap-1">
                            <BatteryCharging className="w-3 h-3" />
                            Charging
                          </p>
                          <h3 className="text-3xl font-black tracking-tight text-white">
                            {item.fleetNumber}
                          </h3>
                        </div>
                        <div className="text-right flex flex-col items-end">
                           <span className="text-sm font-medium text-slate-300">
                             Mulai: {item.chargingTime ? format(item.chargingTime, "HH:mm") : format(item.enqueueTime, "HH:mm")}
                           </span>
                           <span className="text-xs text-teal-400/80 font-medium mt-0.5">
                             {item.chargingTime ? Math.floor((currentTime - item.chargingTime) / 60000) : 0} mnt berjalan
                           </span>
                        </div>
                      </div>

                      <div className="flex gap-2.5 mt-1">
                        <button
                          onClick={() => handleAction(item, "completed")}
                          className="flex-1 bg-teal-500 hover:bg-teal-400 text-slate-950 py-3.5 px-2 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-teal-500/20"
                        >
                          <Check className="w-5 h-5" />
                          Selesai Charge
                        </button>
                        <button
                          onClick={() => handleAction(item, "cancelled")}
                          className="flex-[0.25] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 py-3.5 px-2 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* WAITING QUEUE */}
            <div className="flex flex-col gap-3 mt-2">
              <div className="flex justify-between items-center mb-1">
                <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500" />
                  Antrian Menunggu
                </h2>
                <span className="text-xs font-medium bg-slate-800 text-slate-400 px-2 py-1 rounded-md border border-slate-700">
                  {waitingCars.length} Mobil
                </span>
              </div>

              {waitingCars.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800/50 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                    <CarFront className="w-6 h-6 text-slate-500" />
                  </div>
                  <p className="text-slate-400">Belum ada taksi di antrian menunggu.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {waitingCars.map((item, index) => (
                    <li
                      key={item.id}
                      className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-4 shadow-sm relative overflow-hidden group ${isNozzleFull ? 'opacity-80' : ''}`}
                    >
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-amber-400 to-amber-600"></div>
                      
                      <div className="flex justify-between items-start pl-2">
                        <div>
                          <p className="text-xs text-slate-400 mb-1 font-medium bg-slate-800 inline-block px-2 py-0.5 rounded text-amber-400 border border-amber-400/20">
                            Antrian #{index + 1}
                          </p>
                          <h3 className="text-3xl font-black tracking-tight text-white">
                            {item.fleetNumber}
                          </h3>
                        </div>
                        <div className="text-right flex flex-col items-end">
                          <span className="text-sm font-medium text-slate-300">
                            {format(item.enqueueTime, "HH:mm")}
                          </span>
                          <span className="text-xs text-gray-500 mt-0.5">
                            {Math.floor((currentTime - item.enqueueTime) / 60000)} mnt lalu
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-2.5 mt-1">
                        <button
                          onClick={() => handleAction(item, "charging")}
                          disabled={isNozzleFull}
                          className="flex-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 disabled:opacity-50 disabled:bg-slate-900 disabled:text-slate-600 disabled:border-slate-800 py-3.5 px-2 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                        >
                          <Zap className="w-5 h-5" />
                          {isNozzleFull ? 'Nozzle Penuh' : 'Panggil'}
                        </button>
                        <button
                          onClick={() => handleAction(item, "cancelled")}
                          className="flex-[0.35] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 py-3.5 px-2 rounded-xl font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                        >
                          <X className="w-5 h-5" />
                          Batal
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === "history" && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-300 flex flex-col gap-6">
            <div className="bg-gradient-to-br from-teal-900/40 to-slate-900 border border-teal-500/20 rounded-2xl p-5 flex items-center justify-between shadow-lg">
              <div>
                <p className="text-teal-400 text-sm font-medium mb-1">Total Selesai Hari Ini</p>
                <p className="text-4xl font-black text-white">{completedTodayCount} <span className="text-lg text-slate-400 font-medium">Mobil</span></p>
              </div>
              <div className="w-14 h-14 bg-teal-500/20 rounded-2xl flex items-center justify-center border border-teal-500/30">
                <Check className="w-7 h-7 text-teal-400" />
              </div>
            </div>

            <div className="flex flex-col gap-3 mt-2">
               <h2 className="text-lg font-semibold text-slate-200 flex items-center gap-2 mb-1">
                <History className="w-5 h-5 text-slate-400" />
                Riwayat Selesai & Batal
              </h2>
              
              {todayHistory.length === 0 ? (
                <div className="bg-slate-900/50 border border-slate-800/50 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                    <History className="w-6 h-6 text-slate-500" />
                  </div>
                  <p className="text-slate-400">Belum ada riwayat hari ini.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {todayHistory.map((item) => (
                    <li
                      key={item.id}
                      className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex justify-between items-center"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-1.5 h-10 rounded-full ${item.status === 'completed' ? 'bg-teal-500' : 'bg-rose-500'}`}></div>
                        <div>
                          <h4 className="text-lg font-bold text-slate-200">
                            {item.fleetNumber}
                          </h4>
                          <p className="text-xs text-slate-500">
                            Mulai: {format(item.enqueueTime, "HH:mm")} • Selesai: {item.completedTime ? format(item.completedTime, "HH:mm") : "-"}
                          </p>
                        </div>
                      </div>
                      <div>
                        {item.status === "completed" ? (
                          <span className="bg-teal-500/10 text-teal-400 border border-teal-500/20 text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1">
                            <Check className="w-3 h-3" /> Selesai
                          </span>
                        ) : (
                          <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1">
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
    </div>
  );
}
