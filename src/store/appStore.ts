import { create } from 'zustand';
import { Baby, TimelineEvent, HandoverItem, TimelineEventType } from '../types';

type WindowKey =
  | 'babyList'
  | 'bedBoard'
  | 'babyTimeline'
  | 'feedingEntry'
  | 'careReminder'
  | 'shiftRecord'
  | 'reportPrint';

interface AppState {
  activeWindow: WindowKey;
  setActiveWindow: (window: WindowKey) => void;

  selectedBabyId: number | null;
  setSelectedBabyId: (id: number | null) => void;

  selectedBaby: Baby | null;
  setSelectedBaby: (baby: Baby | null) => void;

  filterRoom: string | null;
  setFilterRoom: (room: string | null) => void;

  currentNurse: string;
  setCurrentNurse: (name: string) => void;

  selectedDate: string;
  setSelectedDate: (date: string) => void;

  timelineFilter: TimelineEventType[] | null;
  setTimelineFilter: (types: TimelineEventType[] | null) => void;

  pendingHandoverItems: HandoverItem[];
  addHandoverItem: (item: HandoverItem) => void;
  removeHandoverItem: (id: string) => void;
  updateHandoverItem: (id: string, updates: Partial<HandoverItem>) => void;
  clearHandoverItems: () => void;

  notifications: { id: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }[];
  addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
  removeNotification: (id: string) => void;

  showTimelineBabySelector: boolean;
  setShowTimelineBabySelector: (show: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeWindow: 'bedBoard',
  setActiveWindow: (window) => set({ activeWindow: window }),

  selectedBabyId: null,
  setSelectedBabyId: (id) => set({ selectedBabyId: id }),

  selectedBaby: null,
  setSelectedBaby: (baby) => set({ selectedBaby: baby, selectedBabyId: baby?.id || null }),

  filterRoom: null,
  setFilterRoom: (room) => set({ filterRoom: room }),

  currentNurse: '值班护士',
  setCurrentNurse: (name) => set({ currentNurse: name }),

  selectedDate: new Date().toISOString().split('T')[0],
  setSelectedDate: (date) => set({ selectedDate: date }),

  timelineFilter: null,
  setTimelineFilter: (types) => set({ timelineFilter: types }),

  pendingHandoverItems: [],
  addHandoverItem: (item) =>
    set((state) => ({
      pendingHandoverItems: [...state.pendingHandoverItems, item]
    })),
  removeHandoverItem: (id) =>
    set((state) => ({
      pendingHandoverItems: state.pendingHandoverItems.filter((i) => i.id !== id)
    })),
  updateHandoverItem: (id, updates) =>
    set((state) => ({
      pendingHandoverItems: state.pendingHandoverItems.map((i) =>
        i.id === id ? { ...i, ...updates } : i
      )
    })),
  clearHandoverItems: () => set({ pendingHandoverItems: [] }),

  notifications: [],
  addNotification: (message, type = 'info') => {
    const id = Date.now().toString();
    set((state) => ({
      notifications: [...state.notifications, { id, message, type }]
    }));
    setTimeout(() => {
      set((state) => ({
        notifications: state.notifications.filter((n) => n.id !== id)
      }));
    }, 4000);
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id)
    })),

  showTimelineBabySelector: false,
  setShowTimelineBabySelector: (show) => set({ showTimelineBabySelector: show })
}));

export type { WindowKey };
