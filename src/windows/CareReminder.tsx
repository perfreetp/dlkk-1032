import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, Row, Col, Table, Button, Tag, Space, Modal, Form, Input, Select,
  DatePicker, Checkbox, Empty, Badge, Divider, List, Avatar, Tooltip,
  Progress, Dropdown, InputNumber, message, App
} from 'antd';
import {
  BellOutlined, PlusOutlined, CheckOutlined, ClockCircleOutlined,
  DeleteOutlined, ExclamationOutlined, ThunderboltOutlined,
  UserOutlined, SettingOutlined, CloseOutlined, ReloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { db } from '../db';
import { Baby, Reminder, ReminderType, ReminderStatus } from '../types';
import { useAppStore } from '../store/appStore';
import { getBabyFeedingStats, getRooms, formatDateTime } from '../utils';

const { Option } = Select;
const { TextArea } = Input;

const TYPE_OPTIONS: { value: ReminderType; label: string; icon: string; color: string }[] = [
  { value: 'feeding', label: '喂养', icon: '🍼', color: '#ff85a2' },
  { value: 'diaper', label: '换尿布', icon: '🧷', color: '#1677ff' },
  { value: 'medication', label: '用药', icon: '💊', color: '#722ed1' },
  { value: 'temperature', label: '测体温', icon: '🌡️', color: '#faad14' },
  { value: 'custom', label: '自定义', icon: '📝', color: '#13c2c2' }
];

const CareReminder: React.FC = () => {
  const { currentNurse, setSelectedBaby, setActiveWindow, addNotification } = useAppStore();
  const { modal } = App.useApp();

  const [modalOpen, setModalOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [form] = Form.useForm();
  const [batchForm] = Form.useForm();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterRoom, setFilterRoom] = useState<string>('all');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const babies = useLiveQuery(
    () => db.babies.where('status').equals('active').sortBy('roomNumber'),
    [], []
  ) as Baby[];

  const rooms = useMemo(() => getRooms(babies), [babies]);

  const reminders = useLiveQuery(
    () => db.reminders.orderBy('scheduledTime').toArray(),
    [], []
  ) as Reminder[];

  useEffect(() => {
    autoUpdateMissed();
  }, [now]);

  const autoUpdateMissed = async () => {
    const nowIso = new Date().toISOString();
    const expired = reminders.filter(
      r => r.status === 'pending' && r.scheduledTime < nowIso &&
        dayjs(nowIso).diff(dayjs(r.scheduledTime), 'minute') > 15
    );
    for (const r of expired) {
      await db.reminders.update(r.id!, { status: 'missed' });
    }
  };

  const getBabyMap = () => {
    const map = new Map<number, Baby>();
    babies.forEach(b => map.set(b.id!, b));
    return map;
  };

  const openAddModal = (babyId?: number) => {
    setEditingReminder(null);
    form.resetFields();
    const defaultTime = dayjs().add(3, 'hour');
    form.setFieldsValue({
      type: 'feeding',
      title: '下次喂养',
      scheduledTime: defaultTime,
      repeat: 'none',
      assignedTo: currentNurse,
      babyIds: babyId ? [babyId] : undefined
    });
    setModalOpen(true);
  };

  const openBatchModal = () => {
    batchForm.resetFields();
    batchForm.setFieldsValue({
      type: 'feeding',
      title: '下次喂养',
      baseTime: dayjs().add(3, 'hour'),
      intervalMinutes: 0,
      babyIds: babies.map(b => b.id)
    });
    setBatchModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const babyIds: number[] = values.babyIds || [];
      if (babyIds.length === 0) {
        message.warning('请至少选择一位宝宝');
        return;
      }

      const now = new Date().toISOString();
      const scheduledTime = values.scheduledTime.toDate().toISOString();

      const dataList = babyIds.map(babyId => ({
        babyId,
        type: values.type,
        title: values.title,
        scheduledTime,
        status: 'pending' as ReminderStatus,
        repeat: values.repeat,
        intervalMinutes: values.intervalMinutes,
        assignedTo: values.assignedTo,
        notes: values.notes,
        createdAt: now
      }));

      await db.reminders.bulkAdd(dataList);
      addNotification(`已创建 ${dataList.length} 条提醒`, 'success');
      setModalOpen(false);
    } catch (err: any) {
      if (!err?.errorFields) message.error('保存失败');
    }
  };

  const handleBatchSave = async () => {
    try {
      const values = await batchForm.validateFields();
      const babyIds: number[] = values.babyIds || [];
      if (babyIds.length === 0) {
        message.warning('请至少选择一位宝宝');
        return;
      }

      const baseTime = dayjs(values.baseTime.toDate());
      const now = new Date().toISOString();

      const dataList = babyIds.map((babyId, idx) => {
        const scheduled = baseTime.add(idx * (values.intervalMinutes || 0), 'minute');
        return {
          babyId,
          type: values.type,
          title: values.title,
          scheduledTime: scheduled.toISOString(),
          status: 'pending' as ReminderStatus,
          repeat: 'none',
          assignedTo: currentNurse,
          notes: values.notes,
          createdAt: now
        };
      });

      await db.reminders.bulkAdd(dataList);
      addNotification(`批量创建 ${dataList.length} 条提醒成功`, 'success');
      setBatchModalOpen(false);
    } catch (err: any) {
      if (!err?.errorFields) message.error('保存失败');
    }
  };

  const handleComplete = async (r: Reminder) => {
    await db.reminders.update(r.id!, {
      status: 'completed' as ReminderStatus,
      completedAt: new Date().toISOString()
    });
    message.success('提醒已标记完成');
  };

  const handleCancel = async (r: Reminder) => {
    await db.reminders.update(r.id!, { status: 'cancelled' as ReminderStatus });
    message.success('提醒已取消');
  };

  const handleDelete = async (id: number) => {
    modal.confirm({
      title: '确认删除该提醒?',
      onOk: async () => {
        await db.reminders.delete(id);
        message.success('已删除');
      }
    });
  };

  const handleQuickFeed = async (r: Reminder, baby: Baby) => {
    await db.reminders.update(r.id!, {
      status: 'completed' as ReminderStatus,
      completedAt: new Date().toISOString()
    });
    setSelectedBaby(baby);
    setActiveWindow('feedingEntry');
    addNotification(`跳转录入: ${baby.name}`, 'success');
  };

  const getReminderStatus = (r: Reminder) => {
    if (r.status === 'completed') {
      return { tag: <Tag color="success"><CheckOutlined /> 已完成</Tag>, badge: 'success' };
    }
    if (r.status === 'cancelled') {
      return { tag: <Tag color="default">已取消</Tag>, badge: 'default' };
    }
    if (r.status === 'missed') {
      return { tag: <Tag color="error"><ExclamationOutlined /> 已错过</Tag>, badge: 'error' };
    }

    const diffMin = dayjs(r.scheduledTime).diff(dayjs(), 'minute');
    if (diffMin < 0) {
      return { tag: <Tag color="warning"><ExclamationOutlined /> 超期 {Math.abs(diffMin)}分</Tag>, badge: 'warning' };
    }
    if (diffMin <= 15) {
      return { tag: <Tag color="warning"><ClockCircleOutlined /> 即将 {diffMin}分</Tag>, badge: 'warning' };
    }
    if (diffMin <= 60) {
      return { tag: <Tag color="processing"><ClockCircleOutlined /> {diffMin}分钟后</Tag>, badge: 'processing' };
    }
    const hours = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    return { tag: <Tag color="blue">{hours}时{mins}分后</Tag>, badge: 'default' };
  };

  const filteredReminders = useMemo(() => {
    return reminders.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterType !== 'all' && r.type !== filterType) return false;
      const baby = babies.find(b => b.id === r.babyId);
      if (filterRoom !== 'all' && baby?.roomNumber !== filterRoom) return false;
      return true;
    });
  }, [reminders, filterStatus, filterType, filterRoom, babies]);

  const upcomingReminders = filteredReminders.filter(
    r => r.status === 'pending' && dayjs(r.scheduledTime).isAfter(dayjs())
  ).sort((a, b) => dayjs(a.scheduledTime).valueOf() - dayjs(b.scheduledTime).valueOf());

  const overdueReminders = filteredReminders.filter(
    r => (r.status === 'pending' && dayjs(r.scheduledTime).isBefore(dayjs())) || r.status === 'missed'
  ).sort((a, b) => dayjs(a.scheduledTime).valueOf() - dayjs(b.scheduledTime).valueOf());

  const completedToday = filteredReminders.filter(
    r => r.status === 'completed' && dayjs(r.completedAt).isSame(dayjs(), 'day')
  );

  const statsCards = [
    {
      title: '🔔 待办提醒',
      value: upcomingReminders.length,
      color: '#1677ff',
      children: (
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          {upcomingReminders.slice(0, 1).map(r => {
            const m = getBabyMap().get(r.babyId);
            return (
              <div key={r.id}>
                下一条: {m?.name || '-'} · {dayjs(r.scheduledTime).format('HH:mm')}
              </div>
            );
          })}
        </div>
      )
    },
    {
      title: '⚠️ 已超期/错过',
      value: overdueReminders.length,
      color: overdueReminders.length > 0 ? '#ff4d4f' : '#d9d9d9',
      children: (
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          {overdueReminders.length > 0 ? '请优先处理' : '当前无超期'}
        </div>
      )
    },
    {
      title: '✅ 今日已完成',
      value: completedToday.length,
      color: '#52c41a',
      children: (
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          完成率: {filteredReminders.filter(r => dayjs(r.scheduledTime).isSame(dayjs(), 'day')).length > 0
            ? Math.round((completedToday.length / filteredReminders.filter(r => dayjs(r.scheduledTime).isSame(dayjs(), 'day') && r.status !== 'cancelled').length) * 100) || 0
            : 0}%
        </div>
      )
    },
    {
      title: '👶 覆盖宝宝',
      value: new Set(upcomingReminders.map(r => r.babyId)).size,
      color: '#722ed1',
      children: (
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          共 {babies.length} 位在住
        </div>
      )
    }
  ];

  const columns = [
    {
      title: '宝宝',
      key: 'baby',
      width: 180,
      render: (_: any, r: Reminder) => {
        const m = getBabyMap().get(r.babyId);
        if (!m) return '-';
        return (
          <Space onClick={() => { setSelectedBaby(m); setActiveWindow('babyTimeline'); }} style={{ cursor: 'pointer' }}>
            <Avatar size={36} style={{
              background: m.gender === 'male'
                ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
              fontSize: 14
            }}>
              {m.name.charAt(0)}
            </Avatar>
            <div>
              <div style={{ fontWeight: 600 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: '#999' }}>{m.roomNumber}{m.bedNumber}</div>
            </div>
          </Space>
        );
      }
    },
    {
      title: '提醒类型',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (t: ReminderType) => {
        const opt = TYPE_OPTIONS.find(o => o.value === t);
        return (
          <Tag color={opt?.color} style={{ padding: '4px 10px', fontSize: 13 }}>
            {opt?.icon} {opt?.label || t}
          </Tag>
        );
      }
    },
    {
      title: '提醒内容',
      dataIndex: 'title',
      key: 'title',
      render: (v: string, r: Reminder) => (
        <div>
          <div style={{ fontWeight: 500 }}>{v}</div>
          {r.notes && <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>💬 {r.notes}</div>}
        </div>
      )
    },
    {
      title: '计划时间',
      dataIndex: 'scheduledTime',
      key: 'scheduled',
      width: 180,
      sorter: (a: Reminder, b: Reminder) =>
        dayjs(a.scheduledTime).valueOf() - dayjs(b.scheduledTime).valueOf(),
      render: (v: string, r: Reminder) => {
        const isOverdue = r.status === 'pending' && dayjs(v).isBefore(dayjs());
        return (
          <div>
            <div style={{
              fontWeight: 600,
              color: isOverdue ? '#ff4d4f' : '#333'
            }}>
              {dayjs(v).format('MM-DD HH:mm')}
            </div>
            {isOverdue && <div style={{ fontSize: 11, color: '#ff4d4f' }}>超期 {dayjs().diff(dayjs(v), 'minute')}分</div>}
          </div>
        );
      }
    },
    {
      title: '状态',
      key: 'status',
      width: 130,
      render: (_: any, r: Reminder) => getReminderStatus(r).tag
    },
    {
      title: '责任人',
      dataIndex: 'assignedTo',
      key: 'assigned',
      width: 100,
      render: (v: string) => v ? <span>👩‍⚕️ {v}</span> : '-'
    },
    {
      title: '操作',
      key: 'actions',
      width: 260,
      fixed: 'right' as const,
      render: (_: any, r: Reminder) => {
        const m = getBabyMap().get(r.babyId);
        return (
          <Space size="small">
            {r.status === 'pending' && r.type === 'feeding' && m && (
              <Tooltip title="去录入">
                <Button
                  type="primary"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  onClick={() => handleQuickFeed(r, m)}
                  style={{ background: '#ff85a2', border: 'none' }}
                >
                  录入
                </Button>
              </Tooltip>
            )}
            {r.status === 'pending' && (
              <Button
                size="small"
                icon={<CheckOutlined />}
                type="primary"
                ghost
                onClick={() => handleComplete(r)}
              >
                完成
              </Button>
            )}
            {r.status === 'pending' && (
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={() => handleCancel(r)}
              >
                取消
              </Button>
            )}
            <PopconfirmWrapper onConfirm={() => handleDelete(r.id!)}>
              <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </PopconfirmWrapper>
          </Space>
        );
      }
    }
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: 20,
        background: 'linear-gradient(135deg, #fffbe6 0%, #fff 100%)',
        borderBottom: '1px solid #f0f0f0'
      }}>
        <Row gutter={[16, 12]}>
          {statsCards.map((s, i) => (
            <Col xs={12} sm={6} key={i}>
              <Card size="small" style={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                {s.children}
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <Space wrap>
          <Select
            value={filterStatus}
            onChange={setFilterStatus}
            style={{ width: 130 }}
          >
            <Option value="all">全部状态</Option>
            <Option value="pending">⏳ 待完成</Option>
            <Option value="completed">✅ 已完成</Option>
            <Option value="missed">❌ 已错过</Option>
            <Option value="cancelled">取消</Option>
          </Select>
          <Select value={filterType} onChange={setFilterType} style={{ width: 130 }}>
            <Option value="all">全部类型</Option>
            {TYPE_OPTIONS.map(o => (
              <Option key={o.value} value={o.value}>{o.icon} {o.label}</Option>
            ))}
          </Select>
          <Select value={filterRoom} onChange={setFilterRoom} style={{ width: 120 }} allowClear>
            <Option value="all">全部房间</Option>
            {rooms.map(r => <Option key={r} value={r}>{r}室</Option>)}
          </Select>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={autoUpdateMissed}>刷新</Button>
          <Button icon={<BellOutlined />} onClick={() => openAddModal()}>
            新建提醒
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openBatchModal}
            style={{ background: 'linear-gradient(135deg, #ff85a2, #ff5c7a)', border: 'none' }}
          >
            批量创建喂养提醒
          </Button>
        </Space>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {overdueReminders.length > 0 && (
          <>
            <div style={{
              padding: '12px 16px',
              background: '#fff2f0',
              border: '1px solid #ffccc7',
              borderRadius: 8,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}>
              <ExclamationOutlined style={{ color: '#ff4d4f', fontSize: 20 }} />
              <div style={{ flex: 1 }}>
                <strong style={{ color: '#ff4d4f' }}>有 {overdueReminders.length} 条提醒已超期或错过，请优先处理：</strong>
                {overdueReminders.slice(0, 3).map(r => {
                  const m = getBabyMap().get(r.babyId);
                  return (
                    <Tag key={r.id} color="error" style={{ marginLeft: 8 }}>
                      {m?.name} · {r.title}
                    </Tag>
                  );
                })}
              </div>
            </div>
            <Divider style={{ margin: '0 0 16px 0' }} orientation="left">
              <span style={{ color: '#ff4d4f' }}>⚠️ 超期提醒</span>
            </Divider>
            <Table
              rowKey="id"
              size="middle"
              dataSource={overdueReminders}
              columns={columns}
              pagination={false}
              scroll={{ x: 1100 }}
              style={{ marginBottom: 24, background: '#fff7f6', borderRadius: 8 }}
              showHeader={false}
            />
          </>
        )}

        <Divider orientation="left" style={{ marginBottom: 16 }}>
          <span style={{ fontWeight: 600 }}>📋 所有提醒 ({filteredReminders.length})</span>
        </Divider>

        <Table
          rowKey="id"
          size="middle"
          dataSource={filteredReminders}
          columns={columns}
          locale={{ emptyText: <Empty description="暂无提醒，点击上方按钮创建" /> }}
          pagination={{
            pageSize: 15,
            showSizeChanger: true,
            showTotal: t => `共 ${t} 条提醒`
          }}
          scroll={{ x: 1100 }}
        />
      </div>

      <Modal
        title={editingReminder ? '编辑提醒' : '新建护理提醒'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={620}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="babyIds"
            label="选择宝宝 (可多选)"
            rules={[{ required: true, message: '请选择宝宝' }]}
          >
            <Select
              mode="multiple"
              placeholder="请选择宝宝"
              optionFilterProp="label"
              style={{ width: '100%' }}
            >
              {babies.map(b => (
                <Option key={b.id} value={b.id} label={`${b.name} ${b.roomNumber}${b.bedNumber}`}>
                  <Space>
                    <Avatar size="small" style={{
                      background: b.gender === 'male'
                        ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                        : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
                      fontSize: 12
                    }}>
                      {b.name.charAt(0)}
                    </Avatar>
                    <span>{b.name}</span>
                    <Tag color="default" style={{ margin: 0 }}>{b.roomNumber}{b.bedNumber}</Tag>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="type" label="提醒类型" rules={[{ required: true }]}>
                <Select>
                  {TYPE_OPTIONS.map(o => (
                    <Option key={o.value} value={o.value}>{o.icon} {o.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="title" label="提醒标题" rules={[{ required: true, message: '请输入标题' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="scheduledTime" label="计划时间" rules={[{ required: true }]}>
                <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="assignedTo" label="责任人">
                <Input prefix={<UserOutlined />} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="repeat" label="是否重复" initialValue="none">
                <Select>
                  <Option value="none">不重复</Option>
                  <Option value="hourly">每小时</Option>
                  <Option value="daily">每天</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                noStyle
                shouldUpdate={(p, c) => p.repeat !== c.repeat}
              >
                {({ getFieldValue }) => getFieldValue('repeat') !== 'none' && (
                  <Form.Item name="intervalMinutes" label="间隔(分钟)">
                    <InputNumber min={15} step={15} style={{ width: '100%' }} />
                  </Form.Item>
                )}
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="⚡ 批量创建喂养提醒"
        open={batchModalOpen}
        onOk={handleBatchSave}
        onCancel={() => setBatchModalOpen(false)}
        okText="批量创建"
        cancelText="取消"
        width={620}
      >
        <div style={{
          padding: 12,
          background: '#fff5f7',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
          color: '#666'
        }}>
          💡 <strong>使用说明：</strong>为所有选中的宝宝创建喂养提醒，可设置基础时间和每位宝宝之间的时间间隔，便于有序分批喂养。
        </div>
        <Form form={batchForm} layout="vertical">
          <Form.Item
            name="babyIds"
            label="选择宝宝 (默认全选)"
            rules={[{ required: true }]}
          >
            <Checkbox.Group style={{ width: '100%' }}>
              <Row gutter={[8, 8]}>
                {babies.map(b => (
                  <Col span={12} key={b.id}>
                    <Checkbox value={b.id} style={{ width: '100%', padding: '6px 8px', borderRadius: 6, background: '#fafafa' }}>
                      <Avatar size="small" style={{
                        background: b.gender === 'male'
                          ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                          : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
                        fontSize: 10,
                        marginRight: 6
                      }}>
                        {b.name.charAt(0)}
                      </Avatar>
                      <strong>{b.name}</strong>
                      <span style={{ color: '#999', marginLeft: 6, fontSize: 12 }}>
                        {b.roomNumber}{b.bedNumber}
                      </span>
                    </Checkbox>
                  </Col>
                ))}
              </Row>
            </Checkbox.Group>
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="type" label="提醒类型" rules={[{ required: true }]}>
                <Select>
                  {TYPE_OPTIONS.map(o => (
                    <Option key={o.value} value={o.value}>{o.icon} {o.label}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={16}>
              <Form.Item name="title" label="提醒标题" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="baseTime" label="起始时间 (第一位宝宝)" rules={[{ required: true }]}>
                <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="intervalMinutes" label="每位间隔(分钟)" initialValue={0} rules={[{ required: true }]}>
                <InputNumber
                  min={0} max={180} step={5}
                  style={{ width: '100%' }}
                  addonAfter="分钟"
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="统一备注">
            <TextArea rows={2} placeholder="可填写预计奶量、特殊要求等" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

const PopconfirmWrapper: React.FC<{
  onConfirm: () => void;
  children: React.ReactElement;
}> = ({ onConfirm, children }) => {
  const [open, setOpen] = useState(false);
  return React.cloneElement(children, {
    onClick: (e: any) => {
      e.stopPropagation();
      Modal.confirm({
        title: '确认删除?',
        content: '删除后不可恢复',
        okText: '确认删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: onConfirm
      });
    }
  });
};

export default CareReminder;
