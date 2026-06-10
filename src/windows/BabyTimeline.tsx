import React, { useEffect, useState, useMemo } from 'react';
import {
  Row, Col, Card, Tag, Space, Button, Select, Empty, DatePicker,
  Divider, Drawer, Statistic, Progress, Dropdown, Badge, Avatar, Tooltip
} from 'antd';
import {
  LeftOutlined, RightOutlined, CalendarOutlined,
  FilterOutlined, ArrowLeftOutlined, PrinterOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { db } from '../db';
import { Baby, TimelineEventType, FeedingRecord } from '../types';
import { useAppStore } from '../store/appStore';
import {
  getTimelineEvents, formatDateTime, formatTime, formatDuration,
  formatWeight, formatTemperature, getBabyFeedingStats, calculateAgeDays,
  generateDailyStats
} from '../utils';

const { Option } = Select;
const { RangePicker } = DatePicker;

const EVENT_FILTERS: { key: TimelineEventType | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: '📋' },
  { key: 'feeding', label: '喂养', icon: '🍼' },
  { key: 'diaper', label: '尿布', icon: '🧷' },
  { key: 'sleep_start', label: '睡眠', icon: '😴' },
  { key: 'temperature', label: '体温', icon: '🌡️' },
  { key: 'weight', label: '体重', icon: '⚖️' },
  { key: 'food', label: '辅食', icon: '🥣' },
  { key: 'crying_start', label: '哭闹', icon: '😭' },
  { key: 'reminder', label: '提醒', icon: '🔔' }
];

const BabyTimeline: React.FC = () => {
  const {
    selectedBaby, setSelectedBaby, selectedDate, setSelectedDate,
    setActiveWindow, timelineFilter, setTimelineFilter
  } = useAppStore();

  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>('all');
  const [stats, setStats] = useState<any>(null);
  const [feedingStats, setFeedingStats] = useState<any>(null);

  const babies = useLiveQuery(
    () => db.babies.where('status').equals('active').toArray(),
    [], []
  ) as Baby[];

  useEffect(() => {
    if (selectedBaby?.id) {
      loadData();
    }
  }, [selectedBaby?.id, selectedDate]);

  const loadData = async () => {
    if (!selectedBaby?.id) return;
    setLoading(true);
    try {
      const [ev, st, fs] = await Promise.all([
        getTimelineEvents(selectedBaby.id!, selectedDate),
        generateDailyStats(selectedBaby.id!, selectedDate),
        getBabyFeedingStats(selectedBaby.id!, selectedDate)
      ]);
      setEvents(ev);
      setStats(st);
      setFeedingStats(fs);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvents = useMemo(() => {
    if (eventFilter === 'all') return events;
    return events.filter(e => {
      if (eventFilter === 'sleep_start') {
        return e.type === 'sleep_start' || e.type === 'sleep_end';
      }
      if (eventFilter === 'crying_start') {
        return e.type === 'crying_start';
      }
      return e.type === eventFilter;
    });
  }, [events, eventFilter]);

  const changeDate = (delta: number) => {
    const newDate = dayjs(selectedDate).add(delta, 'day').format('YYYY-MM-DD');
    setSelectedDate(newDate);
  };

  if (!selectedBaby) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40
      }}>
        <Empty
          description={
            <div style={{ fontSize: 16 }}>
              <div style={{ marginBottom: 12 }}>请先选择一位宝宝</div>
              <Space>
                <Button type="primary" size="large" onClick={() => setActiveWindow('bedBoard')}>
                  🏠 去床位看板选择
                </Button>
                <Button size="large" onClick={() => setActiveWindow('babyList')}>
                  👶 去宝宝列表
                </Button>
              </Space>
            </div>
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
        {babies.length > 0 && (
          <div style={{ marginTop: 40, width: '100%', maxWidth: 800 }}>
            <div style={{ fontSize: 14, color: '#666', marginBottom: 12, fontWeight: 600 }}>
              快速选择宝宝:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {babies.map(b => (
                <Card
                  key={b.id}
                  hoverable
                  onClick={() => setSelectedBaby(b)}
                  style={{ width: 180, cursor: 'pointer' }}
                  bodyStyle={{ padding: 12 }}
                >
                  <Space>
                    <Avatar
                      style={{
                        background: b.gender === 'male'
                          ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                          : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)'
                      }}
                      size={40}
                    >
                      {b.name.charAt(0)}
                    </Avatar>
                    <div>
                      <div style={{ fontWeight: 600 }}>{b.name}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>
                        {b.roomNumber}{b.bedNumber} · {calculateAgeDays(b.birthDate)}天
                      </div>
                    </div>
                  </Space>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: 20,
        borderBottom: '1px solid #f0f0f0',
        background: 'linear-gradient(135deg, #fff5f7 0%, #fff 100%)'
      }}>
        <Row gutter={[16, 12]} align="middle" justify="space-between">
          <Col>
            <Space size="large" align="center">
              <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => setSelectedBaby(null)}
              >
                返回
              </Button>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: selectedBaby.gender === 'male'
                  ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                  : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 24, fontWeight: 700,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}>
                {selectedBaby.name.charAt(0)}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 22 }}>
                  {selectedBaby.name}
                  <Tag color={selectedBaby.gender === 'male' ? 'blue' : 'pink'} style={{ marginLeft: 8 }}>
                    {selectedBaby.gender === 'male' ? '男' : '女'}
                  </Tag>
                </h2>
                <div style={{ color: '#666', marginTop: 4 }}>
                  🛏️ {selectedBaby.roomNumber}室{selectedBaby.bedNumber}床 ·
                  👩 妈妈: {selectedBaby.motherName} ·
                  🎂 {calculateAgeDays(selectedBaby.birthDate)}天 ·
                  ⚖️ 出生 {formatWeight(selectedBaby.birthWeight)}
                </div>
              </div>
            </Space>
          </Col>
          <Col>
            <Space>
              <Space.Compact>
                <Button icon={<LeftOutlined />} onClick={() => changeDate(-1)} />
                <Button
                  icon={<CalendarOutlined />}
                  style={{ width: 180, fontWeight: 600 }}
                >
                  {dayjs(selectedDate).format('YYYY-MM-DD dddd')}
                </Button>
                <Button icon={<RightOutlined />} onClick={() => changeDate(1)} disabled={dayjs(selectedDate).isSame(dayjs(), 'day')} />
              </Space.Compact>
              <Button
                type="primary"
                onClick={() => setActiveWindow('feedingEntry')}
                style={{ background: 'linear-gradient(135deg, #ff85a2, #ff5c7a)', border: 'none' }}
              >
                🍼 录入护理记录
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {stats && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
          <Row gutter={[12, 12]}>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="🍼 喂养次数"
                  value={stats.feedingCount}
                  suffix="次"
                  valueStyle={{ fontSize: 20 }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="🥛 总奶量"
                  value={stats.totalBottle}
                  suffix="ml"
                  valueStyle={{ fontSize: 20, color: '#1677ff' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="🤱 亲喂时长"
                  value={formatDuration(stats.totalBreastMin)}
                  valueStyle={{ fontSize: 18, color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="🧷 尿/便"
                  value={`${stats.wetCount} / ${stats.stoolCount}`}
                  valueStyle={{ fontSize: 18, color: '#722ed1' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="😴 睡眠"
                  value={formatDuration(stats.totalSleepMin)}
                  valueStyle={{ fontSize: 18, color: '#faad14' }}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} md={4}>
              <Card size="small" style={{ borderRadius: 8 }}>
                <Statistic
                  title="🌡️ 平均体温"
                  value={stats.avgTemp ? stats.avgTemp.toFixed(1) : '-'}
                  suffix={stats.avgTemp ? '°C' : ''}
                  valueStyle={{
                    fontSize: 20,
                    color: stats.avgTemp && stats.avgTemp > 37.4 ? '#ff4d4f' : '#52c41a'
                  }}
                />
              </Card>
            </Col>
          </Row>

          {feedingStats?.feedings?.length > 1 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                ⏱️ 喂养间隔分布 (平均: {formatDuration(feedingStats.avgInterval)})
              </div>
              <div style={{
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                flexWrap: 'wrap'
              }}>
                {feedingStats.feedings.slice(1).map((f: FeedingRecord, i: number) => {
                  const interval = dayjs(f.startTime).diff(
                    dayjs(feedingStats.feedings[i].startTime),
                    'minute'
                  );
                  const ratio = Math.min(100, (interval / 300) * 100);
                  const color = interval < 90 ? '#ff4d4f' : interval > 240 ? '#faad14' : '#52c41a';
                  return (
                    <Tooltip key={i} title={`${formatTime(feedingStats.feedings[i].startTime)} → ${formatTime(f.startTime)}: ${formatDuration(interval)}`}>
                      <div style={{
                        width: 48,
                        height: 24,
                        background: `${color}22`,
                        borderRadius: 4,
                        border: `1px solid ${color}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        color
                      }}>
                        {formatDuration(interval)}
                      </div>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <FilterOutlined style={{ color: '#666' }} />
        {EVENT_FILTERS.map(f => (
          <Tag.CheckableTag
            key={f.key}
            checked={eventFilter === f.key}
            onChange={checked => checked && setEventFilter(f.key)}
            style={{
              padding: '4px 12px',
              fontSize: 13,
              borderRadius: 16,
              background: eventFilter === f.key ? 'unset' : '#f5f5f5',
              border: eventFilter === f.key ? '1px solid #ff85a2' : '1px solid transparent'
            }}
          >
            {f.icon} {f.label}
          </Tag.CheckableTag>
        ))}

        <div style={{ flex: 1 }} />

        <div style={{ fontSize: 13, color: '#666' }}>
          共 <strong style={{ color: '#ff5c7a' }}>{filteredEvents.length}</strong> 条记录
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {filteredEvents.length === 0 ? (
          <Empty
            description="当日暂无护理记录"
            style={{ padding: 60 }}
          />
        ) : (
          <div style={{
            position: 'relative',
            maxWidth: 900,
            margin: '0 auto',
            paddingLeft: 40
          }}>
            <div style={{
              position: 'absolute',
              left: 15,
              top: 0,
              bottom: 0,
              width: 2,
              background: 'linear-gradient(180deg, #ffc0cb 0%, #ffe0e8 100%)',
              borderRadius: 2
            }} />

            {filteredEvents.map((event, idx) => (
              <div
                key={event.id}
                style={{
                  position: 'relative',
                  marginBottom: 20
                }}
              >
                <div style={{
                  position: 'absolute',
                  left: -33,
                  top: 16,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: event.color || '#ff85a2',
                  border: '3px solid #fff',
                  boxShadow: `0 0 0 2px ${event.color || '#ff85a2'}44`
                }} />

                <Card
                  size="small"
                  style={{
                    borderRadius: 12,
                    border: '1px solid #f0f0f0',
                    borderLeft: `4px solid ${event.color || '#ff85a2'}`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                  }}
                  bodyStyle={{ padding: '14px 16px' }}
                >
                  <Row justify="space-between" align="middle">
                    <Col>
                      <Space size="middle">
                        <span style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: event.color || '#222'
                        }}>
                          {event.title}
                        </span>
                        <Tag color="default" style={{ margin: 0 }}>
                          {formatDateTime(event.time, 'HH:mm')}
                        </Tag>
                      </Space>
                    </Col>
                    <Col>
                      <span style={{ fontSize: 11, color: '#aaa' }}>
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                    </Col>
                  </Row>
                  {event.description && (
                    <div style={{
                      marginTop: 8,
                      fontSize: 13,
                      color: '#555',
                      lineHeight: 1.6
                    }}>
                      {event.description}
                    </div>
                  )}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BabyTimeline;
