import React, { useEffect, useState, useMemo } from 'react';
import {
  Row, Col, Card, Tag, Statistic, Space, Button, Badge, Select, Tooltip,
  Dropdown, Empty, Divider
} from 'antd';
import {
  BellOutlined, PlusOutlined, ClockCircleOutlined, EditOutlined,
  ThunderboltOutlined, HistoryOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { db } from '../db';
import { Baby } from '../types';
import { useAppStore } from '../store/appStore';
import {
  calculateAgeDays, formatDateTime, getBabyFeedingStats,
  getFeedingTypeLabel, getRooms, formatDuration
} from '../utils';

const { Option } = Select;

interface FeedingStats {
  count: number;
  totalBottleAmount: number;
  totalBreastDuration: number;
  avgInterval: number;
  minutesSinceLast: number | null;
  lastFeeding: any | null;
}

const BedBoard: React.FC = () => {
  const {
    setActiveWindow, selectedBabyId, setSelectedBaby,
    filterRoom, setFilterRoom, selectedDate, addNotification
  } = useAppStore();

  const [statsMap, setStatsMap] = useState<Map<number, FeedingStats>>(new Map());
  const [now, setNow] = useState(new Date());

  const babies = useLiveQuery(
    () => db.babies.where('status').equals('active').sortBy('roomNumber'),
    [], []
  ) as Baby[];

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadAllStats();
  }, [babies, selectedDate, now]);

  const loadAllStats = async () => {
    const map = new Map<number, FeedingStats>();
    for (const b of babies) {
      if (b.id) {
        const stats = await getBabyFeedingStats(b.id, selectedDate);
        map.set(b.id, stats);
      }
    }
    setStatsMap(map);
  };

  const rooms = useMemo(() => getRooms(babies), [babies]);

  const groupedBabies = useMemo(() => {
    const groups: Record<string, Baby[]> = {};
    for (const b of babies) {
      if (filterRoom && filterRoom !== 'all' && b.roomNumber !== filterRoom) continue;
      if (!groups[b.roomNumber]) groups[b.roomNumber] = [];
      groups[b.roomNumber].push(b);
    }
    return groups;
  }, [babies, filterRoom]);

  const handleSelectBaby = (baby: Baby) => {
    setSelectedBaby(baby);
    addNotification(`已选择: ${baby.name} (${baby.roomNumber}${baby.bedNumber})`, 'success');
  };

  const handleQuickFeed = (baby: Baby, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedBaby(baby);
    setActiveWindow('feedingEntry');
  };

  const handleViewTimeline = (baby: Baby, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedBaby(baby);
    setActiveWindow('babyTimeline');
  };

  const handleReminder = (baby: Baby, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedBaby(baby);
    setActiveWindow('careReminder');
  };

  const getStatusInfo = (stats: FeedingStats | undefined, baby: Baby) => {
    if (!stats) return { level: 'normal', text: '暂无数据', color: '#d9d9d9' };

    const mins = stats.minutesSinceLast;
    if (mins === null) return { level: 'normal', text: '今日首次喂养', color: '#52c41a' };

    const interval = stats.avgInterval || 180;
    const overdue = mins - interval;

    if (overdue > 60) return { level: 'attention', text: `超期 ${formatDuration(overdue)}`, color: '#ff4d4f' };
    if (overdue > 0) return { level: 'warn', text: `超期 ${formatDuration(overdue)}`, color: '#faad14' };

    const nextIn = interval - mins;
    if (nextIn < 30) return { level: 'warn', text: `还有 ${formatDuration(nextIn)}`, color: '#faad14' };
    return { level: 'normal', text: `下次喂养 ${formatDuration(nextIn)}`, color: '#52c41a' };
  };

  const renderBedCard = (baby: Baby) => {
    const stats = statsMap.get(baby.id!);
    const statusInfo = getStatusInfo(stats, baby);
    const isSelected = baby.id === selectedBabyId;

    return (
      <Card
        key={baby.id}
        className={`bed-card ${isSelected ? 'selected' : ''}`}
        onClick={() => handleSelectBaby(baby)}
        bodyStyle={{ padding: 0 }}
      >
        <div className={`bed-room-header room-${baby.roomNumber}`}>
          <Space>
            <span>🏠 {baby.roomNumber}室</span>
            <Tag color={baby.roomNumber} style={{ margin: 0 }}>
              {baby.bedNumber}床
            </Tag>
          </Space>
          <Badge
            status={
              statusInfo.level === 'normal' ? 'success'
                : statusInfo.level === 'warn' ? 'warning'
                  : 'error'
            }
            text={<span style={{ fontSize: 12, fontWeight: 600 }}>{statusInfo.text}</span>}
          />
        </div>

        <div className="bed-body">
          <div className="baby-name-row">
            <div className={`baby-avatar-lg avatar-${baby.gender}`}>
              {baby.name.charAt(0)}
            </div>
            <div className="baby-info-block">
              <div className="baby-name-lg">
                {baby.name}
                <span style={{ fontSize: 12, color: '#999', marginLeft: 6, fontWeight: 500 }}>
                  {baby.gender === 'male' ? '♂' : '♀'}
                </span>
              </div>
              <div className="baby-sub-info">
                {calculateAgeDays(baby.birthDate)}天 · 妈妈: {baby.motherName}
              </div>
            </div>
          </div>

          {stats && stats.lastFeeding && (
            <div style={{
              background: '#fafafa',
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 12
            }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ClockCircleOutlined /> 最近一次喂养
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 2 }}>
                <Tag color="geekblue" style={{ margin: 0 }}>
                  {getFeedingTypeLabel(stats.lastFeeding.type)}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                <span>{formatDateTime(stats.lastFeeding.startTime, 'HH:mm')}</span>
                <span>
                  {stats.lastFeeding.amount
                    ? `${stats.lastFeeding.amount}ml`
                    : `${(stats.lastFeeding.leftDuration || 0) + (stats.lastFeeding.rightDuration || 0)}分钟`}
                </span>
              </div>
            </div>
          )}

          <div className="bed-stats-row">
            <div className="bed-stat-item">
              <div className="bed-stat-label">今日喂养</div>
              <div className="bed-stat-value">
                🍼 {stats?.count || 0}次
              </div>
            </div>
            <div className="bed-stat-item">
              <div className="bed-stat-label">总奶量</div>
              <div className="bed-stat-value">
                {stats?.totalBottleAmount
                  ? <span>🥛 {stats.totalBottleAmount}ml</span>
                  : stats?.totalBreastDuration
                    ? <span>🤱 {formatDuration(stats.totalBreastDuration)}</span>
                    : '-'}
              </div>
            </div>
            <div className="bed-stat-item">
              <div className="bed-stat-label">平均间隔</div>
              <div className="bed-stat-value">
                ⏱️ {stats?.avgInterval ? formatDuration(stats.avgInterval) : '-'}
              </div>
            </div>
            <div className="bed-stat-item">
              <div className="bed-stat-label">距上次</div>
              <div className="bed-stat-value" style={{
                color: statusInfo.color,
                fontWeight: 700
              }}>
                {stats?.minutesSinceLast !== null && stats?.minutesSinceLast !== undefined
                  ? formatDuration(stats.minutesSinceLast)
                  : '-'}
              </div>
            </div>
          </div>

          {baby.allergies && (
            <Tag color="error" style={{ marginTop: 12, width: '100%', textAlign: 'center' }}>
              ⚠️ {baby.allergies}
            </Tag>
          )}

          <Divider style={{ margin: '12px 0' }} />

          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Tooltip title="快速录入喂养">
              <Button
                type="primary"
                size="small"
                icon={<ThunderboltOutlined />}
                onClick={e => handleQuickFeed(baby, e)}
                style={{ background: 'linear-gradient(135deg, #ff85a2, #ff5c7a)', border: 'none' }}
              >
                录入
              </Button>
            </Tooltip>
            <Tooltip title="查看护理时间线">
              <Button
                size="small"
                icon={<HistoryOutlined />}
                onClick={e => handleViewTimeline(baby, e)}
              >
                时间线
              </Button>
            </Tooltip>
            <Tooltip title="设置喂养提醒">
              <Button
                size="small"
                icon={<BellOutlined />}
                onClick={e => handleReminder(baby, e)}
              >
                提醒
              </Button>
            </Tooltip>
          </Space>
        </div>
      </Card>
    );
  };

  const renderSummaryBar = () => {
    const totalBabies = babies.length;
    let needAttention = 0;
    let totalFeedings = 0;
    let totalAmount = 0;

    for (const b of babies) {
      const s = statsMap.get(b.id!);
      if (s) {
        totalFeedings += s.count;
        totalAmount += s.totalBottleAmount;
        const info = getStatusInfo(s, b);
        if (info.level === 'attention') needAttention++;
      }
    }

    return (
      <div style={{
        padding: '16px 20px',
        background: 'linear-gradient(135deg, #fff0f3 0%, #f0f5ff 100%)',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 16
      }}>
        <Space size="large" wrap>
          <Statistic
            title="在住宝宝"
            value={totalBabies}
            suffix="位"
            valueStyle={{ fontSize: 20, color: '#1677ff' }}
          />
          <Divider type="vertical" style={{ height: 40 }} />
          <Statistic
            title="今日总喂养次数"
            value={totalFeedings}
            suffix="次"
            valueStyle={{ fontSize: 20, color: '#722ed1' }}
          />
          <Divider type="vertical" style={{ height: 40 }} />
          <Statistic
            title="今日总奶量(配方/瓶喂)"
            value={totalAmount}
            suffix="ml"
            valueStyle={{ fontSize: 20, color: '#52c41a' }}
          />
          {needAttention > 0 && (
            <>
              <Divider type="vertical" style={{ height: 40 }} />
              <Badge count={needAttention} size="large" offset={[0, -5]}>
                <Statistic
                  title="需关注(超期喂养)"
                  value={needAttention}
                  suffix="位"
                  valueStyle={{ fontSize: 20, color: '#ff4d4f' }}
                />
              </Badge>
            </>
          )}
        </Space>

        <Space>
          <Select
            placeholder="筛选房间"
            value={filterRoom || 'all'}
            onChange={v => setFilterRoom(v === 'all' ? null : v)}
            style={{ width: 140 }}
            allowClear
          >
            <Option value="all">全部房间</Option>
            {rooms.map(r => <Option key={r} value={r}>{r}室</Option>)}
          </Select>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setActiveWindow('babyList')}
          >
            新增宝宝
          </Button>
        </Space>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderSummaryBar()}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {Object.keys(groupedBabies).length === 0 ? (
          <Empty
            description="暂无在住宝宝信息"
            style={{ padding: 80 }}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setActiveWindow('babyList')}>
              立即添加
            </Button>
          </Empty>
        ) : (
          Object.entries(groupedBabies).map(([room, roomBabies]) => (
            <div key={room} style={{ padding: 16 }}>
              <div style={{
                fontSize: 16,
                fontWeight: 700,
                color: '#222',
                marginBottom: 12,
                paddingLeft: 8,
                borderLeft: `4px solid #ff85a2`,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                🏠 {room}室
                <Tag color="default">{roomBabies.length} 位宝宝</Tag>
              </div>
              <Row gutter={[16, 16]}>
                {roomBabies.map(baby => (
                  <Col xs={24} sm={12} md={8} lg={6} xl={6} key={baby.id}>
                    {renderBedCard(baby)}
                  </Col>
                ))}
              </Row>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default BedBoard;
