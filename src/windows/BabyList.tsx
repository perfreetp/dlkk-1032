import React, { useEffect, useState } from 'react';
import {
  Table, Button, Space, Tag, Input, Select, Modal, Form, InputNumber,
  DatePicker, Radio, message, Popconfirm, Row, Col, Tooltip
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { db } from '../db';
import { Baby, BabyGender, BabyStatus } from '../types';
import { useAppStore } from '../store/appStore';
import { calculateAgeDays, formatWeight } from '../utils';

const { Option } = Select;
const { TextArea } = Input;

const BabyList: React.FC = () => {
  const { setSelectedBaby, setActiveWindow, currentNurse } = useAppStore();
  const [babies, setBabies] = useState<Baby[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterRoom, setFilterRoom] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBaby, setEditingBaby] = useState<Baby | null>(null);
  const [form] = Form.useForm();
  const [rooms, setRooms] = useState<string[]>([]);

  useEffect(() => {
    loadBabies();
  }, []);

  useEffect(() => {
    const unique = Array.from(new Set(babies.map(b => b.roomNumber))).sort();
    setRooms(unique);
  }, [babies]);

  const loadBabies = async () => {
    setLoading(true);
    try {
      const list = await db.babies.toArray();
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setBabies(list);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingBaby(null);
    form.resetFields();
    form.setFieldsValue({
      gender: 'male',
      status: 'active',
      admissionDate: dayjs(),
      birthDate: dayjs()
    });
    setModalOpen(true);
  };

  const handleEdit = (baby: Baby) => {
    setEditingBaby(baby);
    form.setFieldsValue({
      ...baby,
      birthDate: dayjs(baby.birthDate),
      admissionDate: dayjs(baby.admissionDate)
    });
    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await db.babies.delete(id);
      message.success('删除成功');
      loadBabies();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const now = new Date().toISOString();
      const data = {
        ...values,
        birthDate: values.birthDate.format('YYYY-MM-DD'),
        admissionDate: values.admissionDate.format('YYYY-MM-DD'),
        updatedAt: now
      };

      if (editingBaby) {
        await db.babies.update(editingBaby.id!, data);
        message.success('修改成功');
      } else {
        data.createdAt = now;
        await db.babies.add(data);
        message.success('添加成功');
      }
      setModalOpen(false);
      loadBabies();
    } catch (err) {
      console.error(err);
    }
  };

  const handleView = (baby: Baby) => {
    setSelectedBaby(baby);
    setActiveWindow('babyTimeline');
  };

  const filteredBabies = babies.filter(b => {
    if (filterRoom !== 'all' && b.roomNumber !== filterRoom) return false;
    if (filterStatus !== 'all' && b.status !== filterStatus) return false;
    if (searchText) {
      const lower = searchText.toLowerCase();
      return (
        b.name.toLowerCase().includes(lower) ||
        b.motherName.toLowerCase().includes(lower) ||
        b.roomNumber.includes(searchText)
      );
    }
    return true;
  });

  const columns = [
    {
      title: '宝宝信息',
      key: 'baby',
      render: (_: any, r: Baby) => (
        <Space>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: r.gender === 'male'
              ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
              : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 16
          }}>
            {r.name.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: '#222' }}>
              {r.name}
              <Tag style={{ marginLeft: 8 }} color={r.gender === 'male' ? 'blue' : 'pink'}>
                {r.gender === 'male' ? '男' : '女'}
              </Tag>
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
              妈妈: {r.motherName}
            </div>
          </div>
        </Space>
      ),
      width: 220
    },
    {
      title: '床位',
      dataIndex: 'roomNumber',
      key: 'room',
      render: (_: any, r: Baby) => (
        <Tag color="purple" style={{ fontSize: 14, padding: '4px 12px' }}>
          {r.roomNumber}室 {r.bedNumber}床
        </Tag>
      ),
      sorter: (a: Baby, b: Baby) => a.roomNumber.localeCompare(b.roomNumber)
    },
    {
      title: '出生信息',
      key: 'birth',
      render: (_: any, r: Baby) => (
        <div>
          <div>🎂 {r.birthDate}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
            {calculateAgeDays(r.birthDate)}天 · 出生 {formatWeight(r.birthWeight)}
          </div>
        </div>
      )
    },
    {
      title: '入住日期',
      dataIndex: 'admissionDate',
      key: 'admission',
      render: (v: string) => dayjs(v).format('YYYY-MM-DD')
    },
    {
      title: '过敏史',
      dataIndex: 'allergies',
      key: 'allergies',
      render: (v: string) => v ? (
        <Tooltip title={v}>
          <Tag color="red">{v}</Tag>
        </Tooltip>
      ) : <Tag color="green">无</Tag>
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (v: BabyStatus) => {
        const map: Record<BabyStatus, { color: string; label: string }> = {
          active: { color: 'green', label: '在住' },
          discharged: { color: 'default', label: '已出院' },
          suspended: { color: 'orange', label: '暂停' }
        };
        return <Tag color={map[v].color}>{map[v].label}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      fixed: 'right' as const,
      render: (_: any, r: Baby) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(r)}>
            查看
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(r)}>
            编辑
          </Button>
          <Popconfirm title="确认删除?" onConfirm={() => handleDelete(r.id!)}>
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 20, borderBottom: '1px solid #f0f0f0' }}>
        <Row gutter={[16, 12]} align="middle">
          <Col flex="auto">
            <Space wrap>
              <Input
                prefix={<SearchOutlined />}
                placeholder="搜索宝宝姓名/妈妈/房间号"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ width: 280 }}
                allowClear
              />
              <Select
                placeholder="筛选房间"
                value={filterRoom}
                onChange={setFilterRoom}
                style={{ width: 150 }}
                allowClear
              >
                <Option value="all">全部房间</Option>
                {rooms.map(r => <Option key={r} value={r}>{r}室</Option>)}
              </Select>
              <Select
                placeholder="筛选状态"
                value={filterStatus}
                onChange={setFilterStatus}
                style={{ width: 120 }}
              >
                <Option value="all">全部状态</Option>
                <Option value="active">在住</Option>
                <Option value="discharged">已出院</Option>
                <Option value="suspended">暂停</Option>
              </Select>
            </Space>
          </Col>
          <Col>
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} size="large">
              新增宝宝
            </Button>
          </Col>
        </Row>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filteredBabies}
          columns={columns}
          pagination={{
            showSizeChanger: true,
            showTotal: t => `共 ${t} 位宝宝`
          }}
          scroll={{ x: 1100 }}
          size="middle"
        />
      </div>

      <Modal
        title={editingBaby ? '编辑宝宝信息' : '新增宝宝'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={640}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="宝宝姓名"
                rules={[{ required: true, message: '请输入宝宝姓名' }]}
              >
                <Input placeholder="请输入宝宝姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="gender"
                label="性别"
                rules={[{ required: true }]}
              >
                <Radio.Group>
                  <Radio value="male">👦 男</Radio>
                  <Radio value="female">👧 女</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="motherName"
                label="妈妈姓名"
                rules={[{ required: true, message: '请输入妈妈姓名' }]}
              >
                <Input placeholder="请输入妈妈姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="birthDate"
                label="出生日期"
                rules={[{ required: true, message: '请选择出生日期' }]}
              >
                <DatePicker style={{ width: '100%' }} maxDate={dayjs()} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="birthWeight"
                label="出生体重 (kg)"
                rules={[{ required: true, message: '请输入出生体重' }]}
              >
                <InputNumber min={0.5} max={8} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="admissionDate"
                label="入住日期"
                rules={[{ required: true, message: '请选择入住日期' }]}
              >
                <DatePicker style={{ width: '100%' }} maxDate={dayjs()} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="roomNumber"
                label="房间号"
                rules={[{ required: true, message: '请输入房间号' }]}
              >
                <Input placeholder="如: 201" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="bedNumber"
                label="床位号"
                rules={[{ required: true, message: '请输入床位号' }]}
              >
                <Input placeholder="如: A" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="状态" initialValue="active">
                <Select>
                  <Option value="active">在住</Option>
                  <Option value="suspended">暂停</Option>
                  <Option value="discharged">已出院</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="allergies" label="过敏史">
                <Input placeholder="如: 牛奶蛋白过敏" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="notes" label="特殊备注">
                <TextArea rows={2} placeholder="特殊护理需求等" />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ fontSize: 12, color: '#888', padding: '8px 12px', background: '#f5f5f5', borderRadius: 6 }}>
            <strong>记录人:</strong> {currentNurse}
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default BabyList;
