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

export interface PendingKnock {
  userId: string;
  userName: string;
  userColor: string;
}

type RoomStatus = 'idle' | 'waiting' | 'active' | 'completed';
type ActiveTab = 'whiteboard' | 'code';

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

  // Workspace tabs (Phase 3)
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // Problem display (Phase 3)
  problemText: string;
  setProblemText: (text: string) => void;

  // Code language sync (Phase 3)
  codeLanguage: string;
  setCodeLanguage: (language: string) => void;

  // Session topic (Phase 4)
  sessionTopic: string;
  setSessionTopic: (topic: string) => void;

  // Host admission queue (Phase 3)
  pendingKnocks: PendingKnock[];
  addPendingKnock: (knock: PendingKnock) => void;
  removePendingKnock: (userId: string) => void;
  clearPendingKnocks: () => void;

  // Host transfer (Phase 3)
  updateHost: (newHostId: string, newHostName: string) => void;

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
  activeTab: 'whiteboard' as ActiveTab,
  problemText: '',
  codeLanguage: 'markdown',
  sessionTopic: '',
  pendingKnocks: [] as PendingKnock[],
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

  // Phase 3 additions
  setActiveTab: (tab) => set({ activeTab: tab }),

  setProblemText: (text) => set({ problemText: text }),

  setCodeLanguage: (language) => set({ codeLanguage: language }),

  setSessionTopic: (topic) => set({ sessionTopic: topic }),

  addPendingKnock: (knock) =>
    set((state) => ({
      pendingKnocks: state.pendingKnocks.some((k) => k.userId === knock.userId)
        ? state.pendingKnocks
        : [...state.pendingKnocks, knock],
    })),

  removePendingKnock: (userId) =>
    set((state) => ({
      pendingKnocks: state.pendingKnocks.filter((k) => k.userId !== userId),
    })),

  clearPendingKnocks: () => set({ pendingKnocks: [] }),

  updateHost: (newHostId, newHostName) =>
    set((state) => ({
      hostName: newHostName,
      myParticipant: state.myParticipant
        ? {
            ...state.myParticipant,
            isHost: state.myParticipant.id === newHostId,
          }
        : null,
      participants: state.participants.map((p) => ({
        ...p,
        isHost: p.id === newHostId,
      })),
    })),

  reset: () => set(initialState),
}));
