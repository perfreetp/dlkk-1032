import dayjs from 'dayjs';
import { db } from '../db';
import { Baby, FeedingRecord, TimelineEvent, TimelineEventType, Reminder } from '../types';

export function formatDateTime(iso: string, format = 'YYYY-MM-DD HH:mm'): string {
  return dayjs(iso).format(format);
}

export function formatDate(iso: string, format = 'YYYY-MM-DD'): string {
  return dayjs(iso).format(format);
}

export function formatTime(iso: string, format = 'HH:mm'): string {
  return dayjs(iso).format(format);
}

export function formatDuration(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return '-';
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0) {
    return `${hours}小时${mins}分`;
  }
  return `${mins}分钟`;
}

export function formatWeight(kg: number | undefined): string {
  if (!kg) return '-';
  return `${kg.toFixed(2)} kg`;
}

export function formatTemperature(temp: number | undefined): string {
  if (!temp) return '-';
  return `${temp.toFixed(1)} °C`;
}

export function calculateAgeDays(birthDate: string): number {
  return dayjs().diff(dayjs(birthDate), 'day');
}

export function calculateAgeString(birthDate: string): string {
  const days = calculateAgeDays(birthDate);
  if (days < 30) return `${days}天`;
  const months = Math.floor(days / 30);
  const remainDays = days % 30;
  return `${months}月${remainDays > 0 ? remainDays + '天' : ''}`;
}

export function getFeedingTypeLabel(type: string): string {
  const map: Record<string, string> = {
    breast: '亲喂母乳',
    bottle_breast: '瓶喂母乳',
    formula: '配方奶',
    mixed: '混合喂养'
  };
  return map[type] || type;
}

export function getFeedingTypeColor(type: string): string {
  const map: Record<string, string> = {
    breast: '#52c41a',
    bottle_breast: '#1890ff',
    formula: '#fa8c16',
    mixed: '#722ed1'
  };
  return map[type] || '#666';
}

export async function getTimelineEvents(babyId: number, date: string): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  const startOfDay = dayjs(date).startOf('day').toISOString();
  const endOfDay = dayjs(date).endOf('day').toISOString();

  const feedings = await db.feedingRecords
    .where('babyId')
    .equals(babyId)
    .filter((r) => r.startTime >= startOfDay && r.startTime <= endOfDay)
    .reverse()
    .sortBy('startTime');

  for (const f of feedings) {
    let desc = `${getFeedingTypeLabel(f.type)}`;
    if (f.amount) desc += ` · ${f.amount}ml`;
    if (f.leftDuration || f.rightDuration) {
      const dur = (f.leftDuration || 0) + (f.rightDuration || 0);
      desc += ` · ${dur}分钟`;
    }
    if (f.spitUp) desc += ` · 有吐奶`;
    events.push({
      id: `feed_${f.id}`,
      babyId,
      type: 'feeding',
      time: f.startTime,
      title: '🍼 喂养记录',
      description: desc,
      recordId: f.id,
      tableName: 'feedingRecords',
      color: getFeedingTypeColor(f.type)
    });
  }

  const diapers = await db.diaperRecords
    .where('babyId')
    .equals(babyId)
    .filter((r) => r.time >= startOfDay && r.time <= endOfDay)
    .reverse()
    .sortBy('time');

  for (const d of diapers) {
    const typeMap: Record<string, string> = { wet: '💧 排尿', stool: '💩 排便', both: '💧💩 尿便' };
    events.push({
      id: `diaper_${d.id}`,
      babyId,
      type: 'diaper',
      time: d.time,
      title: typeMap[d.type] || '尿布更换',
      description: d.stoolColor ? `便色: ${d.stoolColor}` : undefined,
      recordId: d.id,
      tableName: 'diaperRecords',
      color: d.type === 'wet' ? '#1677ff' : '#d46b08'
    });
  }

  const sleeps = await db.sleepRecords
    .where('babyId')
    .equals(babyId)
    .filter((r) => (r.startTime >= startOfDay && r.startTime <= endOfDay) || (r.endTime && r.endTime >= startOfDay && r.endTime <= endOfDay))
    .reverse()
    .sortBy('startTime');

  for (const s of sleeps) {
    events.push({
      id: `sleep_start_${s.id}`,
      babyId,
      type: 'sleep_start',
      time: s.startTime,
      title: '😴 入睡',
      description: s.quality ? `质量: ${s.quality === 'good' ? '好' : s.quality === 'fair' ? '一般' : '差'}` : undefined,
      recordId: s.id,
      tableName: 'sleepRecords',
      color: '#9254de'
    });
    if (s.endTime) {
      const dur = dayjs(s.endTime).diff(dayjs(s.startTime), 'minute');
      events.push({
        id: `sleep_end_${s.id}`,
        babyId,
        type: 'sleep_end',
        time: s.endTime,
        title: '⏰ 睡醒',
        description: `睡眠时长: ${formatDuration(dur)}`,
        recordId: s.id,
        tableName: 'sleepRecords',
        color: '#9254de'
      });
    }
  }

  const temps = await db.temperatureRecords
    .where('babyId')
    .equals(babyId)
    .filter((r) => r.time >= startOfDay && r.time <= endOfDay)
    .reverse()
    .sortBy('time');

  for (const t of temps) {
    const status = t.temperature > 37.4 ? '⚠️ 发热' : t.temperature < 36 ? '⚠️ 偏低' : '✓ 正常';
    events.push({
      id: `temp_${t.id}`,
      babyId,
      type: 'temperature',
      time: t.time,
      title: `🌡️ 体温 ${formatTemperature(t.temperature)}`,
      description: status,
      recordId: t.id,
      tableName: 'temperatureRecords',
      color: t.temperature > 37.4 ? '#ff4d4f' : '#52c41a'
    });
  }

  const weights = await db.weightRecords
    .where('babyId')
    .equals(babyId)
    .filter((r) => r.time >= startOfDay && r.time <= endOfDay)
    .reverse()
    .sortBy('time');

  for (const w of weights) {
    events.push({
      id: `weight_${w.id}`,
      babyId,
      type: 'weight',
      time: w.time,
      title: `⚖️ 体重 ${formatWeight(w.weight)}`,
      description: w.clothing,
      recordId: w.id,
      tableName: 'weightRecords',
      color: '#13c2c2'
    });
  }

  const foods = await db.foodRecords
    .where('babyId')
    .equals(babyId)
    .filter((r) => r.time >= startOfDay && r.time <= endOfDay)
    .reverse()
    .sortBy('time');

  for (const f of foods) {
    const reactionMap: Record<string, string> = {
      none: '无反应',
      like: '喜欢',
      dislike: '不喜欢',
      allergy: '⚠️过敏'
    };
    events.push({
      id: `food_${f.id}`,
      babyId,
      type: 'food',
      time: f.time,
      title: `🥣 辅食 ${f.foodName}`,
      description: `${f.amount}${f.unit} · ${reactionMap[f.reaction]}`,
      recordId: f.id,
      tableName: 'foodRecords',
      color: f.reaction === 'allergy' ? '#ff4d4f' : '#faad14'
    });
  }

  const cryings = await db.cryingRecords
    .where('babyId')
    .equals(babyId)
    .filter((r) => r.startTime >= startOfDay && r.startTime <= endOfDay)
    .reverse()
    .sortBy('startTime');

  for (const c of cryings) {
    const sevMap: Record<string, string> = { mild: '轻度', moderate: '中度', severe: '重度' };
    events.push({
      id: `crying_${c.id}`,
      babyId,
      type: 'crying_start',
      time: c.startTime,
      title: `😭 哭闹 (${sevMap[c.severity]})`,
      description: c.possibleCause || c.soothingMethod,
      recordId: c.id,
      tableName: 'cryingRecords',
      color: '#ff4d4f'
    });
  }

  const reminders = await db.reminders
    .where('babyId')
    .equals(babyId)
    .filter((r) => r.scheduledTime >= startOfDay && r.scheduledTime <= endOfDay)
    .reverse()
    .sortBy('scheduledTime');

  for (const r of reminders) {
    const statusMap: Record<string, string> = {
      pending: '⏳ 待完成',
      completed: '✓ 已完成',
      missed: '❌ 已错过',
      cancelled: '已取消'
    };
    events.push({
      id: `reminder_${r.id}`,
      babyId,
      type: 'reminder',
      time: r.scheduledTime,
      title: `🔔 ${r.title}`,
      description: statusMap[r.status],
      recordId: r.id,
      tableName: 'reminders',
      color: r.status === 'completed' ? '#52c41a' : r.status === 'missed' ? '#ff4d4f' : '#faad14'
    });
  }

  events.sort((a, b) => dayjs(b.time).valueOf() - dayjs(a.time).valueOf());
  return events;
}

export async function getBabyFeedingStats(babyId: number, date: string) {
  const startOfDay = dayjs(date).startOf('day').toISOString();
  const endOfDay = dayjs(date).endOf('day').toISOString();

  const feedings = await db.feedingRecords
    .where('babyId')
    .equals(babyId)
    .filter((r) => r.startTime >= startOfDay && r.startTime <= endOfDay)
    .sortBy('startTime');

  let totalBottleAmount = 0;
  let totalBreastDuration = 0;
  let count = feedings.length;
  let intervals: number[] = [];
  let lastTime: dayjs.Dayjs | null = null;

  for (const f of feedings) {
    if (f.amount) totalBottleAmount += f.amount;
    if (f.leftDuration) totalBreastDuration += f.leftDuration;
    if (f.rightDuration) totalBreastDuration += f.rightDuration;

    const curr = dayjs(f.startTime);
    if (lastTime) {
      intervals.push(curr.diff(lastTime, 'minute'));
    }
    lastTime = curr;
  }

  const avgInterval = intervals.length > 0
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : 0;

  const lastFeeding = feedings.length > 0 ? feedings[feedings.length - 1] : null;
  const minutesSinceLast = lastFeeding
    ? dayjs().diff(dayjs(lastFeeding.startTime), 'minute')
    : null;

  return {
    count,
    totalBottleAmount,
    totalBreastDuration,
    avgInterval,
    lastFeeding,
    minutesSinceLast,
    feedings
  };
}

export async function findBabyByRoomBed(roomNumber: string, bedNumber: string): Promise<Baby | undefined> {
  return db.babies
    .filter((b) => b.roomNumber === roomNumber && b.bedNumber === bedNumber && b.status === 'active')
    .first();
}

export function getRooms(babies: Baby[]): string[] {
  const rooms = new Set(babies.map((b) => b.roomNumber));
  return Array.from(rooms).sort();
}

export function getReminderTypeLabel(type: string): string {
  const map: Record<string, string> = {
    feeding: '喂养',
    diaper: '换尿布',
    medication: '用药',
    temperature: '测体温',
    custom: '自定义'
  };
  return map[type] || type;
}

export function getReminderTypeIcon(type: string): string {
  const map: Record<string, string> = {
    feeding: '🍼',
    diaper: '🧷',
    medication: '💊',
    temperature: '🌡️',
    custom: '📝'
  };
  return map[type] || '📝';
}

export async function getPendingReminders(): Promise<Reminder[]> {
  const now = new Date().toISOString();
  const next24h = dayjs().add(24, 'hour').toISOString();
  return db.reminders
    .filter((r) => r.status === 'pending' && r.scheduledTime >= now && r.scheduledTime <= next24h)
    .sortBy('scheduledTime');
}

export async function generateDailyStats(babyId: number, date: string) {
  const startOfDay = dayjs(date).startOf('day').toISOString();
  const endOfDay = dayjs(date).endOf('day').toISOString();

  const [feedings, diapers, sleeps, temps, weights, foods, cryings] = await Promise.all([
    db.feedingRecords.where('babyId').equals(babyId).filter((r) => r.startTime >= startOfDay && r.startTime <= endOfDay).sortBy('startTime'),
    db.diaperRecords.where('babyId').equals(babyId).filter((r) => r.time >= startOfDay && r.time <= endOfDay).toArray(),
    db.sleepRecords.where('babyId').equals(babyId).filter((r) => r.startTime >= startOfDay && r.startTime <= endOfDay).toArray(),
    db.temperatureRecords.where('babyId').equals(babyId).filter((r) => r.time >= startOfDay && r.time <= endOfDay).toArray(),
    db.weightRecords.where('babyId').equals(babyId).filter((r) => r.time >= startOfDay && r.time <= endOfDay).toArray(),
    db.foodRecords.where('babyId').equals(babyId).filter((r) => r.time >= startOfDay && r.time <= endOfDay).toArray(),
    db.cryingRecords.where('babyId').equals(babyId).filter((r) => r.startTime >= startOfDay && r.startTime <= endOfDay).toArray()
  ]);

  let totalBottle = 0;
  let totalBreastMin = 0;
  for (const f of feedings) {
    if (f.amount) totalBottle += f.amount;
    if (f.leftDuration) totalBreastMin += f.leftDuration;
    if (f.rightDuration) totalBreastMin += f.rightDuration;
  }

  let wetCount = 0, stoolCount = 0;
  for (const d of diapers) {
    if (d.type === 'wet' || d.type === 'both') wetCount++;
    if (d.type === 'stool' || d.type === 'both') stoolCount++;
  }

  let totalSleepMin = 0;
  for (const s of sleeps) {
    if (s.endTime) {
      totalSleepMin += dayjs(s.endTime).diff(dayjs(s.startTime), 'minute');
    }
  }

  let totalCryingMin = 0;
  for (const c of cryings) {
    if (c.endTime) {
      totalCryingMin += dayjs(c.endTime).diff(dayjs(c.startTime), 'minute');
    }
  }

  const avgTemp = temps.length > 0
    ? temps.reduce((a, b) => a + b.temperature, 0) / temps.length
    : null;

  const lastWeight = weights.length > 0 ? weights[weights.length - 1] : null;

  return {
    feedings,
    diapers,
    sleeps,
    temps,
    weights,
    foods,
    cryings,
    totalBottle,
    totalBreastMin,
    wetCount,
    stoolCount,
    totalSleepMin,
    totalCryingMin,
    avgTemp,
    lastWeight,
    feedingCount: feedings.length
  };
}
