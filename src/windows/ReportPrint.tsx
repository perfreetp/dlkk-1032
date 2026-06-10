import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Row, Col, Table, Button, Tag, Space, Select, DatePicker,
  Empty, Statistic, Avatar, Divider, Tabs, List, Tooltip, Checkbox,
  message, App, Progress, Radio, Modal, Dropdown, Badge, Segmented,
  Timeline
} from 'antd';
import {
  PrinterOutlined, DownloadOutlined, FileTextOutlined,
  FilterOutlined, CalendarOutlined, UserOutlined,
  CheckCircleOutlined, ExportOutlined, EyeOutlined,
  WarningOutlined, BellOutlined, ClockCircleOutlined,
  CloseCircleOutlined, TeamOutlined, HomeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useLiveQuery, triggerRefresh } from '../hooks/useLiveQuery';
import { db } from '../db';
import { Baby, ShiftRecord, Reminder } from '../types';
import { useAppStore } from '../store/appStore';
import {
  calculateAgeDays, formatDateTime, formatDuration,
  formatWeight, formatTemperature, generateDailyStats,
  getBabyFeedingStats, formatTime, getFeedingTypeLabel
} from '../utils';

const { Option } = Select;
const { RangePicker } = DatePicker;

const ReportPrint: React.FC = () => {
  const { currentNurse, addNotification } = useAppStore();
  const { modal } = App.useApp();

  const [reportDate, setReportDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [filterRoom, setFilterRoom] = useState<string>('all');
  const [filterBaby, setFilterBaby] = useState<number | 'all'>('all');
  const [reportType, setReportType] = useState<'daily' | 'summary' | 'shift'>('daily');
  const [shiftFilter, setShiftFilter] = useState<'all' | 'morning' | 'afternoon' | 'night'>('all');
  const [selectedBabies, setSelectedBabies] = useState<number[]>([]);
  const [generating, setGenerating] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  const babies = useLiveQuery(
    () => db.babies.where('status').equals('active').sortBy('roomNumber'),
    [], []
  ) as Baby[];

  const shiftRecords = useLiveQuery(
    async () => {
      const arr = await db.shiftRecords.toArray();
      arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return arr;
    },
    [], []
  ) as ShiftRecord[];

  const allReminders = useLiveQuery(
    () => db.reminders.orderBy('createdAt').reverse().limit(500).toArray(),
    [], []
  ) as Reminder[];

  const SHIFT_OPTIONS: any[] = [
    { value: 'all', label: '全部班次', icon: '📅', color: '#1890ff' },
    { value: 'morning', label: '早班 (08:00-16:00)', icon: '🌅', color: '#faad14' },
    { value: 'afternoon', label: '中班 (16:00-24:00)', icon: '🌇', color: '#eb2f96' },
    { value: 'night', label: '夜班 (00:00-08:00)', icon: '🌙', color: '#722ed1' }
  ];

  const rooms = useMemo(() => Array.from(new Set(babies.map(b => b.roomNumber))).sort(), [babies]);

  useEffect(() => {
    setSelectedBabies(babies.map(b => b.id!));
  }, [babies.length]);

  const filteredBabies = useMemo(() => {
    return babies.filter(b => {
      if (filterRoom !== 'all' && b.roomNumber !== filterRoom) return false;
      if (filterBaby !== 'all' && b.id !== filterBaby) return false;
      if (!selectedBabies.includes(b.id!)) return false;
      return true;
    });
  }, [babies, filterRoom, filterBaby, selectedBabies]);

  const [allStats, setAllStats] = useState<Map<number, any>>(new Map());

  useEffect(() => {
    loadAllStats();
  }, [reportDate, filteredBabies]);

  const loadAllStats = async () => {
    const map = new Map<number, any>();
    for (const b of filteredBabies) {
      if (b.id) {
        const stats = await generateDailyStats(b.id, reportDate);
        const feedStats = await getBabyFeedingStats(b.id, reportDate);
        map.set(b.id, { ...stats, ...feedStats });
      }
    }
    setAllStats(map);
  };

  const totalStats = useMemo(() => {
    let totalFeedings = 0;
    let totalMilk = 0;
    let totalBreastMin = 0;
    let totalWet = 0;
    let totalStool = 0;
    let totalSleepMin = 0;
    let weightCount = 0;
    let tempCount = 0;

    for (const stats of allStats.values()) {
      totalFeedings += stats.feedingCount || 0;
      totalMilk += stats.totalBottle || 0;
      totalBreastMin += stats.totalBreastMin || 0;
      totalWet += stats.wetCount || 0;
      totalStool += stats.stoolCount || 0;
      totalSleepMin += stats.totalSleepMin || 0;
      if (stats.lastWeight) weightCount++;
      if (stats.avgTemp) tempCount++;
    }

    return {
      totalFeedings,
      totalMilk,
      totalBreastMin,
      totalWet,
      totalStool,
      totalSleepMin,
      weightCount,
      tempCount
    };
  }, [allStats]);

  const handlePrint = () => {
    setPreviewVisible(true);
    setTimeout(() => {
      window.print();
      addNotification('正在打开打印预览...', 'success');
    }, 400);
  };

  const handleExportPDF = async () => {
    setGenerating(true);
    try {
      setPreviewVisible(true);
      await new Promise(r => setTimeout(r, 400));

      const el = document.getElementById('print-root');
      if (!el) throw new Error('报表元素未加载');

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 10;

      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - 20);

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - 20);
      }

      let filterTags: string;
      if (reportType === 'shift') {
        const shiftLabel = shiftFilter === 'all' ? '全部班次' : SHIFT_OPTIONS.find(s => s.value === shiftFilter)?.label;
        filterTags = [
          reportDate,
          shiftLabel,
          `交接${shiftSummary.totalShifts}次`,
          `${shiftSummary.totalItems}项`
        ].filter(Boolean).join('_');
      } else {
        filterTags = [
          reportDate,
          filterRoom !== 'all' ? `${filterRoom}室` : null,
          filterBaby !== 'all' ? (babies.find(b => b.id === filterBaby)?.name || '') : null,
          `${selectedBabies.length}位宝宝`
        ].filter(Boolean).join('_');
      }

      let savePath = null;
      if ((window as any).electronAPI?.showSaveDialog) {
        savePath = await (window as any).electronAPI.showSaveDialog(
          reportType === 'shift' ? `交班摘要_${filterTags}.pdf` : `护理日报_${filterTags}.pdf`
        );
      }

      if (savePath) {
        pdf.save(savePath);
      } else {
        pdf.save(reportType === 'shift' ? `交班摘要_${filterTags}.pdf` : `护理日报_${filterTags}.pdf`);
      }

      addNotification(`PDF 导出成功！(${filterTags})`, 'success');
    } catch (err) {
      console.error(err);
      message.error('PDF 导出失败');
    } finally {
      setGenerating(false);
    }
  };

  const getBabyHealthTag = (stats: any) => {
    let score = 100;
    let warnings: string[] = [];

    if (stats.feedingCount < 6) {
      score -= 20;
      warnings.push('喂养次数偏少');
    }
    if (stats.avgTemp && stats.avgTemp > 37.4) {
      score -= 30;
      warnings.push('体温偏高');
    }
    if (stats.wetCount < 4) {
      score -= 10;
      warnings.push('排尿偏少');
    }
    if (stats.cryings?.length > 5) {
      score -= 15;
      warnings.push('哭闹频繁');
    }

    if (score >= 90) return { color: 'green', label: '😊 良好', score, warnings };
    if (score >= 70) return { color: 'orange', label: '😐 一般', score, warnings };
    return { color: 'red', label: '⚠️ 需关注', score, warnings };
  };

  const summaryColumns = [
    {
      title: '宝宝',
      key: 'baby',
      width: 180,
      render: (_: any, b: Baby) => (
        <Space>
          <Avatar size={36} style={{
            background: b.gender === 'male'
              ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
              : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
            fontSize: 14
          }}>
            {b.name.charAt(0)}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600 }}>{b.name}</div>
            <div style={{ fontSize: 12, color: '#999' }}>
              {b.roomNumber}{b.bedNumber} · {calculateAgeDays(b.birthDate)}天
            </div>
          </div>
        </Space>
      )
    },
    {
      title: '喂养次数',
      key: 'feedCount',
      width: 100,
      align: 'center' as const,
      render: (_: any, b: Baby) => {
        const s = allStats.get(b.id!);
        return <span style={{ fontWeight: 600, fontSize: 15 }}>{s?.feedingCount || 0}</span>;
      }
    },
    {
      title: '总奶量',
      key: 'milk',
      width: 120,
      align: 'center' as const,
      render: (_: any, b: Baby) => {
        const s = allStats.get(b.id!);
        return (
          <span>
            {s?.totalBottle ? `${s.totalBottle}ml` : s?.totalBreastMin ? `${s.totalBreastMin}分钟` : '-'}
          </span>
        );
      }
    },
    {
      title: '平均间隔',
      key: 'interval',
      width: 110,
      align: 'center' as const,
      render: (_: any, b: Baby) => {
        const s = allStats.get(b.id!);
        return s?.avgInterval ? formatDuration(s.avgInterval) : '-';
      }
    },
    {
      title: '尿/便',
      key: 'diaper',
      width: 90,
      align: 'center' as const,
      render: (_: any, b: Baby) => {
        const s = allStats.get(b.id!);
        return <span>💧{s?.wetCount || 0} / 💩{s?.stoolCount || 0}</span>;
      }
    },
    {
      title: '睡眠',
      key: 'sleep',
      width: 110,
      align: 'center' as const,
      render: (_: any, b: Baby) => {
        const s = allStats.get(b.id!);
        return formatDuration(s?.totalSleepMin);
      }
    },
    {
      title: '平均体温',
      key: 'temp',
      width: 110,
      align: 'center' as const,
      render: (_: any, b: Baby) => {
        const s = allStats.get(b.id!);
        const t = s?.avgTemp;
        return t ? (
          <span style={{
            color: t > 37.4 ? '#ff4d4f' : t < 36 ? '#faad14' : '#52c41a',
            fontWeight: 600
          }}>
            {t.toFixed(1)}°C
          </span>
        ) : '-';
      }
    },
    {
      title: '当日体重',
      key: 'weight',
      width: 110,
      align: 'center' as const,
      render: (_: any, b: Baby) => {
        const s = allStats.get(b.id!);
        return s?.lastWeight ? formatWeight(s.lastWeight.weight) : '-';
      }
    },
    {
      title: '状态评估',
      key: 'health',
      width: 130,
      render: (_: any, b: Baby) => {
        const s = allStats.get(b.id!);
        if (!s) return null;
        const h = getBabyHealthTag(s);
        return (
          <Tooltip title={h.warnings.length > 0 ? h.warnings.join('、') : '状态良好'}>
            <Tag color={h.color} style={{ padding: '4px 10px', fontSize: 13 }}>
              {h.label}
            </Tag>
          </Tooltip>
        );
      }
    }
  ];

  const filteredShiftRecords = useMemo(() => {
    return shiftRecords.filter(s => {
      if (s.shiftDate !== reportDate) return false;
      if (shiftFilter !== 'all' && s.shiftType !== shiftFilter) return false;
      return true;
    });
  }, [shiftRecords, reportDate, shiftFilter]);

  const filterSummary = useMemo(() => {
    if (reportType === 'shift') {
      const s = SHIFT_OPTIONS.find(x => x.value === shiftFilter);
      const tags: string[] = [reportDate];
      if (shiftFilter !== 'all') tags.push(`${s?.icon || ''}${s?.label.split(' ')[0] || ''}`);
      tags.push(`共${filteredShiftRecords.length}次交接`);
      return tags.join(' · ');
    }
    const tags: string[] = [];
    if (filterRoom !== 'all') tags.push(`房间:${filterRoom}室`);
    if (filterBaby !== 'all') {
      const b = babies.find(x => x.id === filterBaby);
      if (b) tags.push(`宝宝:${b.name}`);
    }
    tags.push(`共${filteredBabies.length}位宝宝`);
    return tags.join(' · ');
  }, [filterRoom, filterBaby, filteredBabies, babies, reportType, reportDate, shiftFilter, filteredShiftRecords]);

  const shiftSummary = useMemo(() => {
    let totalItems = 0;
    let attention = 0;
    let pending = 0;
    let completed = 0;
    let toReminders = 0;
    let resolvedReminders = 0;
    const allergyBabies = new Set<number>();
    const specialNoteBabies = new Set<number>();
    const babyItems: Record<number, any[]> = {};
    const attentionItems: any[] = [];
    const attentionBabiesArr: number[] = [];
    const itemReminderMap = new Map<string, any>();
    const attentionBabySet = new Set<number>();

    for (const s of filteredShiftRecords) {
      for (const item of s.handoverItems) {
        totalItems++;
        const baby = babies.find(b => b.id === item.babyId);
        if (!babyItems[item.babyId]) babyItems[item.babyId] = [];
        babyItems[item.babyId].push({ item, shift: s, baby });

        if (item.status === 'attention') attention++;
        else if (item.status === 'completed') completed++;
        else pending++;

        if (baby?.allergies) allergyBabies.add(baby.id!);
        if (baby?.notes) specialNoteBabies.add(baby.id!);

        const hasReminder = allReminders.find(
          r => r.handoverId === s.id &&
            (r.handoverItemId === item.id || r.notes?.includes(item.description.slice(0, 20)))
        );
        if (hasReminder) {
          toReminders++;
          if (hasReminder.status === 'completed') resolvedReminders++;
          itemReminderMap.set(item.id, hasReminder);
        }

        if (item.status === 'attention') {
          attentionItems.push(item);
          if (item.babyId && !attentionBabySet.has(item.babyId)) {
            attentionBabySet.add(item.babyId);
            attentionBabiesArr.push(item.babyId);
          }
        }
      }
    }

    return {
      totalItems, attention, pending, completed, toReminders, resolvedReminders,
      allergyCount: allergyBabies.size,
      specialNoteCount: specialNoteBabies.size,
      babyItems,
      totalShifts: filteredShiftRecords.length,
      attentionCount: attention,
      completedCount: completed,
      pendingCount: pending,
      toReminderCount: toReminders,
      reminderResolvedCount: resolvedReminders,
      allergyBabies: Array.from(allergyBabies),
      notesCount: specialNoteBabies.size,
      attentionItems,
      attentionBabies: attentionBabiesArr,
      itemReminderMap
    };
  }, [filteredShiftRecords, babies, allReminders]);

  const renderReportContent = () => {
    if (reportType === 'shift') {
      const filtered = filteredShiftRecords;
      const summ = shiftSummary;

      return (
        <div
          id="print-root"
          style={{
            position: previewVisible ? 'static' : 'fixed',
            left: previewVisible ? 'auto' : '-10000px',
            top: 0,
            width: previewVisible ? '100%' : '210mm',
            background: '#fff',
            padding: previewVisible ? 0 : '20mm',
            zIndex: -1
          }}
        >
          <div className="print-container" style={{ minHeight: previewVisible ? 'auto' : '260mm' }}>
            <div className="report-header">
              <div className="report-title">🏥 月子中心 班次交接摘要</div>
              <div className="report-subtitle">
                交接日期：{dayjs(reportDate).format('YYYY年MM月DD日 dddd')}
                <span style={{ margin: '0 8px' }}>|</span>
                班次：{shiftFilter === 'all' ? '全部班次' : SHIFT_OPTIONS.find(s => s.value === shiftFilter)?.label}
                <span style={{ margin: '0 8px' }}>|</span>
                制表时间：{dayjs().format('YYYY-MM-DD HH:mm')}
                <span style={{ margin: '0 8px' }}>|</span>
                制表人：{currentNurse}
              </div>
              <div className="report-subtitle" style={{ color: '#666', fontSize: 11 }}>
                📋 筛选条件：{filterSummary}
              </div>
            </div>

            <div className="report-section">
              <div className="report-section-title">📊 交接总览</div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>交接班次</th>
                    <th>交班事项</th>
                    <th>重点关注</th>
                    <th>已完成</th>
                    <th>待处理</th>
                    <th>已转提醒</th>
                    <th>提醒已闭环</th>
                    <th>涉及过敏</th>
                    <th>特殊备注</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{summ.totalShifts} 次</td>
                    <td style={{ textAlign: 'center' }}>{summ.totalItems} 项</td>
                    <td style={{ textAlign: 'center', color: '#ff4d4f', fontWeight: 600 }}>{summ.attention}</td>
                    <td style={{ textAlign: 'center', color: '#52c41a', fontWeight: 600 }}>{summ.completed}</td>
                    <td style={{ textAlign: 'center', color: '#faad14', fontWeight: 600 }}>{summ.pending}</td>
                    <td style={{ textAlign: 'center', color: '#1890ff' }}>{summ.toReminders}</td>
                    <td style={{ textAlign: 'center', color: '#52c41a' }}>{summ.resolvedReminders}</td>
                    <td style={{ textAlign: 'center', color: '#eb2f96' }}>{summ.allergyCount} 位</td>
                    <td style={{ textAlign: 'center' }}>{summ.specialNoteCount} 位</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#999' }}>
                当前日期和班次筛选下暂无交接记录
              </div>
            ) : (
              <>
                <div className="report-section">
                  <div className="report-section-title">📝 班次明细</div>
                  {filtered.map((s: ShiftRecord) => {
                    const sopt = SHIFT_OPTIONS.find(x => x.value === s.shiftType) || SHIFT_OPTIONS[0];
                    return (
                      <Card
                        key={s.id}
                        style={{
                          marginBottom: 16,
                          borderRadius: 8,
                          border: `2px solid ${sopt.color}40`,
                          pageBreakInside: 'avoid'
                        }}
                        styles={{ body: { padding: 16 } }}
                      >
                        <div style={{
                          padding: '10px 14px',
                          background: `${sopt.color}11`,
                          borderRadius: 6,
                          marginBottom: 12,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <Space>
                            <span style={{ fontSize: 24 }}>{sopt.icon}</span>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 700 }}>
                                {sopt.label.split(' ')[0]}
                                <Tag color={sopt.color} style={{ marginLeft: 10, fontSize: 12 }}>{s.shiftDate}</Tag>
                              </div>
                              <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                                👩‍⚕️ <strong>{s.outgoingNurse}</strong> → 👩‍⚕️ <strong>{s.oncomingNurse}</strong>
                                <span style={{ marginLeft: 12 }}>{formatDateTime(s.createdAt)}</span>
                              </div>
                            </div>
                          </Space>
                          <Space>
                            <Tag color="orange">{s.handoverItems.length}项</Tag>
                            <Tag color="red">
                              <WarningOutlined /> {s.handoverItems.filter(i => i.status === 'attention').length}关注
                            </Tag>
                            <Tag color="green">
                              <CheckCircleOutlined /> {s.handoverItems.filter(i => i.status === 'completed').length}完成
                            </Tag>
                          </Space>
                        </div>

                        <Timeline
                          style={{ marginLeft: 8 }}
                          items={s.handoverItems.map(item => {
                            const baby = babies.find(b => b.id === item.babyId);
                            const rem = allReminders.find(
                              r => r.handoverId === s.id &&
                                (r.handoverItemId === item.id || r.notes?.includes(item.description.slice(0, 15)))
                            );
                            const statusColor =
                              item.status === 'completed' ? 'green' :
                                item.status === 'attention' ? 'red' :
                                  item.status === 'in_progress' ? 'blue' : 'orange';
                            return {
                              color: statusColor as any,
                              dot: <span style={{ fontSize: 13 }}>
                                {item.status === 'attention' ? '❗' : item.status === 'completed' ? '✅' : '⏳'}
                              </span>,
                              children: (
                                <div style={{ fontSize: 13 }}>
                                  <div style={{ fontWeight: 500 }}>
                                    {baby && <Tag color="purple" style={{ marginRight: 8, fontSize: 11 }}>{baby.name} {baby.roomNumber}{baby.bedNumber}</Tag>}
                                    {item.description}
                                  </div>
                                  <div style={{ marginTop: 4 }}>
                                    <Tag color={statusColor} style={{ fontSize: 11, margin: 0 }}>
                                      {item.status === 'completed' ? '已完成' : item.status === 'attention' ? '重点关注' : item.status === 'in_progress' ? '处理中' : '待处理'}
                                    </Tag>
                                    <Tag
                                      color={item.priority === 'high' ? 'red' : item.priority === 'medium' ? 'orange' : 'default'}
                                      style={{ fontSize: 11, marginLeft: 6 }}>
                                      {item.priority === 'high' ? '高优' : item.priority === 'medium' ? '中优' : '低优'}
                                    </Tag>
                                    {rem && (
                                      <Tag color={rem.status === 'completed' ? 'green' : 'blue'} style={{ fontSize: 11, marginLeft: 6 }}>
                                        <BellOutlined /> 已转提醒
                                        {rem.status === 'completed' ? '✅闭环' : '⏳跟进中'}
                                        {rem.assignedTo ? ` @${rem.assignedTo}` : ''}
                                      </Tag>
                                    )}
                                  </div>
                                </div>
                              )
                            };
                          })}
                        />

                        {s.notes && (
                          <div style={{
                            marginTop: 8, padding: 10, background: '#fafafa',
                            borderRadius: 6, fontSize: 12, color: '#666'
                          }}>
                            <strong>📝 交班备注:</strong> {s.notes}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>

                <div className="report-section">
                  <div className="report-section-title">⚠️ 重点关注汇总</div>
                  <Card styles={{ body: { padding: 12 } }} style={{ borderRadius: 8 }}>
                    <List
                      size="small"
                      locale={{ emptyText: '暂无重点关注事项' }}
                      dataSource={Object.entries(summ.babyItems)
                        .filter(([_, items]) => items.some(i =>
                          i.item.status === 'attention' || i.item.status === 'pending' ||
                          i.baby?.allergies || i.baby?.notes
                        ))
                        .map(([bid, items]) => {
                          const id = Number(bid);
                          const baby = babies.find(b => b.id === id);
                          return (
                            <List.Item key={id} style={{ padding: '10px 0', borderBottom: '1px dashed #eee' }}>
                              <Row align="middle" style={{ width: '100%' }}>
                                <Col span={3}>
                                  <Avatar size="small" style={{
                                    background: baby?.gender === 'male' ? '#1890ff' : '#ff85a2'
                                  }}>
                                    {baby?.name.charAt(0)}
                                  </Avatar>
                                  <Tag color="purple" style={{ marginTop: 4, fontSize: 11 }}>{baby?.name}</Tag>
                                </Col>
                                <Col span={3} style={{ fontSize: 12, color: '#666' }}>
                                  {baby ? `${baby.roomNumber}室${baby.bedNumber}床` : '-'}
                                </Col>
                                <Col span={18}>
                                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                    {baby?.allergies && (
                                      <div style={{ fontSize: 12 }}>
                                        <Tag color="red" style={{ fontSize: 11 }}>过敏</Tag>
                                        {baby.allergies}
                                      </div>
                                    )}
                                    {baby?.notes && (
                                      <div style={{ fontSize: 12 }}>
                                        <Tag color="orange" style={{ fontSize: 11 }}>特殊</Tag>
                                        {baby.notes}
                                      </div>
                                    )}
                                    {items
                                      .filter(i => i.item.status === 'attention' || i.item.status === 'pending')
                                      .slice(0, 5)
                                      .map((i, idx) => {
                                        const rem = allReminders.find(
                                          r => r.handoverId === i.shift.id &&
                                            (r.handoverItemId === i.item.id || r.notes?.includes(i.item.description.slice(0, 15)))
                                        );
                                        return (
                                          <div key={idx} style={{ fontSize: 12 }}>
                                            <Tag color={
                                              i.item.status === 'attention' ? 'red' : 'orange'
                                            } style={{ fontSize: 11 }}>
                                              {i.item.status === 'attention' ? '关注' : '待办'}
                                            </Tag>
                                            {i.item.description}
                                            {rem && (
                                              <Tag color={rem.status === 'completed' ? 'green' : 'blue'} style={{ fontSize: 11 }}>
                                                提醒{rem.status === 'completed' ? '✅' : '⏳'}
                                              </Tag>
                                            )}
                                          </div>
                                        );
                                      })
                                    }
                                  </Space>
                                </Col>
                              </Row>
                            </List.Item>
                          );
                        })}
                    />
                  </Card>
                </div>

                {summ.attention + summ.pending > 0 && (
                  <div className="report-section">
                    <div className="report-section-title">✅ 交班人 / 接班人 签字</div>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>交班人签字</th>
                          <th>接班人签字</th>
                          <th>签字日期</th>
                          <th>护士长审核</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ height: 48, textAlign: 'center', color: '#999' }}>____________________</td>
                          <td style={{ height: 48, textAlign: 'center', color: '#999' }}>____________________</td>
                          <td style={{ height: 48, textAlign: 'center', color: '#999' }}>____________________</td>
                          <td style={{ height: 48, textAlign: 'center', color: '#999' }}>____________________</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{
                  marginTop: 24, padding: 16,
                  background: '#fafafa', borderRadius: 8,
                  fontSize: 12, color: '#999', textAlign: 'center'
                }}>
                  本交接摘要由【母婴护理站管理系统】自动生成 · 生成时间 {formatDateTime(new Date().toISOString())} · 共 {filtered.length} 次交接 {summ.totalItems} 项事项
                </div>
              </>
            )}
          </div>
        </div>
      );
    }

    const babiesToRender = filteredBabies;
    return (
      <div
        id="print-root"
        style={{
          position: previewVisible ? 'static' : 'fixed',
          left: previewVisible ? 'auto' : '-10000px',
          top: 0,
          width: previewVisible ? '100%' : '210mm',
          background: '#fff',
          padding: previewVisible ? 0 : '20mm',
          zIndex: -1
        }}
      >
        <div className="print-container" style={{ minHeight: previewVisible ? 'auto' : '260mm' }}>
          <div className="report-header">
            <div className="report-title">🏥 月子中心 宝宝护理日报单</div>
            <div className="report-subtitle">
              护理日期：{dayjs(reportDate).format('YYYY年MM月DD日 dddd')}
              <span style={{ margin: '0 8px' }}>|</span>
              制表时间：{dayjs().format('YYYY-MM-DD HH:mm')}
              <span style={{ margin: '0 8px' }}>|</span>
              制表人：{currentNurse}
            </div>
            <div className="report-subtitle" style={{ color: '#666', fontSize: 11 }}>
              📋 筛选条件：{filterSummary}
            </div>
          </div>

          <div className="report-section">
            <div className="report-section-title">📊 今日护理总览</div>
            <table className="report-table">
              <thead>
                <tr>
                  <th>在住宝宝</th>
                  <th>总喂养次数</th>
                  <th>总奶量(ml)</th>
                  <th>亲喂总时长</th>
                  <th>尿片更换</th>
                  <th>总睡眠</th>
                  <th>体温记录</th>
                  <th>体重记录</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'center', fontWeight: 600 }}>{babiesToRender.length} 位</td>
                  <td style={{ textAlign: 'center' }}>{totalStats.totalFeedings} 次</td>
                  <td style={{ textAlign: 'center' }}>{totalStats.totalMilk || '-'}</td>
                  <td style={{ textAlign: 'center' }}>{formatDuration(totalStats.totalBreastMin)}</td>
                  <td style={{ textAlign: 'center' }}>
                    💧{totalStats.totalWet} / 💩{totalStats.totalStool}
                  </td>
                  <td style={{ textAlign: 'center' }}>{formatDuration(totalStats.totalSleepMin)}</td>
                  <td style={{ textAlign: 'center' }}>{totalStats.tempCount} 次</td>
                  <td style={{ textAlign: 'center' }}>{totalStats.weightCount} 次</td>
                </tr>
              </tbody>
            </table>
          </div>

          {babiesToRender.map(baby => {
            const stats = allStats.get(baby.id!);
            if (!stats) return null;
            const health = getBabyHealthTag(stats);

            return (
              <div key={baby.id} className="report-section" style={{ pageBreakInside: 'avoid' }}>
                <div className="report-section-title">
                  👶 {baby.name}
                  <Tag style={{ marginLeft: 8, fontSize: 12 }}>
                    {baby.gender === 'male' ? '男' : '女'}
                  </Tag>
                  <span style={{ fontSize: 13, color: '#666', marginLeft: 8, fontWeight: 400 }}>
                    {baby.roomNumber}室{baby.bedNumber}床 · 妈妈:{baby.motherName} · {calculateAgeDays(baby.birthDate)}天
                  </span>
                  <span style={{ float: 'right', fontSize: 13, fontWeight: 500, color: health.color === 'green' ? '#52c41a' : health.color }}>
                    {health.label}
                  </span>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <Row gutter={[8, 8]}>
                    <Col span={6}>
                      <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                        <div style={{ color: '#888' }}>🍼 喂养</div>
                        <div style={{ fontWeight: 600 }}>
                          {stats.feedingCount}次
                          {stats.totalBottle ? ` · ${stats.totalBottle}ml` : ''}
                        </div>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                        <div style={{ color: '#888' }}>🧷 尿/便</div>
                        <div style={{ fontWeight: 600 }}>
                          💧{stats.wetCount} / 💩{stats.stoolCount}
                        </div>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                        <div style={{ color: '#888' }}>😴 睡眠</div>
                        <div style={{ fontWeight: 600 }}>{formatDuration(stats.totalSleepMin)}</div>
                      </div>
                    </Col>
                    <Col span={6}>
                      <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                        <div style={{ color: '#888' }}>🌡️ 体温</div>
                        <div style={{ fontWeight: 600 }}>
                          {stats.avgTemp ? `${stats.avgTemp.toFixed(1)}°C` : '-'}
                        </div>
                      </div>
                    </Col>
                  </Row>
                </div>

                {stats.feedings && stats.feedings.length > 0 && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, margin: '12px 0 6px', color: '#333' }}>
                      🍼 喂养明细
                    </div>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th style={{ width: 100 }}>时间</th>
                          <th>喂养方式</th>
                          <th style={{ width: 100 }}>奶量/时长</th>
                          <th style={{ width: 80 }}>拍嗝</th>
                          <th style={{ width: 80 }}>吐奶</th>
                          <th>护理人</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.feedings.map((f: any) => (
                          <tr key={f.id}>
                            <td>{formatTime(f.startTime)}</td>
                            <td>{getFeedingTypeLabel(f.type)}</td>
                            <td>
                              {f.amount ? `${f.amount}ml` :
                                `${(f.leftDuration || 0) + (f.rightDuration || 0)}分钟`}
                            </td>
                            <td style={{ textAlign: 'center' }}>{f.burped ? '✅' : '❌'}</td>
                            <td style={{ textAlign: 'center' }}>{f.spitUp ? '⚠️' : '-'}</td>
                            <td>{f.caregiver}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}

                {(stats.diapers?.length > 0 || stats.temps?.length > 0 || stats.weights?.length > 0) && (
                  <Row gutter={12} style={{ marginTop: 12 }}>
                    {stats.diapers?.length > 0 && (
                      <Col span={8}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🧷 尿布更换</div>
                        <table className="report-table" style={{ fontSize: 12 }}>
                          <thead>
                            <tr><th>时间</th><th>类型</th><th>护理</th></tr>
                          </thead>
                          <tbody>
                            {stats.diapers.slice(0, 8).map((d: any) => (
                              <tr key={d.id}>
                                <td>{formatTime(d.time)}</td>
                                <td>{d.type === 'wet' ? '💧尿' : d.type === 'stool' ? '💩便' : '💧💩'}</td>
                                <td style={{ fontSize: 11 }}>{d.caregiver}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Col>
                    )}
                    {stats.temps?.length > 0 && (
                      <Col span={8}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🌡️ 体温记录</div>
                        <table className="report-table" style={{ fontSize: 12 }}>
                          <thead>
                            <tr><th>时间</th><th>体温</th><th>部位</th></tr>
                          </thead>
                          <tbody>
                            {stats.temps.map((t: any) => (
                              <tr key={t.id}>
                                <td>{formatTime(t.time)}</td>
                                <td style={{
                                  color: t.temperature > 37.4 ? 'red' : t.temperature < 36 ? 'orange' : 'green',
                                  fontWeight: 600
                                }}>
                                  {t.temperature.toFixed(1)}°C
                                </td>
                                <td>
                                  {t.location === 'axillary' ? '腋' :
                                    t.location === 'oral' ? '口' :
                                      t.location === 'rectal' ? '肛' : '额'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Col>
                    )}
                    {stats.weights?.length > 0 && (
                      <Col span={8}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>⚖️ 体重记录</div>
                        <table className="report-table" style={{ fontSize: 12 }}>
                          <thead>
                            <tr><th>时间</th><th>体重</th><th>状态</th></tr>
                          </thead>
                          <tbody>
                            {stats.weights.map((w: any) => (
                              <tr key={w.id}>
                                <td>{formatTime(w.time)}</td>
                                <td style={{ fontWeight: 600 }}>{w.weight.toFixed(2)}kg</td>
                                <td style={{ fontSize: 11 }}>{w.diaperRemoved ? '去尿布' : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </Col>
                    )}
                  </Row>
                )}

                {(baby.allergies || baby.notes || stats.cryings?.length > 0 || health.warnings.length > 0) && (
                  <div style={{
                    marginTop: 12, padding: 10,
                    background: health.warnings.length > 0 ? '#fff7f6' : '#fafafa',
                    borderRadius: 6, fontSize: 12
                  }}>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      {baby.allergies && <div><strong>⚠️ 过敏史：</strong>{baby.allergies}</div>}
                      {health.warnings.length > 0 && <div><strong>🔍 关注事项：</strong>{health.warnings.join('、')}</div>}
                      {stats.cryings?.length > 0 && (
                        <div>
                          <strong>😭 哭闹：</strong>共 {stats.cryings.length} 次，累计 {formatDuration(stats.totalCryingMin)}
                        </div>
                      )}
                      {baby.notes && <div><strong>📝 特殊备注：</strong>{baby.notes}</div>}
                    </Space>
                  </div>
                )}

                <div style={{
                  marginTop: 16,
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: 8,
                  borderTop: '1px dashed #ddd',
                  fontSize: 12,
                  color: '#888'
                }}>
                  <span>家长签字：_______________</span>
                  <span>护士签字：_______________</span>
                </div>
              </div>
            );
          })}

          <div style={{
            marginTop: 24,
            padding: 16,
            background: '#fafafa',
            borderRadius: 8,
            fontSize: 12,
            color: '#999',
            textAlign: 'center'
          }}>
            本报告由【母婴护理站管理系统】自动生成 · 生成时间 {formatDateTime(new Date().toISOString())} · 仅供参考
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: 20,
        borderBottom: '1px solid #f0f0f0',
        background: 'linear-gradient(135deg, #f0f5ff 0%, #fff 100%)'
      }}>
        <Row gutter={[16, 12]} align="middle" justify="space-between">
          <Col>
            <Space wrap>
              <Radio.Group
                value={reportType}
                onChange={e => setReportType(e.target.value)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="daily" style={{ padding: '6px 20px', fontWeight: 600 }}>
                  <FileTextOutlined /> 每日护理单
                </Radio.Button>
                <Radio.Button value="summary" style={{ padding: '6px 20px', fontWeight: 600 }}>
                  <EyeOutlined /> 汇总统计表
                </Radio.Button>
                <Radio.Button value="shift" style={{ padding: '6px 20px', fontWeight: 600 }}>
                  <TeamOutlined /> 交班摘要
                </Radio.Button>
              </Radio.Group>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Space>
                <CalendarOutlined />
                <DatePicker
                  value={dayjs(reportDate)}
                  onChange={d => d && setReportDate(d.format('YYYY-MM-DD'))}
                  style={{ width: 180 }}
                />
              </Space>
              {reportType !== 'shift' ? (
                <>
                  <Select
                    placeholder="筛选房间"
                    value={filterRoom}
                    onChange={setFilterRoom}
                    style={{ width: 130 }}
                    allowClear
                  >
                    <Option value="all">全部房间</Option>
                    {rooms.map(r => <Option key={r} value={r}>{r}室</Option>)}
                  </Select>
                  <Select
                    placeholder="选择宝宝"
                    value={filterBaby}
                    onChange={setFilterBaby}
                    style={{ width: 160 }}
                    allowClear
                    showSearch
                    optionFilterProp="label"
                  >
                    <Option value="all" label="全部宝宝">全部宝宝</Option>
                    {babies.map(b => (
                      <Option key={b.id} value={b.id} label={`${b.name} ${b.roomNumber}${b.bedNumber}`}>
                        <Space>
                          <Avatar size="small" style={{
                            background: b.gender === 'male'
                              ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                              : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
                            fontSize: 10
                          }}>
                            {b.name.charAt(0)}
                          </Avatar>
                          <span>{b.name}</span>
                          <Tag color="default" style={{ margin: 0 }}>{b.roomNumber}{b.bedNumber}</Tag>
                        </Space>
                      </Option>
                    ))}
                  </Select>
                </>
              ) : (
                <Segmented
                  value={shiftFilter}
                  onChange={(v: any) => setShiftFilter(v as any)}
                  options={SHIFT_OPTIONS.map(s => ({
                    label: (
                      <span style={{ fontWeight: 500 }}>
                        {s.icon} {s.label.split(' ')[0]}
                      </span>
                    ),
                    value: s.value
                  }))}
                />
              )}
            </Space>
          </Col>
          <Col>
            <Space>
              <Tooltip title="选择需要打印的宝宝">
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'all',
                        label: (
                          <Checkbox
                            checked={selectedBabies.length === babies.length}
                            indeterminate={selectedBabies.length > 0 && selectedBabies.length < babies.length}
                            onChange={e => {
                              setSelectedBabies(e.target.checked ? babies.map(b => b.id!) : []);
                            }}
                          >
                            全选 / 取消
                          </Checkbox>
                        )
                      },
                      { type: 'divider' },
                      ...babies.map(b => ({
                        key: String(b.id),
                        label: (
                          <Checkbox
                            checked={selectedBabies.includes(b.id!)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedBabies(s => [...s, b.id!]);
                              } else {
                                setSelectedBabies(s => s.filter(x => x !== b.id));
                              }
                            }}
                          >
                            <Avatar size="small" style={{
                              background: b.gender === 'male'
                                ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                                : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
                              fontSize: 10,
                              marginRight: 6
                            }}>
                              {b.name.charAt(0)}
                            </Avatar>
                            {b.name} ({b.roomNumber}{b.bedNumber})
                          </Checkbox>
                        )
                      }))
                    ]
                  }}
                >
                  <Button icon={<FilterOutlined />}>
                    选择打印 ({selectedBabies.length}/{babies.length})
                  </Button>
                </Dropdown>
              </Tooltip>
              <Button icon={<EyeOutlined />} onClick={() => {
                setPreviewVisible(true);
              }}>
                预览
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={handlePrint}
                type="primary"
                style={{ background: 'linear-gradient(135deg, #1677ff, #0958d9)', border: 'none' }}
              >
                打印
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportPDF}
                loading={generating}
                style={{ background: 'linear-gradient(135deg, #52c41a, #389e0d)', color: '#fff', border: 'none' }}
              >
                导出 PDF
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      <div style={{
        padding: '12px 20px',
        background: '#fafafa',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap'
      }}>
        {reportType === 'shift' ? (
          <>
            <Statistic title="📅 交接日期" value={reportDate} valueStyle={{ fontSize: 16 }} />
            <Statistic title="🔄 交接班次" value={shiftSummary.totalShifts} suffix="次" valueStyle={{ fontSize: 16, color: '#722ed1' }} />
            <Statistic title="📝 交班事项" value={shiftSummary.totalItems} suffix="项" valueStyle={{ fontSize: 16, color: '#1677ff' }} />
            <Statistic title="❗ 重点关注" value={shiftSummary.attention} valueStyle={{ fontSize: 16, color: '#ff4d4f' }} />
            <Statistic title="⏳ 待处理" value={shiftSummary.pending} valueStyle={{ fontSize: 16, color: '#faad14' }} />
            <Statistic title="✅ 已转提醒" value={shiftSummary.toReminders} valueStyle={{ fontSize: 16, color: '#52c41a' }} />
          </>
        ) : (
          <>
            <Statistic title="📅 报告日期" value={reportDate} valueStyle={{ fontSize: 16 }} />
            <Statistic title="👶 包含宝宝" value={filteredBabies.length} suffix="位" valueStyle={{ fontSize: 16, color: '#1677ff' }} />
            <Statistic title="🍼 总喂养" value={totalStats.totalFeedings} suffix="次" valueStyle={{ fontSize: 16, color: '#722ed1' }} />
            <Statistic title="🥛 总奶量" value={totalStats.totalMilk} suffix="ml" valueStyle={{ fontSize: 16, color: '#52c41a' }} />
            <Statistic title="🧷 尿布更换" value={`${totalStats.totalWet + totalStats.totalStool}`} suffix="次" valueStyle={{ fontSize: 16, color: '#faad14' }} />
          </>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {reportType === 'shift' ? (
          renderReportContent()
        ) : filteredBabies.length === 0 ? (
          <Empty description="没有符合条件的宝宝数据" style={{ padding: 60 }} />
        ) : reportType === 'summary' ? (
          <Card title="📊 护理数据汇总表" style={{ borderRadius: 12 }}>
            <Table
              rowKey="id"
              size="middle"
              dataSource={filteredBabies}
              columns={summaryColumns}
              pagination={false}
              scroll={{ x: 1200 }}
              bordered
            />

            <Divider />

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              {filteredBabies.map(baby => {
                const s = allStats.get(baby.id!);
                const h = s ? getBabyHealthTag(s) : null;
                return (
                  <Col xs={12} sm={8} md={6} key={baby.id}>
                    <Card
                      size="small"
                      style={{
                        borderRadius: 10,
                        borderColor: h?.color === 'green' ? '#b7eb8f' :
                          h?.color === 'orange' ? '#ffe58f' : '#ffccc7'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <Avatar size={32} style={{
                          background: baby.gender === 'male'
                            ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                            : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
                          fontSize: 13
                        }}>
                          {baby.name.charAt(0)}
                        </Avatar>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{baby.name}</div>
                          <div style={{ fontSize: 11, color: '#999' }}>{baby.roomNumber}{baby.bedNumber}</div>
                        </div>
                        {h && (
                          <Tag color={h.color} style={{ margin: 0, fontSize: 11 }}>
                            {h.label}
                          </Tag>
                        )}
                      </div>
                      {s && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 4,
                          fontSize: 12,
                          color: '#666'
                        }}>
                          <div>🍼 {s.feedingCount}次</div>
                          <div>🧷 {s.wetCount + s.stoolCount}次</div>
                          <div>😴 {formatDuration(s.totalSleepMin)}</div>
                          <div>🌡️ {s.avgTemp ? s.avgTemp.toFixed(1) : '-'}°</div>
                        </div>
                      )}
                      {s?.lastWeight && (
                        <div style={{
                          marginTop: 6, paddingTop: 6,
                          borderTop: '1px dashed #eee',
                          fontSize: 12,
                          display: 'flex',
                          justifyContent: 'space-between'
                        }}>
                          <span>⚖️ {formatWeight(s.lastWeight.weight)}</span>
                          <span style={{ color: '#999' }}>出生 {formatWeight(baby.birthWeight)}</span>
                        </div>
                      )}
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </Card>
        ) : (
          <Card title="📋 每日护理单详情 (屏幕上为预览，点击打印/导出PDF查看完整格式)" style={{ borderRadius: 12 }}>
            <div style={{ maxHeight: 500, overflow: 'auto', background: '#f5f5f5', padding: 20, borderRadius: 8 }}>
              {filteredBabies.map(baby => {
                const stats = allStats.get(baby.id!);
                const h = stats ? getBabyHealthTag(stats) : null;
                return (
                  <div key={baby.id} style={{
                    background: '#fff',
                    borderRadius: 10,
                    padding: 16,
                    marginBottom: 16,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <Space>
                        <Avatar size={40} style={{
                          background: baby.gender === 'male'
                            ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                            : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
                          fontSize: 16
                        }}>
                          {baby.name.charAt(0)}
                        </Avatar>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16 }}>
                            {baby.name}
                            <Tag color={baby.gender === 'male' ? 'blue' : 'pink'} style={{ marginLeft: 8 }}>
                              {baby.gender === 'male' ? '男' : '女'}
                            </Tag>
                          </div>
                          <div style={{ fontSize: 12, color: '#888' }}>
                            {baby.roomNumber}室{baby.bedNumber}床 · 妈妈:{baby.motherName} · {calculateAgeDays(baby.birthDate)}天
                          </div>
                        </div>
                      </Space>
                      {h && <Tag color={h.color} style={{ fontSize: 14, padding: '4px 12px' }}>{h.label}</Tag>}
                    </div>

                    {stats && (
                      <>
                        <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
                          <Col span={6}>
                            <div className="stat-card" style={{ padding: 10, textAlign: 'center' }}>
                              <div className="stat-label">🍼 喂养</div>
                              <div className="stat-value" style={{ fontSize: 18 }}>{stats.feedingCount}次</div>
                              <div style={{ fontSize: 11, color: '#999' }}>
                                {stats.totalBottle ? `${stats.totalBottle}ml` : stats.totalBreastMin ? `${stats.totalBreastMin}分钟亲喂` : ''}
                              </div>
                            </div>
                          </Col>
                          <Col span={6}>
                            <div className="stat-card" style={{ padding: 10, textAlign: 'center' }}>
                              <div className="stat-label">🧷 尿布</div>
                              <div className="stat-value" style={{ fontSize: 18 }}>
                                {stats.wetCount + stats.stoolCount}
                              </div>
                              <div style={{ fontSize: 11, color: '#999' }}>
                                💧{stats.wetCount} / 💩{stats.stoolCount}
                              </div>
                            </div>
                          </Col>
                          <Col span={6}>
                            <div className="stat-card" style={{ padding: 10, textAlign: 'center' }}>
                              <div className="stat-label">😴 睡眠</div>
                              <div className="stat-value" style={{ fontSize: 18 }}>
                                {formatDuration(stats.totalSleepMin)}
                              </div>
                              <div style={{ fontSize: 11, color: '#999' }}>累计</div>
                            </div>
                          </Col>
                          <Col span={6}>
                            <div className="stat-card" style={{ padding: 10, textAlign: 'center' }}>
                              <div className="stat-label">🌡️ 体温</div>
                              <div className="stat-value" style={{
                                fontSize: 18,
                                color: stats.avgTemp && stats.avgTemp > 37.4 ? '#ff4d4f' : '#333'
                              }}>
                                {stats.avgTemp ? `${stats.avgTemp.toFixed(1)}°` : '-'}
                              </div>
                              <div style={{ fontSize: 11, color: '#999' }}>
                                {stats.lastWeight ? `⚖️ ${formatWeight(stats.lastWeight.weight)}` : ''}
                              </div>
                            </div>
                          </Col>
                        </Row>

                        {stats.feedings?.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🍼 喂养明细</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {stats.feedings.map((f: any) => (
                                <div key={f.id} style={{
                                  padding: '4px 8px',
                                  background: '#f0f5ff',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  border: '1px solid #d6e4ff'
                                }}>
                                  <strong>{formatTime(f.startTime)}</strong>
                                  <span style={{ color: '#666', marginLeft: 4 }}>
                                    {getFeedingTypeLabel(f.type)}
                                    {f.amount ? ` ${f.amount}ml` : ` ${(f.leftDuration || 0) + (f.rightDuration || 0)}分`}
                                  </span>
                                  {f.spitUp && <Tag color="red" style={{ margin: '0 0 0 4px', fontSize: 10 }}>吐奶</Tag>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {h && h.warnings && h.warnings.length > 0 && (
                          <div style={{
                            padding: 8,
                            background: '#fff7f6',
                            borderRadius: 6,
                            fontSize: 12,
                            color: '#d4380d',
                            border: '1px solid #ffccc7'
                          }}>
                            ⚠️ <strong>关注事项:</strong> {h.warnings.join('；')}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {renderReportContent()}

      <Modal
        title="📄 报表预览"
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={960}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            关闭
          </Button>,
          <Button key="print" icon={<PrinterOutlined />} onClick={() => {
            window.print();
            addNotification('正在打开打印预览...', 'success');
          }}>
            打印
          </Button>,
          <Button
            key="pdf"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportPDF}
            loading={generating}
            style={{ background: '#52c41a', border: 'none' }}
          >
            导出 PDF
          </Button>
        ]}
      >
        <div style={{
          maxHeight: '70vh',
          overflow: 'auto',
          background: '#f0f0f0',
          padding: 20
        }}>
          <div style={{
            background: '#fff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            padding: 30,
            minHeight: 800,
            width: '100%'
          }}>
            {reportType === 'shift' ? (
              <div className="print-container">
                <div className="report-header">
                  <div className="report-title">🏥 月子中心 班次交接摘要</div>
                  <div className="report-subtitle">
                    交接日期：{dayjs(reportDate).format('YYYY年MM月DD日 dddd')}
                    <span style={{ margin: '0 8px' }}>|</span>
                    班次：{shiftFilter === 'all' ? '全部班次' : SHIFT_OPTIONS.find(s => s.value === shiftFilter)?.label}
                    <span style={{ margin: '0 8px' }}>|</span>
                    制表时间：{dayjs().format('YYYY-MM-DD HH:mm')}
                    <span style={{ margin: '0 8px' }}>|</span>
                    制表人：{currentNurse}
                  </div>
                  <div className="report-subtitle" style={{ color: '#666', fontSize: 11 }}>
                    📋 筛选条件：{filterSummary}
                  </div>
                </div>

                <div className="report-section">
                  <div className="report-section-title">📊 交接总览</div>
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>交接班次</th><th>交班事项</th><th>重点关注</th><th>已完成</th>
                        <th>待处理</th><th>已转提醒</th><th>提醒已闭环</th>
                        <th>涉及过敏</th><th>特殊备注</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{shiftSummary.totalShifts} 次</td>
                        <td style={{ textAlign: 'center' }}>{shiftSummary.totalItems} 项</td>
                        <td style={{ textAlign: 'center', color: '#ff4d4f', fontWeight: 600 }}>{shiftSummary.attentionCount}</td>
                        <td style={{ textAlign: 'center', color: '#52c41a' }}>{shiftSummary.completedCount}</td>
                        <td style={{ textAlign: 'center', color: '#fa8c16' }}>{shiftSummary.pendingCount}</td>
                        <td style={{ textAlign: 'center' }}>{shiftSummary.toReminderCount}</td>
                        <td style={{ textAlign: 'center', color: '#52c41a' }}>{shiftSummary.reminderResolvedCount}</td>
                        <td style={{ textAlign: 'center', color: '#eb2f96' }}>{shiftSummary.allergyBabies.length}</td>
                        <td style={{ textAlign: 'center' }}>{shiftSummary.notesCount}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="report-section">
                  <div className="report-section-title">📅 班次交接详情</div>
                  {filteredShiftRecords.map((shift) => {
                    const sItems = shift.handoverItems;
                    const shiftOpt = SHIFT_OPTIONS.find(o => o.value === shift.shiftType) || SHIFT_OPTIONS[0];
                    return (
                      <div key={shift.id} style={{
                        marginBottom: 12,
                        padding: 12,
                        border: '1px solid #eee',
                        borderRadius: 8
                      }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 8
                        }}>
                          <Space>
                            <span style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: shiftOpt.color
                            }}>
                              {shiftOpt.icon} {shiftOpt.label}
                            </span>
                            <Tag color="blue">{shift.outgoingNurse} → {shift.oncomingNurse}</Tag>
                            <span style={{ fontSize: 11, color: '#999' }}>
                              {formatTime(shift.createdAt)}
                            </span>
                          </Space>
                          <Space size={4}>
                            {sItems.filter(i => i.status === 'attention').length > 0 && (
                              <Tag color="red">⚠️ {sItems.filter(i => i.status === 'attention').length} 重点</Tag>
                            )}
                            {sItems.filter(i => i.status === 'pending' || i.status === 'in_progress').length > 0 && (
                              <Tag color="orange">⏳ {sItems.filter(i => i.status === 'pending' || i.status === 'in_progress').length} 待处理</Tag>
                            )}
                          </Space>
                        </div>
                        <table className="report-table">
                          <thead>
                            <tr>
                              <th style={{ width: 60 }}>宝宝</th>
                              <th>事项内容</th>
                              <th style={{ width: 70 }}>状态</th>
                              <th style={{ width: 60 }}>优先级</th>
                              <th style={{ width: 90 }}>提醒状态</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sItems.map((item) => {
                              const rem = allReminders.find(r =>
                                r.handoverId === shift.id &&
                                (r.handoverItemId === item.id ||
                                  r.notes?.includes(item.description.slice(0, 15)))
                              );
                              const baby = babies.find(b => b.id === item.babyId);
                              const remStatus =
                                rem?.status === 'completed' ? <span style={{ color: '#52c41a' }}>✅ 已完成</span> :
                                  rem?.status === 'missed' ? <span style={{ color: '#ff4d4f' }}>❌ 错过</span> :
                                    rem ? <span style={{ color: '#1890ff' }}>🔔 跟进中</span> :
                                      item.toReminder ? <span style={{ color: '#fa8c16' }}>待生成</span> : '-';
                              return (
                                <tr key={item.id}>
                                  <td>{baby?.name || '-'}</td>
                                  <td>{item.description}</td>
                                  <td style={{ textAlign: 'center' }}>
                                    {item.status === 'attention' && '⚠️ 重点'}
                                    {item.status === 'completed' && <span style={{ color: '#52c41a' }}>✅ 完成</span>}
                                    {item.status === 'pending' && <span style={{ color: '#fa8c16' }}>⏳ 待办</span>}
                                    {item.status === 'in_progress' && <span style={{ color: '#1890ff' }}>🔄 处理中</span>}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {item.priority === 'high' ? '🔴 高' : item.priority === 'medium' ? '🟡 中' : '🟢 低'}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>{remStatus}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>

                {shiftSummary.attentionItems.length > 0 && (
                  <div className="report-section">
                    <div className="report-section-title">🔍 重点关注汇总</div>
                    {shiftSummary.attentionBabies.map((babyId) => {
                      const baby = babies.find(b => b.id === babyId);
                      const items = shiftSummary.attentionItems.filter(i => i.babyId === babyId);
                      return (
                        <div key={babyId} style={{
                          marginBottom: 10,
                          padding: 12,
                          background: '#fff7f6',
                          borderRadius: 8,
                          border: '1px solid #ffccc7'
                        }}>
                          <div style={{
                            fontWeight: 600,
                            color: '#d4380d',
                            marginBottom: 6,
                            fontSize: 13
                          }}>
                            👶 {baby?.name}
                            {baby?.roomNumber && <span style={{ color: '#666', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                              {baby.roomNumber}室{baby.bedNumber}床
                            </span>}
                          </div>
                          {baby?.allergies && (
                            <div style={{ fontSize: 12, color: '#d4380d', marginBottom: 4 }}>
                              ⚠️ 过敏史：{baby.allergies}
                            </div>
                          )}
                          {items.map((it, idx) => {
                            const rem = shiftSummary.itemReminderMap.get(it.id);
                            return (
                              <div key={idx} style={{ fontSize: 12, margin: '4px 0', paddingLeft: 12 }}>
                                • {it.description}
                                {rem && (
                                  <span style={{
                                    marginLeft: 8,
                                    fontSize: 11,
                                    color: rem.status === 'completed' ? '#52c41a' : '#1890ff'
                                  }}>
                                    [{rem.status === 'completed' ? `✅ 提醒已完成 @${rem.assignedTo || ''}` :
                                      `🔔 提醒处理中 @${rem.assignedTo || ''}`}]
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {baby?.notes && (
                            <div style={{ fontSize: 12, color: '#873800', marginTop: 4 }}>
                              📝 备注：{baby.notes}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{
                  marginTop: 24,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 16,
                  padding: 16,
                  background: '#fafafa',
                  borderRadius: 8
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: 24, color: '#666', fontSize: 12 }}>交班人签字</div>
                    <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 12 }}>日期：</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: 24, color: '#666', fontSize: 12 }}>接班人签字</div>
                    <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 12 }}>日期：</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: 24, color: '#666', fontSize: 12 }}>护士长签字</div>
                    <div style={{ borderTop: '1px solid #999', paddingTop: 8, fontSize: 12 }}>日期：</div>
                  </div>
                </div>

                <div style={{
                  marginTop: 24,
                  padding: 12,
                  background: '#fafafa',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#999',
                  textAlign: 'center'
                }}>
                  本报告由【母婴护理站管理系统】自动生成 · {formatDateTime(new Date().toISOString())}
                </div>
              </div>
            ) : (
              <div className="print-container">
                <div className="report-header">
                  <div className="report-title">🏥 月子中心 宝宝护理日报单</div>
                  <div className="report-subtitle">
                    护理日期：{dayjs(reportDate).format('YYYY年MM月DD日 dddd')}
                    <span style={{ margin: '0 8px' }}>|</span>
                    制表时间：{dayjs().format('YYYY-MM-DD HH:mm')}
                    <span style={{ margin: '0 8px' }}>|</span>
                    制表人：{currentNurse}
                  </div>
                  <div className="report-subtitle" style={{ color: '#666', fontSize: 11 }}>
                    📋 筛选条件：{filterSummary}
                  </div>
                </div>

                <div className="report-section">
                  <div className="report-section-title">📊 今日护理总览</div>
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>在住宝宝</th><th>总喂养次数</th><th>总奶量(ml)</th>
                        <th>亲喂时长</th><th>尿片</th><th>总睡眠</th>
                        <th>体温记录</th><th>体重记录</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{filteredBabies.length} 位</td>
                        <td style={{ textAlign: 'center' }}>{totalStats.totalFeedings} 次</td>
                        <td style={{ textAlign: 'center' }}>{totalStats.totalMilk || '-'}</td>
                        <td style={{ textAlign: 'center' }}>{formatDuration(totalStats.totalBreastMin)}</td>
                        <td style={{ textAlign: 'center' }}>💧{totalStats.totalWet} / 💩{totalStats.totalStool}</td>
                        <td style={{ textAlign: 'center' }}>{formatDuration(totalStats.totalSleepMin)}</td>
                        <td style={{ textAlign: 'center' }}>{totalStats.tempCount} 次</td>
                        <td style={{ textAlign: 'center' }}>{totalStats.weightCount} 次</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {filteredBabies.map(baby => {
                  const stats = allStats.get(baby.id!);
                  if (!stats) return null;
                  const health = getBabyHealthTag(stats);
                  return (
                    <div key={baby.id} className="report-section" style={{ pageBreakInside: 'avoid' }}>
                      <div className="report-section-title">
                        👶 {baby.name}
                        <Tag style={{ marginLeft: 8 }}>{baby.gender === 'male' ? '男' : '女'}</Tag>
                        <span style={{ fontSize: 13, color: '#666', marginLeft: 8, fontWeight: 400 }}>
                          {baby.roomNumber}室{baby.bedNumber}床 · 妈妈:{baby.motherName} · {calculateAgeDays(baby.birthDate)}天
                        </span>
                        <span style={{
                          float: 'right',
                          fontSize: 13,
                          fontWeight: 500,
                          color: health.color === 'green' ? '#52c41a' : health.color
                        }}>
                          {health.label}
                        </span>
                      </div>
                      <Row gutter={[8, 8]} style={{ marginBottom: 8 }}>
                        <Col span={6}>
                          <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                            <div style={{ color: '#888' }}>🍼 喂养</div>
                            <div style={{ fontWeight: 600 }}>
                              {stats.feedingCount}次{stats.totalBottle ? ` · ${stats.totalBottle}ml` : ''}
                            </div>
                          </div>
                        </Col>
                        <Col span={6}>
                          <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                            <div style={{ color: '#888' }}>🧷 尿/便</div>
                            <div style={{ fontWeight: 600 }}>💧{stats.wetCount} / 💩{stats.stoolCount}</div>
                          </div>
                        </Col>
                        <Col span={6}>
                          <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                            <div style={{ color: '#888' }}>😴 睡眠</div>
                            <div style={{ fontWeight: 600 }}>{formatDuration(stats.totalSleepMin)}</div>
                          </div>
                        </Col>
                        <Col span={6}>
                          <div style={{ padding: 8, background: '#f5f5f5', borderRadius: 4, fontSize: 12 }}>
                            <div style={{ color: '#888' }}>🌡️ 体温</div>
                            <div style={{ fontWeight: 600 }}>{stats.avgTemp ? `${stats.avgTemp.toFixed(1)}°C` : '-'}</div>
                          </div>
                        </Col>
                      </Row>

                      {stats.feedings?.length > 0 && (
                        <>
                          <div style={{ fontSize: 13, fontWeight: 600, margin: '8px 0 6px' }}>🍼 喂养明细</div>
                          <table className="report-table">
                            <thead>
                              <tr>
                                <th style={{ width: 90 }}>时间</th>
                                <th>方式</th>
                                <th style={{ width: 90 }}>奶量/时长</th>
                                <th style={{ width: 60 }}>拍嗝</th>
                                <th style={{ width: 60 }}>吐奶</th>
                                <th>护理人</th>
                              </tr>
                            </thead>
                            <tbody>
                              {stats.feedings.map((f: any) => (
                                <tr key={f.id}>
                                  <td>{formatTime(f.startTime)}</td>
                                  <td>{getFeedingTypeLabel(f.type)}</td>
                                  <td>{f.amount ? `${f.amount}ml` : `${(f.leftDuration||0)+(f.rightDuration||0)}分`}</td>
                                  <td style={{ textAlign: 'center' }}>{f.burped ? '✅' : '❌'}</td>
                                  <td style={{ textAlign: 'center' }}>{f.spitUp ? '⚠️' : '-'}</td>
                                  <td>{f.caregiver}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      )}

                      {(baby.allergies || baby.notes || health.warnings.length > 0 || stats.cryings?.length > 0) && (
                        <div style={{
                          marginTop: 10,
                          padding: 10,
                          background: health.warnings.length > 0 ? '#fff7f6' : '#fafafa',
                          borderRadius: 6,
                          fontSize: 12
                        }}>
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            {baby.allergies && <div><strong>⚠️ 过敏史：</strong>{baby.allergies}</div>}
                            {health.warnings.length > 0 && <div><strong>🔍 关注：</strong>{health.warnings.join('、')}</div>}
                            {stats.cryings?.length > 0 && <div><strong>😭 哭闹：</strong>{stats.cryings.length}次，累计{formatDuration(stats.totalCryingMin)}</div>}
                            {baby.notes && <div><strong>📝 备注：</strong>{baby.notes}</div>}
                          </Space>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{
                  marginTop: 24,
                  padding: 12,
                  background: '#fafafa',
                  borderRadius: 8,
                  fontSize: 11,
                  color: '#999',
                  textAlign: 'center'
                }}>
                  本报告由【母婴护理站管理系统】自动生成 · {formatDateTime(new Date().toISOString())}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ReportPrint;
