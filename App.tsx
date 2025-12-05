import React, { useState, useEffect } from 'react';
import { WalkieTalkie } from './components/WalkieTalkie';

const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string | undefined>(process.env.API_KEY);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    // Check if key is available in env first
    if (process.env.API_KEY) {
        setHasKey(true);
        return;
    }
    
    // If no env key, check AI Studio auth
    const checkKey = async () => {
        const win = window as any;
        if (win.aistudio) {
            const hasSelected = await win.aistudio.hasSelectedApiKey();
            setHasKey(hasSelected);
            if (hasSelected) {
                // In a real environment with the specific AI Studio wrapper, 
                // the key is injected into process.env or intercepted.
                // We just proceed assuming the environment is set up as per instructions.
                setApiKey(process.env.API_KEY || "dummy-key-for-now"); 
            }
        }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    const win = window as any;
    if (win.aistudio) {
        await win.aistudio.openSelectKey();
        // Assume success as per instructions
        setHasKey(true);
        // Force re-render or state update might be needed if the key is injected dynamically
        // but for this pattern we rely on the component remounting or internal checks
        window.location.reload(); 
    }
  };

  if (!hasKey && !apiKey) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
            <h1 className="text-4xl font-bold text-white mb-6 font-mono tracking-tighter">GEMINI COMMLINK</h1>
            <div className="max-w-md bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl">
                <p className="text-zinc-400 mb-8">
                    Secure AI Communication Channel. <br/>
                    Please insert encryption key to proceed.
                </p>
                <button 
                    onClick={handleSelectKey}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-lg transition-all w-full mb-4 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                    Insert API Key
                </button>
                <a 
                    href="https://ai.google.dev/gemini-api/docs/billing" 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-xs text-zinc-600 hover:text-zinc-400 underline"
                >
                    How to obtain a key
                </a>
            </div>
        </div>
      );
  }

  return (
    <WalkieTalkie apiKey={apiKey} />
  );
};

export default App;