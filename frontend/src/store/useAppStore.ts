import { create } from 'zustand';

export interface Participant {
  id: string;
  name: string;
  joinedAt: string;
  color: string;
  isHost: boolean;
}

export interface Message {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  text: string;
  timestamp: string;
  sequenceNumber: number;
  source: 'text' | 'voice';
}

export interface RoomSettings {
  timerDuration: number;
  maxParticipants: number;
}

type RoomStatus = 'idle' | 'waiting' | 'active' | 'completed';

interface AppState {
  // User
  userName: string;
  setUserName: (name: string) => void;

  // Room
  roomCode: string | null;
  roomStatus: RoomStatus;
  hostName: string;
  settings: RoomSettings;
  myParticipant: Participant | null;

  setRoom: (data: {
    roomCode: string;
    hostName: string;
    settings: RoomSettings;
    myParticipant: Participant;
  }) => void;
  setRoomStatus: (status: RoomStatus) => void;

  // Participants
  participants: Participant[];
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (userId: string) => void;

  // Messages
  messages: Message[];
  addMessage: (message: Message) => void;
  setMessages: (messages: Message[]) => void;

  // Timer
  timerRemaining: number;
  timerTotal: number;
  setTimer: (remaining: number, total: number) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  userName: '',
  roomCode: null,
  roomStatus: 'idle' as RoomStatus,
  hostName: '',
  settings: { timerDuration: 15, maxParticipants: 5 },
  myParticipant: null,
  participants: [],
  messages: [],
  timerRemaining: 0,
  timerTotal: 0,
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setUserName: (name) => set({ userName: name }),

  setRoom: (data) =>
    set({
      roomCode: data.roomCode,
      hostName: data.hostName,
      settings: data.settings,
      myParticipant: data.myParticipant,
      roomStatus: 'waiting',
    }),

  setRoomStatus: (status) => set({ roomStatus: status }),

  setParticipants: (participants) => set({ participants }),

  addParticipant: (participant) =>
    set((state) => ({
      participants: state.participants.some((p) => p.id === participant.id)
        ? state.participants
        : [...state.participants, participant],
    })),

  removeParticipant: (userId) =>
    set((state) => ({
      participants: state.participants.filter((p) => p.id !== userId),
    })),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  setMessages: (messages) => set({ messages }),

  setTimer: (remaining, total) =>
    set({ timerRemaining: remaining, timerTotal: total }),

  reset: () => set(initialState),
}));
