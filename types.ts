export enum ConnectionState {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR',
}

export enum AudioMode {
  PUSH_TO_TALK = 'PUSH_TO_TALK',
  OPEN_MIC = 'OPEN_MIC',
}

export interface VoicePreset {
  id: string;
  name: string;
  voiceName: string;
  systemInstruction: string;
  color: string;
}

export interface AudioVisualizerData {
  inputLevel: number;
  outputLevel: number;
}