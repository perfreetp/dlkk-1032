import Dexie, { Table } from 'dexie';
import {
  Baby,
  FeedingRecord,
  DiaperRecord,
  SleepRecord,
  TemperatureRecord,
  WeightRecord,
  FoodRecord,
  CryingRecord,
  Reminder,
  ShiftRecord
} from '../types';

export class BabyCareDB extends Dexie {
  babies!: Table<Baby, number>;
  feedingRecords!: Table<FeedingRecord, number>;
  diaperRecords!: Table<DiaperRecord, number>;
  sleepRecords!: Table<SleepRecord, number>;
  temperatureRecords!: Table<TemperatureRecord, number>;
  weightRecords!: Table<WeightRecord, number>;
  foodRecords!: Table<FoodRecord, number>;
  cryingRecords!: Table<CryingRecord, number>;
  reminders!: Table<Reminder, number>;
  shiftRecords!: Table<ShiftRecord, number>;

  constructor() {
    super('BabyCareDB');
    this.version(1).stores({
      babies: '++id, name, roomNumber, bedNumber, status, admissionDate',
      feedingRecords: '++id, babyId, startTime, type, caregiver',
      diaperRecords: '++id, babyId, time, type, caregiver',
      sleepRecords: '++id, babyId, startTime, endTime, caregiver',
      temperatureRecords: '++id, babyId, time, temperature, caregiver',
      weightRecords: '++id, babyId, time, weight, caregiver',
      foodRecords: '++id, babyId, time, foodName, caregiver',
      cryingRecords: '++id, babyId, startTime, endTime, caregiver',
      reminders: '++id, babyId, type, scheduledTime, status',
      shiftRecords: '++id, shiftDate, shiftType, completed'
    });
  }
}

export const db = new BabyCareDB();

export async function seedDatabase() {
  const babyCount = await db.babies.count();
  if (babyCount > 0) return;

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const babies: Omit<Baby, 'id'>[] = [
    {
      name: '张小宝',
      gender: 'male',
      birthDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      birthWeight: 3.45,
      motherName: '李妈妈',
      roomNumber: '201',
      bedNumber: 'A',
      admissionDate: today,
      status: 'active',
      allergies: '无',
      notes: '足月顺产，健康状况良好',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    {
      name: '王妞妞',
      gender: 'female',
      birthDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      birthWeight: 3.2,
      motherName: '张妈妈',
      roomNumber: '201',
      bedNumber: 'B',
      admissionDate: today,
      status: 'active',
      allergies: '牛奶蛋白过敏(轻度)',
      notes: '配方奶需使用深度水解蛋白配方',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    {
      name: '刘豆豆',
      gender: 'male',
      birthDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      birthWeight: 2.8,
      motherName: '陈妈妈',
      roomNumber: '202',
      bedNumber: 'A',
      admissionDate: today,
      status: 'active',
      allergies: '无',
      notes: '早产儿(36周)，需密切观察体温和喂养',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    {
      name: '陈乐乐',
      gender: 'female',
      birthDate: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      birthWeight: 3.6,
      motherName: '刘妈妈',
      roomNumber: '202',
      bedNumber: 'B',
      admissionDate: today,
      status: 'active',
      allergies: '无',
      notes: '食欲好，排便正常',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    {
      name: '赵安安',
      gender: 'male',
      birthDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      birthWeight: 3.8,
      motherName: '王妈妈',
      roomNumber: '203',
      bedNumber: 'A',
      admissionDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'active',
      allergies: '无',
      notes: '即将出院，需做好出院指导',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    },
    {
      name: '孙甜甜',
      gender: 'female',
      birthDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      birthWeight: 3.1,
      motherName: '赵妈妈',
      roomNumber: '203',
      bedNumber: 'B',
      admissionDate: today,
      status: 'active',
      notes: '新生儿，按需哺乳，注意黄疸观察',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }
  ];

  const babyIds = await db.babies.bulkAdd(babies) as number[];

  const caregivers = ['护士小王', '护士小李', '护士小张', '护士小刘'];
  const getRandomCaregiver = () => caregivers[Math.floor(Math.random() * caregivers.length)];

  for (let i = 0; i < babyIds.length; i++) {
    const babyId = babyIds[i];
    for (let h = 6; h <= 22; h += 3) {
      const feedTime = new Date(now);
      feedTime.setHours(h, Math.floor(Math.random() * 30), 0, 0);
      if (feedTime > now) continue;

      const types: ('breast' | 'bottle_breast' | 'formula' | 'mixed')[] = ['breast', 'bottle_breast', 'formula', 'mixed'];
      const type = types[Math.floor(Math.random() * types.length)];
      const isBreast = type === 'breast' || type === 'mixed';
      const isBottle = type === 'bottle_breast' || type === 'formula' || type === 'mixed';

      await db.feedingRecords.add({
        babyId,
        type,
        startTime: feedTime.toISOString(),
        endTime: new Date(feedTime.getTime() + (15 + Math.floor(Math.random() * 20)) * 60 * 1000).toISOString(),
        side: isBreast ? (['left', 'right', 'both'] as const)[Math.floor(Math.random() * 3)] : undefined,
        leftDuration: isBreast ? 5 + Math.floor(Math.random() * 15) : undefined,
        rightDuration: isBreast && Math.random() > 0.3 ? 5 + Math.floor(Math.random() * 15) : undefined,
        amount: isBottle ? 40 + Math.floor(Math.random() * 60) : undefined,
        formulaBrand: type === 'formula' ? '爱他美' : undefined,
        waterTemp: isBottle ? 40 + Math.floor(Math.random() * 5) : undefined,
        burped: Math.random() > 0.1,
        burpDuration: Math.random() > 0.1 ? 3 + Math.floor(Math.random() * 8) : undefined,
        spitUp: Math.random() > 0.7,
        spitUpAmount: Math.random() > 0.7 ? (['small', 'medium'] as const)[Math.floor(Math.random() * 2)] : 'none',
        spitUpNotes: Math.random() > 0.85 ? '少量溢奶，拍嗝后缓解' : undefined,
        caregiver: getRandomCaregiver(),
        notes: Math.random() > 0.7 ? '吃奶情况良好' : undefined,
        createdAt: new Date().toISOString()
      });
    }

    for (let d = 0; d < 4; d++) {
      const diaperTime = new Date(now);
      diaperTime.setHours(6 + d * 4 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);
      if (diaperTime > now) continue;

      await db.diaperRecords.add({
        babyId,
        time: diaperTime.toISOString(),
        type: (['wet', 'stool', 'both'] as const)[Math.floor(Math.random() * 3)],
        stoolColor: Math.random() > 0.3 ? '金黄色' : undefined,
        stoolConsistency: 'normal',
        amount: (['small', 'medium', 'large'] as const)[Math.floor(Math.random() * 3)],
        caregiver: getRandomCaregiver(),
        createdAt: new Date().toISOString()
      });
    }

    const sleepStart = new Date(now);
    sleepStart.setHours(13, 0, 0, 0);
    if (sleepStart <= now) {
      await db.sleepRecords.add({
        babyId,
        startTime: sleepStart.toISOString(),
        endTime: new Date(sleepStart.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        quality: (['good', 'fair', 'poor'] as const)[Math.floor(Math.random() * 3)],
        interrupted: Math.random() > 0.6,
        interruptReasons: Math.random() > 0.6 ? '需要更换尿布' : undefined,
        caregiver: getRandomCaregiver(),
        createdAt: new Date().toISOString()
      });
    }

    const tempTime = new Date(now);
    tempTime.setHours(8, 30, 0, 0);
    await db.temperatureRecords.add({
      babyId,
      time: tempTime.toISOString(),
      temperature: 36.5 + Math.random() * 0.6,
      location: 'axillary',
      caregiver: getRandomCaregiver(),
      createdAt: new Date().toISOString()
    });

    const weightTime = new Date(now);
    weightTime.setHours(7, 0, 0, 0);
    await db.weightRecords.add({
      babyId,
      time: weightTime.toISOString(),
      weight: babies[i].birthWeight + (Math.random() - 0.3) * 0.1,
      diaperRemoved: true,
      clothing: '单层内衣',
      caregiver: getRandomCaregiver(),
      notes: '每日晨起空腹称重',
      createdAt: new Date().toISOString()
    });

    const nextFeedHour = (now.getHours() + 3);
    const reminderTime = new Date(now);
    reminderTime.setHours(nextFeedHour % 24, 0, 0, 0);

    await db.reminders.add({
      babyId,
      type: 'feeding',
      title: '下次喂养提醒',
      scheduledTime: reminderTime.toISOString(),
      status: 'pending',
      repeat: 'none',
      assignedTo: getRandomCaregiver(),
      notes: '预计奶量60ml',
      createdAt: new Date().toISOString()
    });
  }
}
