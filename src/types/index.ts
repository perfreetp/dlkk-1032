export type BabyGender = 'male' | 'female';
export type BabyStatus = 'active' | 'discharged' | 'suspended';

export interface Baby {
  id?: number;
  name: string;
  gender: BabyGender;
  birthDate: string;
  birthWeight: number;
  motherName: string;
  roomNumber: string;
  bedNumber: string;
  admissionDate: string;
  status: BabyStatus;
  allergies?: string;
  notes?: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export type FeedingType = 'breast' | 'bottle_breast' | 'formula' | 'mixed';
export type FeedingSide = 'left' | 'right' | 'both';

export interface FeedingRecord {
  id?: number;
  babyId: number;
  type: FeedingType;
  startTime: string;
  endTime?: string;
  side?: FeedingSide;
  leftDuration?: number;
  rightDuration?: number;
  amount?: number;
  formulaBrand?: string;
  waterTemp?: number;
  burped: boolean;
  burpDuration?: number;
  spitUp: boolean;
  spitUpAmount?: 'none' | 'small' | 'medium' | 'large';
  spitUpNotes?: string;
  caregiver: string;
  notes?: string;
  photos?: string[];
  createdAt: string;
}

export type DiaperType = 'wet' | 'stool' | 'both';
export type StoolConsistency = 'normal' | 'loose' | 'hard' | 'watery';

export interface DiaperRecord {
  id?: number;
  babyId: number;
  time: string;
  type: DiaperType;
  stoolColor?: string;
  stoolConsistency?: StoolConsistency;
  amount?: 'small' | 'medium' | 'large';
  caregiver: string;
  notes?: string;
  createdAt: string;
}

export interface SleepRecord {
  id?: number;
  babyId: number;
  startTime: string;
  endTime?: string;
  quality?: 'good' | 'fair' | 'poor';
  interrupted: boolean;
  interruptReasons?: string;
  caregiver: string;
  notes?: string;
  createdAt: string;
}

export interface TemperatureRecord {
  id?: number;
  babyId: number;
  time: string;
  temperature: number;
  location: 'axillary' | 'oral' | 'rectal' | 'forehead';
  caregiver: string;
  notes?: string;
  createdAt: string;
}

export interface WeightRecord {
  id?: number;
  babyId: number;
  time: string;
  weight: number;
  diaperRemoved: boolean;
  clothing?: string;
  caregiver: string;
  notes?: string;
  createdAt: string;
}

export interface FoodRecord {
  id?: number;
  babyId: number;
  time: string;
  foodName: string;
  amount: number;
  unit: string;
  reaction: 'none' | 'like' | 'dislike' | 'allergy';
  reactionNotes?: string;
  caregiver: string;
  notes?: string;
  photos?: string[];
  createdAt: string;
}

export type CryingSeverity = 'mild' | 'moderate' | 'severe';

export interface CryingRecord {
  id?: number;
  babyId: number;
  startTime: string;
  endTime?: string;
  severity: CryingSeverity;
  possibleCause?: string;
  soothingMethod?: string;
  soothed: boolean;
  caregiver: string;
  notes?: string;
  createdAt: string;
}

export type ReminderType = 'feeding' | 'diaper' | 'medication' | 'temperature' | 'custom';
export type ReminderStatus = 'pending' | 'completed' | 'missed' | 'cancelled';

export interface Reminder {
  id?: number;
  babyId: number;
  type: ReminderType;
  title: string;
  scheduledTime: string;
  status: ReminderStatus;
  repeat: 'none' | 'hourly' | 'daily';
  intervalMinutes?: number;
  completedAt?: string;
  assignedTo?: string;
  notes?: string;
  handoverId?: number;
  handoverItemId?: string;
  createdAt: string;
}

export type ShiftType = 'morning' | 'afternoon' | 'night';
export type HandoverItemStatus = 'pending' | 'in_progress' | 'completed' | 'attention';

export interface HandoverItem {
  id: string;
  babyId: number;
  description: string;
  status: HandoverItemStatus;
  priority: 'low' | 'medium' | 'high';
  toReminder?: boolean;
}

export interface ShiftRecord {
  id?: number;
  shiftType: ShiftType;
  shiftDate: string;
  startTime: string;
  endTime?: string;
  oncomingNurse: string;
  outgoingNurse: string;
  handoverItems: HandoverItem[];
  notes?: string;
  completed: boolean;
  createdAt: string;
}

export type TimelineEventType =
  | 'feeding'
  | 'diaper'
  | 'sleep_start'
  | 'sleep_end'
  | 'temperature'
  | 'weight'
  | 'food'
  | 'crying_start'
  | 'crying_end'
  | 'reminder'
  | 'note';

export interface TimelineEvent {
  id: string;
  babyId: number;
  type: TimelineEventType;
  time: string;
  title: string;
  description?: string;
  recordId?: number;
  tableName?: string;
  icon?: string;
  color?: string;
}
