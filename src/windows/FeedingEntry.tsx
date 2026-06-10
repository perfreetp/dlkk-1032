import React, { useState, useEffect } from 'react';
import {
  Tabs, Form, Input, InputNumber, DatePicker, TimePicker, Radio, Select,
  Switch, Button, Space, Card, Row, Col, Divider, Upload, message,
  Checkbox, Empty, Avatar, Tag, Rate, Slider, Tooltip, App
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, CameraOutlined,
  SaveOutlined, ThunderboltOutlined, CheckCircleOutlined
} from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import dayjs from 'dayjs';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { db } from '../db';
import { Baby, FeedingType, FeedingSide } from '../types';
import { useAppStore } from '../store/appStore';
import {
  calculateAgeDays, formatWeight, formatTemperature, getBabyFeedingStats
} from '../utils';

const { Option } = Select;
const { TextArea } = Input;
const { RangePicker } = TimePicker;

const FeedingEntry: React.FC = () => {
  const {
    selectedBaby, setSelectedBaby, currentNurse,
    addNotification, setActiveWindow
  } = useAppStore();
  const { modal } = App.useApp();

  const [activeTab, setActiveTab] = useState('feeding');
  const [feedingForm] = Form.useForm();
  const [diaperForm] = Form.useForm();
  const [sleepForm] = Form.useForm();
  const [tempForm] = Form.useForm();
  const [weightForm] = Form.useForm();
  const [foodForm] = Form.useForm();
  const [cryingForm] = Form.useForm();

  const [feedingPhotos, setFeedingPhotos] = useState<string[]>([]);
  const [foodPhotos, setFoodPhotos] = useState<string[]>([]);

  const [quickStats, setQuickStats] = useState<any>(null);

  const babies = useLiveQuery(
    () => db.babies.where('status').equals('active').sortBy('roomNumber'),
    [], []
  ) as Baby[];

  useEffect(() => {
    resetForms();
  }, [selectedBaby?.id]);

  useEffect(() => {
    if (selectedBaby?.id) {
      getBabyFeedingStats(selectedBaby.id, new Date().toISOString().split('T')[0])
        .then(setQuickStats);
    }
  }, [selectedBaby?.id, activeTab]);

  const resetForms = () => {
    const now = dayjs();
    feedingForm.resetFields();
    feedingForm.setFieldsValue({
      type: 'breast',
      startTime: now,
      burped: false,
      spitUp: false,
      caregiver: currentNurse
    });
    diaperForm.resetFields();
    diaperForm.setFieldsValue({
      time: now,
      type: 'wet',
      caregiver: currentNurse
    });
    sleepForm.resetFields();
    sleepForm.setFieldsValue({
      startTime: now,
      interrupted: false,
      caregiver: currentNurse
    });
    tempForm.resetFields();
    tempForm.setFieldsValue({
      time: now,
      location: 'axillary',
      caregiver: currentNurse
    });
    weightForm.resetFields();
    weightForm.setFieldsValue({
      time: now,
      diaperRemoved: true,
      clothing: '单层内衣',
      caregiver: currentNurse
    });
    foodForm.resetFields();
    foodForm.setFieldsValue({
      time: now,
      reaction: 'none',
      unit: 'g',
      caregiver: currentNurse
    });
    cryingForm.resetFields();
    cryingForm.setFieldsValue({
      startTime: now,
      severity: 'mild',
      soothed: true,
      caregiver: currentNurse
    });
    setFeedingPhotos([]);
    setFoodPhotos([]);
  };

  const handleImageUpload = async (target: 'feeding' | 'food') => {
    try {
      let filePath: string | null = null;
      if ((window as any).electronAPI?.openImageDialog) {
        filePath = await (window as any).electronAPI.openImageDialog();
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        const promise = new Promise<string | null>(resolve => {
          input.onchange = () => {
            const file = input.files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            } else resolve(null);
          };
        });
        input.click();
        filePath = await promise;
      }

      if (filePath) {
        if (target === 'feeding') {
          setFeedingPhotos(p => [...p, filePath!]);
        } else {
          setFoodPhotos(p => [...p, filePath!]);
        }
        message.success('图片已添加');
      }
    } catch (err) {
      message.error('图片添加失败');
    }
  };

  const saveFeeding = async () => {
    try {
      const values = await feedingForm.validateFields();
      if (!selectedBaby) {
        message.warning('请先选择宝宝');
        return;
      }

      const data = {
        ...values,
        babyId: selectedBaby.id!,
        startTime: values.startTime.toDate().toISOString(),
        endTime: values.endTime ? values.endTime.toDate().toISOString() : undefined,
        photos: feedingPhotos.length > 0 ? feedingPhotos : undefined,
        createdAt: new Date().toISOString()
      };
      delete data.endTime_str;

      await db.feedingRecords.add(data);
      addNotification(`喂养记录已保存 · ${selectedBaby.name}`, 'success');

      const nextFeed = dayjs(values.startTime.toDate()).add(3, 'hour');
      await db.reminders.add({
        babyId: selectedBaby.id!,
        type: 'feeding',
        title: '下次喂养',
        scheduledTime: nextFeed.toISOString(),
        status: 'pending',
        repeat: 'none',
        assignedTo: currentNurse,
        notes: `上次喂养: ${values.type === 'breast' ? '亲喂' : values.amount + 'ml'}`,
        createdAt: new Date().toISOString()
      });

      feedingForm.resetFields();
      setFeedingPhotos([]);
      feedingForm.setFieldsValue({
        type: 'breast',
        startTime: dayjs(),
        burped: false,
        spitUp: false,
        caregiver: currentNurse
      });
      setQuickStats(await getBabyFeedingStats(selectedBaby.id!, new Date().toISOString().split('T')[0]));
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error('保存失败');
    }
  };

  const saveDiaper = async () => {
    try {
      const values = await diaperForm.validateFields();
      if (!selectedBaby) { message.warning('请先选择宝宝'); return; }
      await db.diaperRecords.add({
        ...values,
        babyId: selectedBaby.id!,
        time: values.time.toDate().toISOString(),
        createdAt: new Date().toISOString()
      });
      addNotification(`尿布记录已保存 · ${selectedBaby.name}`, 'success');
      diaperForm.resetFields();
      diaperForm.setFieldsValue({
        time: dayjs(), type: 'wet', caregiver: currentNurse
      });
    } catch (err: any) {
      if (err?.errorFields) return;
    }
  };

  const saveSleep = async () => {
    try {
      const values = await sleepForm.validateFields();
      if (!selectedBaby) { message.warning('请先选择宝宝'); return; }
      await db.sleepRecords.add({
        ...values,
        babyId: selectedBaby.id!,
        startTime: values.startTime.toDate().toISOString(),
        endTime: values.endTime ? values.endTime.toDate().toISOString() : undefined,
        createdAt: new Date().toISOString()
      });
      addNotification(`睡眠记录已保存 · ${selectedBaby.name}`, 'success');
      sleepForm.resetFields();
      sleepForm.setFieldsValue({
        startTime: dayjs(), interrupted: false, caregiver: currentNurse
      });
    } catch (err: any) {
      if (err?.errorFields) return;
    }
  };

  const saveTemp = async () => {
    try {
      const values = await tempForm.validateFields();
      if (!selectedBaby) { message.warning('请先选择宝宝'); return; }
      await db.temperatureRecords.add({
        ...values,
        babyId: selectedBaby.id!,
        time: values.time.toDate().toISOString(),
        createdAt: new Date().toISOString()
      });
      const t = values.temperature;
      if (t > 37.4) {
        addNotification(`⚠️ ${selectedBaby.name} 体温偏高: ${t.toFixed(1)}°C`, 'warning');
      } else if (t < 36) {
        addNotification(`⚠️ ${selectedBaby.name} 体温偏低: ${t.toFixed(1)}°C`, 'warning');
      } else {
        addNotification(`体温记录已保存 · ${selectedBaby.name}`, 'success');
      }
      tempForm.resetFields();
      tempForm.setFieldsValue({
        time: dayjs(), location: 'axillary', caregiver: currentNurse
      });
    } catch (err: any) {
      if (err?.errorFields) return;
    }
  };

  const saveWeight = async () => {
    try {
      const values = await weightForm.validateFields();
      if (!selectedBaby) { message.warning('请先选择宝宝'); return; }
      await db.weightRecords.add({
        ...values,
        babyId: selectedBaby.id!,
        time: values.time.toDate().toISOString(),
        createdAt: new Date().toISOString()
      });
      addNotification(`体重记录已保存 · ${selectedBaby.name}`, 'success');
      weightForm.resetFields();
      weightForm.setFieldsValue({
        time: dayjs(), diaperRemoved: true, clothing: '单层内衣', caregiver: currentNurse
      });
    } catch (err: any) {
      if (err?.errorFields) return;
    }
  };

  const saveFood = async () => {
    try {
      const values = await foodForm.validateFields();
      if (!selectedBaby) { message.warning('请先选择宝宝'); return; }
      await db.foodRecords.add({
        ...values,
        babyId: selectedBaby.id!,
        time: values.time.toDate().toISOString(),
        photos: foodPhotos.length > 0 ? foodPhotos : undefined,
        createdAt: new Date().toISOString()
      });
      if (values.reaction === 'allergy') {
        addNotification(`⚠️ ${selectedBaby.name} 添加辅食出现过敏反应！`, 'error');
      } else {
        addNotification(`辅食记录已保存 · ${selectedBaby.name}`, 'success');
      }
      foodForm.resetFields();
      setFoodPhotos([]);
      foodForm.setFieldsValue({
        time: dayjs(), reaction: 'none', unit: 'g', caregiver: currentNurse
      });
    } catch (err: any) {
      if (err?.errorFields) return;
    }
  };

  const saveCrying = async () => {
    try {
      const values = await cryingForm.validateFields();
      if (!selectedBaby) { message.warning('请先选择宝宝'); return; }
      await db.cryingRecords.add({
        ...values,
        babyId: selectedBaby.id!,
        startTime: values.startTime.toDate().toISOString(),
        endTime: values.endTime ? values.endTime.toDate().toISOString() : undefined,
        createdAt: new Date().toISOString()
      });
      addNotification(`哭闹记录已保存 · ${selectedBaby.name}`, 'success');
      cryingForm.resetFields();
      cryingForm.setFieldsValue({
        startTime: dayjs(), severity: 'mild', soothed: true, caregiver: currentNurse
      });
    } catch (err: any) {
      if (err?.errorFields) return;
    }
  };

  if (!selectedBaby) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40
      }}>
        <Empty
          description={
            <div>
              <div style={{ fontSize: 16, marginBottom: 16 }}>请先选择一位宝宝再录入护理记录</div>
              <Space wrap style={{ justifyContent: 'center' }}>
                {babies.map(b => (
                  <Card
                    key={b.id}
                    hoverable
                    size="small"
                    onClick={() => setSelectedBaby(b)}
                    style={{ width: 160 }}
                  >
                    <Space direction="vertical" style={{ width: '100%', textAlign: 'center' }}>
                      <Avatar
                        style={{
                          background: b.gender === 'male'
                            ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                            : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
                          margin: '0 auto'
                        }}
                        size={48}
                      >
                        {b.name.charAt(0)}
                      </Avatar>
                      <div style={{ fontWeight: 600 }}>{b.name}</div>
                      <div style={{ fontSize: 12, color: '#999' }}>
                        {b.roomNumber}{b.bedNumber} · {calculateAgeDays(b.birthDate)}天
                      </div>
                    </Space>
                  </Card>
                ))}
              </Space>
            </div>
          }
        />
      </div>
    );
  }

  const renderBabyHeader = () => (
    <div style={{
      padding: 20,
      background: 'linear-gradient(135deg, #fff5f7 0%, #fff 100%)',
      borderBottom: '1px solid #f0f0f0',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 16
    }}>
      <Space size="large" align="center">
        <Select
          style={{ width: 200 }}
          value={selectedBaby.id}
          onChange={id => {
            const b = babies.find(x => x.id === id);
            if (b) setSelectedBaby(b);
          }}
          showSearch
          optionFilterProp="label"
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
                <Tag color="purple" style={{ margin: 0 }}>{b.roomNumber}{b.bedNumber}</Tag>
                <span style={{ color: '#999', fontSize: 12 }}>
                  {calculateAgeDays(b.birthDate)}天 · 出生{formatWeight(b.birthWeight)}
                </span>
              </Space>
            </Option>
          ))}
        </Select>

        {selectedBaby.allergies && (
          <Tag color="error" icon={<span>⚠️</span>}>
            {selectedBaby.allergies}
          </Tag>
        )}
        {selectedBaby.notes && (
          <Tooltip title={selectedBaby.notes}>
            <Tag color="warning">📝 护理备注</Tag>
          </Tooltip>
        )}
      </Space>

      {quickStats && (
        <Space size="large">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#999' }}>今日喂养</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1677ff' }}>
              {quickStats.count}次
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#999' }}>总奶量</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#52c41a' }}>
              {quickStats.totalBottleAmount || quickStats.totalBreastDuration
                ? quickStats.totalBottleAmount ? `${quickStats.totalBottleAmount}ml` : `${quickStats.totalBreastDuration}分`
                : '-'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#999' }}>距上次</div>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: quickStats.minutesSinceLast && quickStats.minutesSinceLast > (quickStats.avgInterval || 180)
                ? '#ff4d4f' : '#722ed1'
            }}>
              {quickStats.minutesSinceLast
                ? `${Math.floor(quickStats.minutesSinceLast / 60)}h${quickStats.minutesSinceLast % 60}m`
                : '-'}
            </div>
          </div>
        </Space>
      )}
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {renderBabyHeader()}

      <div style={{ flex: 1, overflow: 'auto' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          size="large"
          style={{ padding: '0 20px' }}
          tabBarStyle={{ margin: 0, paddingTop: 16 }}
          items={[
            {
              key: 'feeding',
              label: <span>🍼 喂养记录</span>,
              children: (
                <Card bordered={false} bodyStyle={{ padding: 24 }}>
                  <Form form={feedingForm} layout="vertical">
                    <div className="form-section-title">🍼 喂养方式</div>
                    <Row gutter={24}>
                      <Col span={12}>
                        <Form.Item name="type" label="喂养类型" rules={[{ required: true }]}>
                          <Radio.Group size="large">
                            <Radio.Button value="breast">🤱 亲喂母乳</Radio.Button>
                            <Radio.Button value="bottle_breast">🍼 瓶喂母乳</Radio.Button>
                            <Radio.Button value="formula">🥛 配方奶</Radio.Button>
                            <Radio.Button value="mixed">🔀 混合喂养</Radio.Button>
                          </Radio.Group>
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="startTime" label="开始时间" rules={[{ required: true }]}>
                          <DatePicker
                            showTime
                            style={{ width: '100%' }}
                            format="YYYY-MM-DD HH:mm"
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item
                      noStyle
                      shouldUpdate={(p, c) => p.type !== c.type}
                    >
                      {({ getFieldValue }) => {
                        const type: FeedingType = getFieldValue('type');
                        const needBreast = type === 'breast' || type === 'mixed';
                        const needBottle = type === 'bottle_breast' || type === 'formula' || type === 'mixed';
                        return (
                          <>
                            {needBreast && (
                              <>
                                <div className="form-section-title">🤱 亲喂细节</div>
                                <Row gutter={24}>
                                  <Col span={12}>
                                    <Form.Item name="side" label="哺乳侧">
                                      <Radio.Group>
                                        <Radio value="left">左侧</Radio>
                                        <Radio value="right">右侧</Radio>
                                        <Radio value="both">双侧</Radio>
                                      </Radio.Group>
                                    </Form.Item>
                                  </Col>
                                  <Col span={6}>
                                    <Form.Item name="leftDuration" label="左侧时长(分钟)">
                                      <InputNumber min={0} max={120} style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                  <Col span={6}>
                                    <Form.Item name="rightDuration" label="右侧时长(分钟)">
                                      <InputNumber min={0} max={120} style={{ width: '100%' }} />
                                    </Form.Item>
                                  </Col>
                                </Row>
                              </>
                            )}

                            {needBottle && (
                              <>
                                <div className="form-section-title">🍼 瓶喂细节</div>
                                <Row gutter={24}>
                                  <Col span={8}>
                                    <Form.Item
                                      name="amount"
                                      label="奶量 (ml)"
                                      rules={[{ required: needBottle && type !== 'mixed', message: '请输入奶量' }]}
                                    >
                                      <InputNumber
                                        min={10} max={300} step={5}
                                        style={{ width: '100%' }}
                                        placeholder="如: 80"
                                      />
                                    </Form.Item>
                                  </Col>
                                  {type === 'formula' && (
                                    <Col span={8}>
                                      <Form.Item name="formulaBrand" label="奶粉品牌">
                                        <Input placeholder="如: 爱他美、美赞臣" />
                                      </Form.Item>
                                    </Col>
                                  )}
                                  <Col span={8}>
                                    <Form.Item name="waterTemp" label="水温 (°C)">
                                      <InputNumber min={35} max={60} step={1} style={{ width: '100%' }} placeholder="建议40-45°C" />
                                    </Form.Item>
                                  </Col>
                                </Row>
                              </>
                            )}
                          </>
                        );
                      }}
                    </Form.Item>

                    <div className="form-section-title">🤗 拍嗝与吐奶</div>
                    <Row gutter={24}>
                      <Col span={8}>
                        <Form.Item name="burped" label="是否拍嗝" valuePropName="checked">
                          <Switch checkedChildren="已拍" unCheckedChildren="未拍" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          noStyle
                          shouldUpdate={(p, c) => p.burped !== c.burped}
                        >
                          {({ getFieldValue }) => getFieldValue('burped') && (
                            <Form.Item name="burpDuration" label="拍嗝时长(分钟)">
                              <InputNumber min={1} max={30} style={{ width: '100%' }} />
                            </Form.Item>
                          )}
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="spitUp" label="是否吐奶/溢奶" valuePropName="checked">
                          <Switch checkedChildren="有" unCheckedChildren="无" />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Form.Item
                      noStyle
                      shouldUpdate={(p, c) => p.spitUp !== c.spitUp}
                    >
                      {({ getFieldValue }) => getFieldValue('spitUp') && (
                        <Row gutter={24}>
                          <Col span={12}>
                            <Form.Item name="spitUpAmount" label="吐奶量">
                              <Radio.Group>
                                <Radio value="small">少量（溢奶）</Radio>
                                <Radio value="medium">中量</Radio>
                                <Radio value="large">大量（喷射）</Radio>
                              </Radio.Group>
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="spitUpNotes" label="补充说明">
                              <Input placeholder="颜色、性状、宝宝反应等" />
                            </Form.Item>
                          </Col>
                        </Row>
                      )}
                    </Form.Item>

                    <div className="form-section-title">📷 照片凭证 (可选)</div>
                    <div className="photo-grid" style={{ marginBottom: 24 }}>
                      {feedingPhotos.map((p, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img src={p} alt="" />
                          <Button
                            type="primary"
                            danger
                            size="small"
                            shape="circle"
                            icon={<DeleteOutlined />}
                            style={{ position: 'absolute', top: 2, right: 2 }}
                            onClick={() => setFeedingPhotos(ps => ps.filter((_, idx) => idx !== i))}
                          />
                        </div>
                      ))}
                      <div className="photo-upload-btn" onClick={() => handleImageUpload('feeding')}>
                        <CameraOutlined style={{ fontSize: 20 }} />
                        <span>添加照片</span>
                      </div>
                    </div>

                    <div className="form-section-title">📝 备注信息</div>
                    <Row gutter={24}>
                      <Col span={16}>
                        <Form.Item name="notes" label="护理备注">
                          <TextArea rows={3} placeholder="吃奶过程、精神状态、特殊情况等" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          name="caregiver"
                          label="记录护士"
                          rules={[{ required: true, message: '请输入护士姓名' }]}
                        >
                          <Input prefix={<span>👩‍⚕️</span>} />
                        </Form.Item>
                      </Col>
                    </Row>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                      <Button size="large" onClick={resetForms}>
                        重置表单
                      </Button>
                      <Button
                        type="primary"
                        size="large"
                        icon={<SaveOutlined />}
                        onClick={saveFeeding}
                        style={{
                          background: 'linear-gradient(135deg, #ff85a2, #ff5c7a)',
                          border: 'none',
                          minWidth: 140
                        }}
                      >
                        保存喂养记录
                      </Button>
                    </div>
                  </Form>
                </Card>
              )
            },
            {
              key: 'diaper',
              label: <span>🧷 尿布更换</span>,
              children: (
                <Card bordered={false} bodyStyle={{ padding: 24 }}>
                  <Form form={diaperForm} layout="vertical">
                    <Row gutter={24}>
                      <Col span={12}>
                        <Form.Item name="time" label="更换时间" rules={[{ required: true }]}>
                          <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                          <Radio.Group size="large">
                            <Radio.Button value="wet">💧 仅排尿</Radio.Button>
                            <Radio.Button value="stool">💩 仅排便</Radio.Button>
                            <Radio.Button value="both">💧💩 尿便混合</Radio.Button>
                          </Radio.Group>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item
                      noStyle
                      shouldUpdate={(p, c) => p.type !== c.type}
                    >
                      {({ getFieldValue }) => {
                        const t = getFieldValue('type');
                        const showStool = t === 'stool' || t === 'both';
                        return showStool ? (
                          <Row gutter={24}>
                            <Col span={8}>
                              <Form.Item name="stoolColor" label="便色">
                                <Select placeholder="选择便色">
                                  <Option value="金黄色">金黄色</Option>
                                  <Option value="黄褐色">黄褐色</Option>
                                  <Option value="绿色">绿色</Option>
                                  <Option value="灰色">灰白色</Option>
                                  <Option value="黑色">黑色</Option>
                                  <Option value="带血丝">带血丝</Option>
                                </Select>
                              </Form.Item>
                            </Col>
                            <Col span={8}>
                              <Form.Item name="stoolConsistency" label="性状">
                                <Radio.Group>
                                  <Radio value="normal">正常糊状</Radio>
                                  <Radio value="loose">稀软</Radio>
                                  <Radio value="hard">干硬</Radio>
                                  <Radio value="watery">水样</Radio>
                                </Radio.Group>
                              </Form.Item>
                            </Col>
                            <Col span={8}>
                              <Form.Item name="amount" label="量">
                                <Radio.Group>
                                  <Radio value="small">少量</Radio>
                                  <Radio value="medium">中量</Radio>
                                  <Radio value="large">大量</Radio>
                                </Radio.Group>
                              </Form.Item>
                            </Col>
                          </Row>
                        ) : null;
                      }}
                    </Form.Item>
                    <Row gutter={24}>
                      <Col span={16}>
                        <Form.Item name="notes" label="备注">
                          <Input placeholder="臀部皮肤情况、异常情况等" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="caregiver" label="记录护士" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                      <Button type="primary" size="large" icon={<SaveOutlined />} onClick={saveDiaper}>
                        保存尿布记录
                      </Button>
                    </div>
                  </Form>
                </Card>
              )
            },
            {
              key: 'sleep',
              label: <span>😴 睡眠记录</span>,
              children: (
                <Card bordered={false} bodyStyle={{ padding: 24 }}>
                  <Form form={sleepForm} layout="vertical">
                    <Row gutter={24}>
                      <Col span={12}>
                        <Form.Item name="startTime" label="入睡时间" rules={[{ required: true }]}>
                          <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="endTime" label="睡醒时间">
                          <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={24}>
                      <Col span={12}>
                        <Form.Item name="quality" label="睡眠质量">
                          <Radio.Group style={{ width: '100%' }}>
                            <Radio.Button value="poor" style={{ width: '33.33%', textAlign: 'center' }}>😴 差</Radio.Button>
                            <Radio.Button value="fair" style={{ width: '33.33%', textAlign: 'center' }}>😌 一般</Radio.Button>
                            <Radio.Button value="good" style={{ width: '33.33%', textAlign: 'center' }}>😊 好</Radio.Button>
                          </Radio.Group>
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="interrupted" label="是否中断" valuePropName="checked">
                          <Switch />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item
                      noStyle
                      shouldUpdate={(p, c) => p.interrupted !== c.interrupted}
                    >
                      {({ getFieldValue }) => getFieldValue('interrupted') ? (
                        <Form.Item name="interruptReasons" label="中断原因">
                          <Checkbox.Group options={['饥饿', '尿布湿了', '惊醒', '身体不适', '环境噪音', '其他']} />
                        </Form.Item>
                      ) : null}
                    </Form.Item>
                    <Row gutter={24}>
                      <Col span={16}>
                        <Form.Item name="notes" label="备注">
                          <Input placeholder="睡眠环境、安抚方式等" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="caregiver" label="记录护士" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                      <Button type="primary" size="large" icon={<SaveOutlined />} onClick={saveSleep}>
                        保存睡眠记录
                      </Button>
                    </div>
                  </Form>
                </Card>
              )
            },
            {
              key: 'temperature',
              label: <span>🌡️ 体温记录</span>,
              children: (
                <Card bordered={false} bodyStyle={{ padding: 24 }}>
                  <Form form={tempForm} layout="vertical">
                    <Row gutter={24}>
                      <Col span={8}>
                        <Form.Item name="time" label="测量时间" rules={[{ required: true }]}>
                          <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="temperature" label="体温 (°C)" rules={[{ required: true }]}>
                          <InputNumber
                            min={34} max={42} step={0.1}
                            style={{ width: '100%', fontSize: 20 }}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="location" label="测量部位" rules={[{ required: true }]}>
                          <Select>
                            <Option value="axillary">腋下</Option>
                            <Option value="oral">口腔</Option>
                            <Option value="rectal">肛门</Option>
                            <Option value="forehead">额温</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={24}>
                      <Col span={16}>
                        <Form.Item name="notes" label="备注">
                          <Input placeholder="测量时状态、处理措施等" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="caregiver" label="记录护士" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                      <Button type="primary" size="large" icon={<SaveOutlined />} onClick={saveTemp}>
                        保存体温记录
                      </Button>
                    </div>
                  </Form>
                </Card>
              )
            },
            {
              key: 'weight',
              label: <span>⚖️ 体重记录</span>,
              children: (
                <Card bordered={false} bodyStyle={{ padding: 24 }}>
                  <Form form={weightForm} layout="vertical">
                    <Row gutter={24}>
                      <Col span={8}>
                        <Form.Item name="time" label="测量时间" rules={[{ required: true }]}>
                          <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="weight" label="体重 (kg)" rules={[{ required: true }]}>
                          <InputNumber
                            min={0.5} max={20} step={0.01}
                            style={{ width: '100%', fontSize: 20 }}
                          />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="diaperRemoved" label="是否去除尿布" valuePropName="checked">
                          <Switch checkedChildren="是" unCheckedChildren="否" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={24}>
                      <Col span={16}>
                        <Form.Item name="clothing" label="穿着衣物">
                          <Select mode="tags" placeholder="选择或输入衣物情况">
                            <Option value="裸体">裸体</Option>
                            <Option value="单层内衣">单层内衣</Option>
                            <Option value="和尚服+包被">和尚服+包被</Option>
                            <Option value="连体衣">连体衣</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="caregiver" label="记录护士" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="notes" label="备注">
                      <Input placeholder="体重变化分析、喂养建议等" />
                    </Form.Item>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                      <Button type="primary" size="large" icon={<SaveOutlined />} onClick={saveWeight}>
                        保存体重记录
                      </Button>
                    </div>
                  </Form>
                </Card>
              )
            },
            {
              key: 'food',
              label: <span>🥣 辅食尝试</span>,
              children: (
                <Card bordered={false} bodyStyle={{ padding: 24 }}>
                  <Form form={foodForm} layout="vertical">
                    <Row gutter={24}>
                      <Col span={8}>
                        <Form.Item name="time" label="尝试时间" rules={[{ required: true }]}>
                          <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name="foodName" label="辅食名称" rules={[{ required: true }]}>
                          <Select mode="tags" placeholder="输入或选择辅食">
                            <Option value="米粉">高铁米粉</Option>
                            <Option value="苹果泥">苹果泥</Option>
                            <Option value="香蕉泥">香蕉泥</Option>
                            <Option value="南瓜泥">南瓜泥</Option>
                            <Option value="胡萝卜泥">胡萝卜泥</Option>
                            <Option value="土豆泥">土豆泥</Option>
                            <Option value="蛋黄泥">蛋黄泥</Option>
                            <Option value="西兰花泥">西兰花泥</Option>
                            <Option value="牛油果泥">牛油果泥</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={3}>
                        <Form.Item name="amount" label="份量" rules={[{ required: true }]}>
                          <InputNumber min={1} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={3}>
                        <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
                          <Select>
                            <Option value="g">克(g)</Option>
                            <Option value="ml">毫升(ml)</Option>
                            <Option value="勺">勺</Option>
                            <Option value="个">个</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={24}>
                      <Col span={24}>
                        <Form.Item name="reaction" label="宝宝反应" rules={[{ required: true }]}>
                          <Radio.Group>
                            <Radio value="none">无特殊反应</Radio>
                            <Radio value="like">喜欢 / 吃得好</Radio>
                            <Radio value="dislike">不喜欢 / 拒绝</Radio>
                            <Radio value="allergy" style={{ color: '#ff4d4f', fontWeight: 600 }}>
                              ⚠️ 过敏反应
                            </Radio>
                          </Radio.Group>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item
                      noStyle
                      shouldUpdate={(p, c) => p.reaction !== c.reaction}
                    >
                      {({ getFieldValue }) => getFieldValue('reaction') !== 'none' && (
                        <Form.Item name="reactionNotes" label="反应详情">
                          <TextArea rows={2} placeholder="详细描述反应情况" />
                        </Form.Item>
                      )}
                    </Form.Item>

                    <div className="form-section-title">📷 照片凭证</div>
                    <div className="photo-grid" style={{ marginBottom: 24 }}>
                      {foodPhotos.map((p, i) => (
                        <div key={i} style={{ position: 'relative' }}>
                          <img src={p} alt="" />
                          <Button
                            type="primary" danger size="small" shape="circle"
                            icon={<DeleteOutlined />}
                            style={{ position: 'absolute', top: 2, right: 2 }}
                            onClick={() => setFoodPhotos(ps => ps.filter((_, idx) => idx !== i))}
                          />
                        </div>
                      ))}
                      <div className="photo-upload-btn" onClick={() => handleImageUpload('food')}>
                        <CameraOutlined style={{ fontSize: 20 }} />
                        <span>添加照片</span>
                      </div>
                    </div>

                    <Row gutter={24}>
                      <Col span={16}>
                        <Form.Item name="notes" label="备注">
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="caregiver" label="记录护士" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                      <Button type="primary" size="large" icon={<SaveOutlined />} onClick={saveFood}>
                        保存辅食记录
                      </Button>
                    </div>
                  </Form>
                </Card>
              )
            },
            {
              key: 'crying',
              label: <span>😭 异常哭闹</span>,
              children: (
                <Card bordered={false} bodyStyle={{ padding: 24 }}>
                  <Form form={cryingForm} layout="vertical">
                    <Row gutter={24}>
                      <Col span={12}>
                        <Form.Item name="startTime" label="开始时间" rules={[{ required: true }]}>
                          <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="endTime" label="结束时间">
                          <DatePicker showTime style={{ width: '100%' }} format="YYYY-MM-DD HH:mm" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={24}>
                      <Col span={12}>
                        <Form.Item name="severity" label="哭闹程度" rules={[{ required: true }]}>
                          <Radio.Group>
                            <Radio value="mild">轻度（哼唧）</Radio>
                            <Radio value="moderate">中度（哭闹）</Radio>
                            <Radio value="severe" style={{ color: '#ff4d4f' }}>重度（剧烈、难以安抚）</Radio>
                          </Radio.Group>
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="soothed" label="是否成功安抚" valuePropName="checked">
                          <Switch checkedChildren="已安抚" unCheckedChildren="持续中" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={24}>
                      <Col span={12}>
                        <Form.Item name="possibleCause" label="可能原因">
                          <Select mode="tags" placeholder="选择或输入">
                            <Option value="饥饿">饥饿</Option>
                            <Option value="尿布湿了">尿布湿了</Option>
                            <Option value="需要安抚/抱抱">需要安抚/抱抱</Option>
                            <Option value="环境不适">环境不适（冷/热/噪音）</Option>
                            <Option value="肠绞痛/胀气">肠绞痛/胀气</Option>
                            <Option value="出牙不适">出牙不适</Option>
                            <Option value="生病/疼痛">生病/身体疼痛</Option>
                            <Option value="过累">过度疲劳</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="soothingMethod" label="安抚方式">
                          <Select mode="tags" placeholder="选择或输入">
                            <Option value="喂奶">喂奶</Option>
                            <Option value="换尿布">换尿布</Option>
                            <Option value="抱哄">抱哄/摇晃</Option>
                            <Option value="白噪音">白噪音/嘘声</Option>
                            <Option value="安抚奶嘴">安抚奶嘴</Option>
                            <Option value="按摩">腹部按摩</Option>
                            <Option value="襁褓">襁褓包裹</Option>
                            <Option value="散步">推车散步</Option>
                          </Select>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={24}>
                      <Col span={16}>
                        <Form.Item name="notes" label="详细描述">
                          <TextArea rows={3} placeholder="哭闹表现、持续时间、特殊症状等" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="caregiver" label="记录护士" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                      <Button type="primary" size="large" icon={<SaveOutlined />} onClick={saveCrying}>
                        保存哭闹记录
                      </Button>
                    </div>
                  </Form>
                </Card>
              )
            }
          ]}
        />
      </div>
    </div>
  );
};

export default FeedingEntry;
