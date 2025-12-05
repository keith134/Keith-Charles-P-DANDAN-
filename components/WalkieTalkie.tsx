import React, { useState, useEffect } from 'react';
import { Mic, Power, Settings, Radio, Volume2, Info } from 'lucide-react';
import { ConnectionState, VoicePreset, AudioMode } from '../types';
import { useGeminiLive } from '../hooks/useGeminiLive';
import { VOICE_PRESETS } from '../constants';

interface WalkieTalkieProps {
    apiKey: string | undefined;
}

export const WalkieTalkie: React.FC<WalkieTalkieProps> = ({ apiKey }) => {
  const [selectedPreset, setSelectedPreset] = useState<VoicePreset>(VOICE_PRESETS[0]);
  const [audioMode, setAudioMode] = useState<AudioMode>(AudioMode.PUSH_TO_TALK);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const {
    connectionState,
    error,
    connect,
    disconnect,
    setTalking,
    isTalking
  } = useGeminiLive({
    apiKey,
    voicePreset: selectedPreset,
    onVolumeChange: (inVol, outVol) => {
        setInputLevel(inVol);
        setOutputLevel(outVol);
    }
  });

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  // Wake Lock for Mobile
  useEffect(() => {
    let wakeLock: any = null;

    const requestWakeLock = async () => {
        if (isConnected && 'wakeLock' in navigator) {
            try {
                // @ts-ignore
                wakeLock = await navigator.wakeLock.request('screen');
            } catch (err) {
                console.log('Wake Lock Error:', err);
            }
        }
    };

    if (isConnected) {
        requestWakeLock();
    }

    return () => {
        if (wakeLock) wakeLock.release();
    };
  }, [isConnected]);

  // Haptic Feedback Helper
  const triggerHaptic = (pattern: number | number[]) => {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
              navigator.vibrate(pattern);
          } catch (e) {
              console.log("Haptics not supported or blocked");
          }
      }
  };

  // Toggle power
  const handlePower = () => {
    if (isConnected || isConnecting) {
      triggerHaptic(200); // Long vibration for power off
      disconnect();
    } else {
      triggerHaptic([50, 50, 50]); // Triple pulse for startup
      connect();
    }
  };

  // PTT handlers
  const handlePTTStart = (e: React.MouseEvent | React.TouchEvent) => {
    // Prevent default to stop scrolling/selecting on mobile
    if (e.cancelable) e.preventDefault();
    if (isConnected) {
        triggerHaptic(50); // Sharp click on press
        setTalking(true);
    }
  };

  const handlePTTEnd = (e: React.MouseEvent | React.TouchEvent) => {
    if (e.cancelable) e.preventDefault();
    if (isConnected) {
        triggerHaptic(30); // Subtle release click
        setTalking(false);
    }
  };

  // Status LED Logic
  const getLedColor = () => {
    if (error) return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]';
    if (isTalking) return 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,1)] animate-pulse';
    if (outputLevel > 10) return 'bg-green-400 shadow-[0_0_15px_rgba(74,222,128,1)]';
    if (isConnected) return 'bg-green-600 shadow-[0_0_5px_rgba(22,163,74,0.5)]';
    if (isConnecting) return 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)] animate-pulse';
    return 'bg-zinc-800 border border-zinc-700';
  };

  return (
    <div className="flex flex-col items-center justify-between min-h-[100dvh] bg-zinc-900 overflow-hidden select-none touch-none pb-safe-area">
      
      {/* Top Spacer / Antenna Area */}
      <div className="w-full flex justify-center pt-safe-top mt-4 flex-shrink-0">
          <div className="relative">
             {/* Antenna */}
            <div className="absolute -top-32 left-1/2 ml-12 w-4 h-48 bg-zinc-600 rounded-t-lg border-l border-zinc-500 shadow-xl z-0 transition-transform origin-bottom duration-500 ease-in-out hover:rotate-2">
                <div className="absolute top-0 w-full h-2 bg-zinc-900 rounded-full"></div>
            </div>
          </div>
      </div>

      {/* Main Device */}
      <div className="relative w-full max-w-md bg-zinc-800 rounded-[3rem] p-6 shadow-2xl border-4 border-zinc-700 ring-1 ring-black z-10 mx-4 flex flex-col mb-4">
        
        {/* Top Grill & Brand */}
        <div className="flex justify-between items-center mb-6 relative z-10">
            <div className="flex gap-1">
                {[1,2,3].map(i => (
                    <div key={i} className="w-12 h-3 bg-black rounded-full opacity-30"></div>
                ))}
            </div>
            <div className="text-zinc-500 font-bold font-mono tracking-widest text-sm uppercase">
                Gemini Link
            </div>
        </div>

        {/* Main Display Area */}
        <div className="bg-[#111] rounded-2xl p-4 mb-6 border-4 border-zinc-700 shadow-[inset_0_4px_10px_rgba(0,0,0,1)] screen-glow h-48 flex flex-col justify-between relative">
          
          {/* Status Bar */}
          <div className="flex justify-between items-start font-mono-display text-xs text-emerald-500/80 mb-2 relative z-10">
            <span>FREQ: 144.{VOICE_PRESETS.indexOf(selectedPreset) + 1}5 MHz</span>
            <div className="flex gap-1">
                <span className={isTalking ? "text-red-500 font-bold" : "text-zinc-700"}>TX</span>
                <span className={(!isTalking && outputLevel > 5) ? "text-emerald-500 font-bold" : "text-zinc-700"}>RX</span>
            </div>
          </div>

          {/* Visualization / Info */}
          <div className="flex-1 flex flex-col items-center justify-center relative z-10">
             {error ? (
                 <div className="text-red-500 text-center font-mono text-sm px-2 blink">
                     ERROR: {error}
                 </div>
             ) : (
                <>
                    <div className="w-full flex justify-center items-end h-16 gap-1 mb-2">
                        {/* Audio Waveform Simulation */}
                        {[...Array(20)].map((_, i) => {
                            const level = isTalking ? inputLevel : outputLevel;
                            const height = Math.min(100, Math.max(5, level * (Math.random() + 0.5) * 2));
                            const activeColor = isTalking ? 'bg-red-500' : selectedPreset.color.replace('text-', 'bg-');
                            return (
                                <div 
                                    key={i} 
                                    className={`w-1 rounded-t-sm transition-all duration-75 ${isConnected ? activeColor : 'bg-zinc-800'}`}
                                    style={{ height: `${isConnected ? height : 5}%`, opacity: isConnected ? 1 : 0.5 }}
                                ></div>
                            )
                        })}
                    </div>
                    <div className={`font-mono-display text-lg uppercase tracking-wider transition-colors duration-300 text-center ${isConnected ? 'text-white' : 'text-zinc-600'}`}>
                        {isConnected ? selectedPreset.name : "OFFLINE"}
                    </div>
                    {isTalking && <div className="text-red-400 text-xs font-mono animate-pulse mt-1">TRANSMITTING...</div>}
                    {!isTalking && isConnected && outputLevel > 10 && <div className="text-emerald-400 text-xs font-mono mt-1">RECEIVING...</div>}
                </>
             )}
          </div>
          
          {/* Bottom Info */}
          <div className="flex justify-between items-end border-t border-zinc-800 pt-2 mt-2 relative z-10">
            <div className="text-[10px] text-zinc-500 font-mono">
                {connectionState}
            </div>
            <div className="text-[10px] text-zinc-500 font-mono">
                CH-{VOICE_PRESETS.indexOf(selectedPreset) + 1}
            </div>
          </div>
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Channel/Preset Dial */}
            <div className="col-span-1 flex flex-col items-center gap-2">
                <label className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Channel</label>
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    disabled={isConnected}
                    className={`w-16 h-16 rounded-full bg-zinc-700 shadow-[0_4px_0_rgb(39,39,42),0_5px_10px_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center border border-zinc-600 ${isConnected ? 'opacity-50 cursor-not-allowed' : 'hover:bg-zinc-650'}`}
                >
                    <Settings className="w-6 h-6 text-zinc-300" />
                </button>
            </div>

            {/* Main PTT Button */}
            <div className="col-span-1 flex flex-col items-center -mt-4 relative">
                 <div className={`w-3 h-3 rounded-full mb-2 transition-all duration-300 ${getLedColor()}`}></div>
                 
                 <button 
                    onMouseDown={handlePTTStart}
                    onMouseUp={handlePTTEnd}
                    onMouseLeave={handlePTTEnd}
                    onTouchStart={handlePTTStart}
                    onTouchEnd={handlePTTEnd}
                    onTouchCancel={handlePTTEnd}
                    disabled={!isConnected}
                    style={{ touchAction: 'none' }} // Critical for mobile
                    className={`
                        w-24 h-32 rounded-2xl 
                        bg-orange-600 
                        shadow-[0_6px_0_rgb(154,52,18),0_10px_20px_rgba(0,0,0,0.5)] 
                        active:translate-y-1 active:shadow-[0_2px_0_rgb(154,52,18),0_4px_10px_rgba(0,0,0,0.5)]
                        transition-all flex flex-col items-center justify-center border-t border-orange-400
                        group select-none
                        ${!isConnected ? 'opacity-50 cursor-not-allowed grayscale' : 'hover:bg-orange-500'}
                    `}
                 >
                    <div className="w-full h-full speaker-grille rounded-xl opacity-20 absolute top-0 left-0 pointer-events-none"></div>
                    <Mic className={`w-8 h-8 text-white relative z-10 transition-transform ${isTalking ? 'scale-90' : ''}`} />
                    <span className="text-[10px] font-bold text-orange-900 mt-2 relative z-10">PTT</span>
                 </button>
            </div>

            {/* Power Toggle */}
            <div className="col-span-1 flex flex-col items-center gap-2">
                <label className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">Power</label>
                <button 
                    onClick={handlePower}
                    className={`w-16 h-16 rounded-full bg-zinc-700 shadow-[0_4px_0_rgb(39,39,42),0_5px_10px_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center border border-zinc-600 ${isConnected ? 'bg-zinc-800' : 'hover:bg-zinc-650'}`}
                >
                    <Power className={`w-6 h-6 ${isConnected ? 'text-green-500' : 'text-red-500'}`} />
                </button>
            </div>
        </div>

        {/* Speaker Mesh */}
        <div className="w-full h-24 bg-zinc-900 rounded-xl speaker-grille shadow-inner border border-zinc-700/50 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full border border-zinc-700 flex items-center justify-center opacity-30">
                <div className="w-8 h-8 rounded-full border border-zinc-700"></div>
            </div>
        </div>

        {/* Modal / Settings Overlay */}
        {showSettings && (
            <div className="absolute inset-0 bg-black/95 z-50 rounded-[2.5rem] p-6 flex flex-col">
                <h3 className="text-white font-mono text-lg mb-4 flex items-center gap-2">
                    <Radio className="w-5 h-5" />
                    CHANNEL SELECT
                </h3>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                    {VOICE_PRESETS.map(preset => (
                        <button
                            key={preset.id}
                            onClick={() => {
                                setSelectedPreset(preset);
                                setShowSettings(false);
                            }}
                            className={`w-full p-4 rounded-lg text-left font-mono text-sm border transition-all active:scale-95 ${selectedPreset.id === preset.id ? 'bg-zinc-800 border-emerald-500 text-emerald-400' : 'bg-transparent border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`}
                        >
                            <div className="font-bold">{preset.name}</div>
                            <div className="text-[10px] opacity-70 mt-1 line-clamp-2 leading-relaxed">{preset.systemInstruction}</div>
                        </button>
                    ))}
                </div>
                <button 
                    onClick={() => setShowSettings(false)}
                    className="mt-4 w-full py-4 bg-zinc-800 rounded-lg text-zinc-300 font-mono text-sm hover:bg-zinc-700 active:bg-zinc-600"
                >
                    CLOSE
                </button>
            </div>
        )}

      </div>
      
      {/* Footer Instructions */}
      <div className="mb-4 text-center max-w-sm flex-shrink-0 px-4">
        <p className="text-zinc-600 text-[10px]">
            Mobile App Ready • Install via Share Menu
        </p>
      </div>
    </div>
  );
};