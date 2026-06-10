import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Card, Row, Col, Table, Button, Tag, Space, Select, DatePicker,
  Empty, Statistic, Avatar, Divider, Tabs, List, Tooltip, Checkbox,
  message, App, Progress, Radio, Modal, Dropdown
} from 'antd';
import {
  PrinterOutlined, DownloadOutlined, FileTextOutlined,
  FilterOutlined, CalendarOutlined, UserOutlined,
  CheckCircleOutlined, ExportOutlined, EyeOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { db } from '../db';
import { Baby } from '../types';
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
  const [reportType, setReportType] = useState<'daily' | 'summary'>('daily');
  const [selectedBabies, setSelectedBabies] = useState<number[]>([]);
  const [generating, setGenerating] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const babies = useLiveQuery(
    () => db.babies.where('status').equals('active').sortBy('roomNumber'),
    [], []
  ) as Baby[];

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
    window.print();
    addNotification('正在打开打印预览...', 'success');
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setGenerating(true);
    try {
      setPreviewVisible(true);
      await new Promise(r => setTimeout(r, 300));

      const canvas = await html2canvas(reportRef.current!, {
        scale: 2,
        useCORS: true,
        logging: false
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

      let savePath = null;
      if ((window as any).electronAPI?.showSaveDialog) {
        savePath = await (window as any).electronAPI.showSaveDialog(
          `护理日报_${reportDate}.pdf`
        );
      }

      if (savePath) {
        pdf.save(savePath);
      } else {
        pdf.save(`护理日报_${reportDate}.pdf`);
      }

      addNotification('PDF 导出成功！', 'success');
    } catch (err) {
      console.error(err);
      message.error('PDF 导出失败');
    } finally {
      setGenerating(false);
      setTimeout(() => setPreviewVisible(false), 500);
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

  const renderReportContent = () => (
    <div ref={reportRef} className={previewVisible ? '' : 'no-print'}>
      <div className="print-container" style={{
        display: previewVisible ? 'block' : 'none'
      }}>
        <div className="report-header">
          <div className="report-title">🏥 月子中心 宝宝护理日报单</div>
          <div className="report-subtitle">
            护理日期：{dayjs(reportDate).format('YYYY年MM月DD日 dddd')} ·
            制表时间：{dayjs().format('YYYY-MM-DD HH:mm')} ·
            制表人：{currentNurse}
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
                <td style={{ textAlign: 'center', fontWeight: 600 }}>{filteredBabies.length} 位</td>
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

        {filteredBabies.map(baby => {
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
        <Statistic title="📅 报告日期" value={reportDate} valueStyle={{ fontSize: 16 }} />
        <Statistic title="👶 包含宝宝" value={filteredBabies.length} suffix="位" valueStyle={{ fontSize: 16, color: '#1677ff' }} />
        <Statistic title="🍼 总喂养" value={totalStats.totalFeedings} suffix="次" valueStyle={{ fontSize: 16, color: '#722ed1' }} />
        <Statistic title="🥛 总奶量" value={totalStats.totalMilk} suffix="ml" valueStyle={{ fontSize: 16, color: '#52c41a' }} />
        <Statistic title="🧷 尿布更换" value={`${totalStats.totalWet + totalStats.totalStool}`} suffix="次" valueStyle={{ fontSize: 16, color: '#faad14' }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {filteredBabies.length === 0 ? (
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

                        {h?.warnings.length > 0 && (
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
        width={900}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            关闭
          </Button>,
          <Button key="print" icon={<PrinterOutlined />} onClick={() => {
            renderReportContent();
            setTimeout(() => {
              setPreviewVisible(false);
              handlePrint();
            }, 100);
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
          padding: 10
        }}>
          {previewVisible && (
            <div ref={reportRef} style={{
              background: '#fff',
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              minHeight: 800
            }}>
              <div className="print-container">
                <div className="report-header">
                  <div className="report-title">🏥 月子中心 宝宝护理日报单</div>
                  <div className="report-subtitle">
                    护理日期：{dayjs(reportDate).format('YYYY年MM月DD日 dddd')} ·
                    制表时间：{dayjs().format('YYYY-MM-DD HH:mm')} ·
                    制表人：{currentNurse}
                  </div>
                </div>

                {filteredBabies.map(baby => {
                  const stats = allStats.get(baby.id!);
                  if (!stats) return null;
                  const health = getBabyHealthTag(stats);
                  return (
                    <div key={baby.id} className="report-section">
                      <div className="report-section-title">
                        👶 {baby.name}
                        <Tag style={{ marginLeft: 8 }}>{baby.gender === 'male' ? '男' : '女'}</Tag>
                        <span style={{ fontSize: 13, color: '#666', marginLeft: 8, fontWeight: 400 }}>
                          {baby.roomNumber}室{baby.bedNumber}床 · 妈妈:{baby.motherName} · {calculateAgeDays(baby.birthDate)}天
                        </span>
                      </div>
                      <table className="report-table">
                        <tbody>
                          <tr>
                            <td><strong>🍼 喂养:</strong> {stats.feedingCount}次 {stats.totalBottle ? `· ${stats.totalBottle}ml` : ''}</td>
                            <td><strong>🧷 尿布:</strong> 💧{stats.wetCount} / 💩{stats.stoolCount}</td>
                            <td><strong>😴 睡眠:</strong> {formatDuration(stats.totalSleepMin)}</td>
                            <td><strong>🌡️ 体温:</strong> {stats.avgTemp ? `${stats.avgTemp.toFixed(1)}°C` : '-'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default ReportPrint;
