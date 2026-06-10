import React, { useState, useEffect } from 'react';
import { Input, Modal, Button, Dropdown, Avatar } from 'antd';
import { UserOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAppStore, WindowKey } from './store/appStore';
import { db } from './db';
import BabyList from './windows/BabyList';
import BedBoard from './windows/BedBoard';
import BabyTimeline from './windows/BabyTimeline';
import FeedingEntry from './windows/FeedingEntry';
import CareReminder from './windows/CareReminder';
import ShiftRecord from './windows/ShiftRecord';
import ReportPrint from './windows/ReportPrint';

interface NavItem {
  key: WindowKey;
  icon: string;
  label: string;
}

const navItems: NavItem[] = [
  { key: 'bedBoard', icon: '🛏️', label: '床位看板' },
  { key: 'babyList', icon: '👶', label: '宝宝列表' },
  { key: 'babyTimeline', icon: '📋', label: '护理时间线' },
  { key: 'feedingEntry', icon: '🍼', label: '喂养录入' },
  { key: 'careReminder', icon: '🔔', label: '护理提醒' },
  { key: 'shiftRecord', icon: '📝', label: '交班记录' },
  { key: 'reportPrint', icon: '🖨️', label: '报表打印' }
];

const App: React.FC = () => {
  const {
    activeWindow,
    setActiveWindow,
    selectedBaby,
    currentNurse,
    setCurrentNurse,
    selectedDate,
    setSelectedDate
  } = useAppStore();

  const [nurseModal, setNurseModal] = useState(false);
  const [tempNurse, setTempNurse] = useState(currentNurse);
  const [babies, setBabies] = useState<any[]>([]);
  const [reminderCount, setReminderCount] = useState(0);

  useEffect(() => {
    loadBabies();
    loadReminderCount();
    const interval = setInterval(loadReminderCount, 60000);
    return () => clearInterval(interval);
  }, []);

  const loadBabies = async () => {
    const list = await db.babies.where('status').equals('active').toArray();
    setBabies(list);
  };

  const loadReminderCount = async () => {
    const now = new Date().toISOString();
    const count = await db.reminders
      .filter(r => r.status === 'pending' && r.scheduledTime <= now)
      .count();
    setReminderCount(count);
  };

  const handleNavClick = (key: WindowKey) => {
    setActiveWindow(key);
  };

  const handleSaveNurse = () => {
    if (tempNurse.trim()) {
      setCurrentNurse(tempNurse.trim());
      setNurseModal(false);
    }
  };

  const getWindowTitle = () => {
    const item = navItems.find(i => i.key === activeWindow);
    return item ? `${item.icon}  ${item.label}` : '';
  };

  const renderWindow = () => {
    switch (activeWindow) {
      case 'babyList':
        return <BabyList />;
      case 'bedBoard':
        return <BedBoard />;
      case 'babyTimeline':
        return <BabyTimeline />;
      case 'feedingEntry':
        return <FeedingEntry />;
      case 'careReminder':
        return <CareReminder />;
      case 'shiftRecord':
        return <ShiftRecord />;
      case 'reportPrint':
        return <ReportPrint />;
      default:
        return <BedBoard />;
    }
  };

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🍼</div>
          <div>
            <div className="sidebar-logo-text">母婴护理站</div>
            <div className="sidebar-logo-sub">Baby Care Desktop</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => (
            <div
              key={item.key}
              className={`nav-item ${activeWindow === item.key ? 'active' : ''}`}
              onClick={() => handleNavClick(item.key)}
            >
              <span className="nav-icon">
                {item.icon}
                {item.key === 'careReminder' && reminderCount > 0 && (
                  <span style={{
                    position: 'absolute',
                    fontSize: '10px',
                    background: '#ff4d4f',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '0 5px',
                    marginLeft: '-8px',
                    marginTop: '-12px'
                  }}>{reminderCount}</span>
                )}
              </span>
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="current-nurse" onClick={() => setNurseModal(true)} style={{ cursor: 'pointer' }}>
            <div className="nurse-avatar">👩‍⚕️</div>
            <div className="nurse-info">
              <div className="nurse-label">当前值班护士</div>
              <div className="nurse-name">{currentNurse}</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="main-header">
          <div className="header-title">
            <h2>{getWindowTitle()}</h2>
            <span style={{
              background: '#f0f0f0',
              color: '#666',
              padding: '4px 12px',
              borderRadius: '12px',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <CalendarOutlined /> {dayjs(selectedDate).format('YYYY年MM月DD日 dddd')}
            </span>
          </div>

          <div className="header-actions">
            <Input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{ width: 150 }}
            />

            {selectedBaby && (
              <div className="selected-baby-info">
                <div className={`selected-baby-avatar avatar-${selectedBaby.gender}`}>
                  {selectedBaby.name.charAt(0)}
                </div>
                <span className="selected-baby-detail">
                  {selectedBaby.name} · {selectedBaby.roomNumber}{selectedBaby.bedNumber}
                </span>
              </div>
            )}

            <Dropdown
              menu={{
                items: babies.map(b => ({
                  key: String(b.id),
                  icon: (
                    <Avatar size="small" style={{
                      background: b.gender === 'male'
                        ? 'linear-gradient(135deg, #69b1ff, #1677ff)'
                        : 'linear-gradient(135deg, #ffb7d5, #ff5c7a)',
                      fontSize: '12px'
                    }}>
                      {b.name.charAt(0)}
                    </Avatar>
                  ),
                  label: (
                    <span>
                      {b.name} · <span style={{ color: '#999' }}>{b.roomNumber}{b.bedNumber}</span>
                    </span>
                  )
                })),
                onClick: ({ key }) => {
                  const b = babies.find(x => String(x.id) === key);
                  if (b) useAppStore.getState().setSelectedBaby(b);
                }
              }}
              trigger={['click']}
            >
              <Button icon={<UserOutlined />}>
                快速切换宝宝
              </Button>
            </Dropdown>
          </div>
        </header>

        <div className="main-body">
          <div className="window-container">
            {renderWindow()}
          </div>
        </div>
      </main>

      <Modal
        title="设置值班护士"
        open={nurseModal}
        onOk={handleSaveNurse}
        onCancel={() => setNurseModal(false)}
        okText="确认"
        cancelText="取消"
      >
        <Input
          size="large"
          prefix={<UserOutlined />}
          value={tempNurse}
          onChange={e => setTempNurse(e.target.value)}
          placeholder="请输入值班护士姓名"
        />
      </Modal>
    </div>
  );
};

export default App;
