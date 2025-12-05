import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionState, VoicePreset } from '../types';
import { SAMPLE_RATE_INPUT, SAMPLE_RATE_OUTPUT } from '../constants';
import { decodeAudioData, pcmToGeminiBlob, base64ToUint8Array } from '../utils/audio';

interface UseGeminiLiveProps {
  apiKey: string | undefined;
  voicePreset: VoicePreset;
  onVolumeChange: (inputVol: number, outputVol: number) => void;
}

export const useGeminiLive = ({ apiKey, voicePreset, onVolumeChange }: UseGeminiLiveProps) => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [isTalking, setIsTalking] = useState(false); // If true, we are sending audio

  // Refs for audio context and processing
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const currentSessionRef = useRef<any>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Volumeter logic
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (currentSessionRef.current) {
        // Try to close if method exists, though SDK might handle it on disconnect
        try {
            // @ts-ignore
            currentSessionRef.current.close && currentSessionRef.current.close();
        } catch (e) {
            console.error("Error closing session", e);
        }
        currentSessionRef.current = null;
    }
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
    }
    sessionPromiseRef.current = null;
    setConnectionState(ConnectionState.DISCONNECTED);
  }, []);

  // Update volume meters
  const updateMeters = () => {
    let inputVol = 0;
    let outputVol = 0;

    if (inputAnalyserRef.current) {
        const dataArray = new Uint8Array(inputAnalyserRef.current.frequencyBinCount);
        inputAnalyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        inputVol = avg;
    }

    if (outputAnalyserRef.current) {
        const dataArray = new Uint8Array(outputAnalyserRef.current.frequencyBinCount);
        outputAnalyserRef.current.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        outputVol = avg;
    }

    onVolumeChange(inputVol, outputVol);
    animationFrameRef.current = requestAnimationFrame(updateMeters);
  };

  const connect = async () => {
    if (!apiKey) {
      setError("API Key is missing.");
      return;
    }
    
    try {
      setConnectionState(ConnectionState.CONNECTING);
      setError(null);

      // Initialize Audio Contexts
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      inputContextRef.current = new AudioContextClass({ sampleRate: SAMPLE_RATE_INPUT });
      audioContextRef.current = new AudioContextClass({ sampleRate: SAMPLE_RATE_OUTPUT });
      nextStartTimeRef.current = 0;

      // Resume contexts immediately (important for mobile)
      await inputContextRef.current.resume();
      await audioContextRef.current.resume();

      // Setup Analysers
      inputAnalyserRef.current = inputContextRef.current.createAnalyser();
      inputAnalyserRef.current.fftSize = 64;
      outputAnalyserRef.current = audioContextRef.current.createAnalyser();
      outputAnalyserRef.current.fftSize = 64;
      
      // Start visualization loop
      updateMeters();

      // Get Microphone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: SAMPLE_RATE_INPUT,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      mediaStreamRef.current = stream;

      const ai = new GoogleGenAI({ apiKey });

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: async () => {
            console.log('Gemini Live Session Opened');
            setConnectionState(ConnectionState.CONNECTED);
            
            // Setup Input Processing
            if (!inputContextRef.current || !mediaStreamRef.current) return;
            
            sourceNodeRef.current = inputContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            scriptProcessorRef.current = inputContextRef.current.createScriptProcessor(4096, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (e) => {
              // Only send if we are "talking" (PTT pressed)
              if (!isTalking) return; 

              const inputData = e.inputBuffer.getChannelData(0);
              const blob = pcmToGeminiBlob(inputData, SAMPLE_RATE_INPUT);
              
              if (sessionPromiseRef.current) {
                sessionPromiseRef.current.then(session => {
                  session.sendRealtimeInput({ media: blob });
                });
              }
            };

            // Connect graph
            sourceNodeRef.current.connect(inputAnalyserRef.current!);
            inputAnalyserRef.current!.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputContextRef.current.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (!audioContextRef.current) return;

            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            
            if (base64Audio) {
              try {
                const audioBuffer = await decodeAudioData(
                  base64ToUint8Array(base64Audio),
                  audioContextRef.current,
                  SAMPLE_RATE_OUTPUT,
                  1
                );

                const source = audioContextRef.current.createBufferSource();
                source.buffer = audioBuffer;
                
                // Connect to analyser then to speakers
                source.connect(outputAnalyserRef.current!);
                outputAnalyserRef.current!.connect(audioContextRef.current.destination);
                
                source.onended = () => {
                    activeSourcesRef.current.delete(source);
                };
                activeSourcesRef.current.add(source);

                // Schedule playback
                const currentTime = audioContextRef.current.currentTime;
                if (nextStartTimeRef.current < currentTime) {
                    nextStartTimeRef.current = currentTime;
                }
                
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;

              } catch (e) {
                console.error("Error decoding audio", e);
              }
            }
            
            if (message.serverContent?.interrupted) {
                console.log("Model interrupted");
                nextStartTimeRef.current = audioContextRef.current.currentTime;
                // Clear active sources on interrupt from server
                activeSourcesRef.current.forEach(src => {
                    try { src.stop(); } catch(e) {}
                });
                activeSourcesRef.current.clear();
            }
          },
          onclose: () => {
            console.log('Gemini Live Session Closed');
            setConnectionState(ConnectionState.DISCONNECTED);
          },
          onerror: (err: any) => {
            console.error('Gemini Live Error', err);
            setError("Connection Error: " + (err.message || "Unknown error"));
            setConnectionState(ConnectionState.ERROR);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: voicePreset.voiceName } }
          },
          systemInstruction: voicePreset.systemInstruction,
        }
      };

      // @ts-ignore
      sessionPromiseRef.current = ai.live.connect(config);
      
      sessionPromiseRef.current.then(session => {
        currentSessionRef.current = session;
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setConnectionState(ConnectionState.ERROR);
      cleanup();
    }
  };

  const disconnect = () => {
    cleanup();
  };

  const setTalking = (talking: boolean) => {
      setIsTalking(talking);
      
      // Half-Duplex Logic:
      // When we start talking, we must stop listening (cut off the radio)
      if (talking) {
          activeSourcesRef.current.forEach(source => {
              try { source.stop(); } catch(e) {}
          });
          activeSourcesRef.current.clear();
          
          if (audioContextRef.current) {
            // Reset the schedule cursor so when we finish talking, 
            // the response plays immediately instead of waiting for the "cancelled" audio duration.
            nextStartTimeRef.current = audioContextRef.current.currentTime;
          }
      }
  };

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    connectionState,
    error,
    connect,
    disconnect,
    setTalking,
    isTalking
  };
};