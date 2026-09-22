import { Alert, Card, Col, Empty, List, Progress, Row, Select, Space, Statistic, Table, Tag } from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { AuthUser, getStoredUser } from '../auth';
import { BudgetOverview, TripOption } from '../types/budget';
import ExpenseForm from './ExpenseForm';
import LoginPanel from './LoginPanel';
import QuotaForm from './QuotaForm';
import TransferForm from './TransferForm';

const money = (value: number) => `¥${value.toFixed(2)}`;

export default function BudgetBoard() {
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [tripId, setTripId] = useState<number>();
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [error, setError] = useState<string>();

  useEffect(() => {
    api<TripOption[]>('/trips')
      .then((list) => {
        setTrips(list);
        if (list.length > 0) setTripId((current) => current ?? list[0].id);
      })
      .catch(() => setError('行程列表加载失败'));
  }, []);

  const loadOverview = useCallback(async (id: number) => {
    try {
      setOverview(await api<BudgetOverview>(`/trips/${id}/budget`));
      setError(undefined);
    } catch {
      setError('预算数据加载失败');
    }
  }, []);

  useEffect(() => {
    if (tripId != null) void loadOverview(tripId);
  }, [tripId, loadOverview]);

  const refresh = useCallback(() => {
    if (tripId != null) void loadOverview(tripId);
  }, [tripId, loadOverview]);

  const currentTrip = trips.find((trip) => trip.id === tripId);
  const isOwner = user != null && currentTrip?.ownerId === user.id;

  return (
    <Card
      title="分类预算与调拨"
      style={{ marginTop: 16 }}
      extra={
        <Space wrap>
          <Select
            style={{ minWidth: 180 }}
            placeholder="选择行程"
            value={tripId}
            options={trips.map((trip) => ({ value: trip.id, label: `${trip.destination}（${trip.departDate}）` }))}
            onChange={(value) => setTripId(value)}
          />
          <LoginPanel user={user} onAuth={setUser} />
        </Space>
      }
    >
      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      {!overview && !error && <Empty description="暂无行程，请先发布行程" />}
      {overview && (
        <>
          <Row gutter={16}>
            <Col span={4}><Statistic title="总预算" value={overview.totalBudget} precision={2} prefix="¥" /></Col>
            <Col span={4}><Statistic title="已分配额度" value={overview.allocated} precision={2} prefix="¥" /></Col>
            <Col span={4}><Statistic title="未分配" value={overview.unallocated} precision={2} prefix="¥" /></Col>
            <Col span={4}><Statistic title="已用合计" value={overview.totalUsed} precision={2} prefix="¥" /></Col>
            <Col span={6}><Statistic title="剩余合计" value={overview.totalRemaining} precision={2} prefix="¥" /></Col>
          </Row>
          <Table
            style={{ marginTop: 16 }}
            size="small"
            rowKey="category"
            pagination={false}
            dataSource={overview.categories}
            columns={[
              { title: '分类', dataIndex: 'label' },
              { title: '额度', dataIndex: 'quota', render: money },
              { title: '已用', dataIndex: 'used', render: money },
              { title: '剩余', dataIndex: 'remaining', render: money },
              {
                title: '使用进度',
                render: (_, item) => (
                  <Progress
                    percent={item.quota > 0 ? Math.round((item.used / item.quota) * 100) : 0}
                    size="small"
                    status={item.remaining <= 0 && item.quota > 0 ? 'exception' : 'active'}
                  />
                )
              }
            ]}
          />
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={8}>
              <ExpenseForm tripId={overview.tripId} categories={overview.categories} canEdit={user != null} onDone={refresh} />
            </Col>
            <Col span={8}>
              {isOwner ? (
                <TransferForm tripId={overview.tripId} categories={overview.categories} onDone={refresh} />
              ) : (
                <Card title="分类额度调拨（发起人）" size="small">
                  <p style={{ color: '#888' }}>{user ? '只有行程发起人可以调拨分类额度。' : '登录发起人账号后可调拨分类额度。'}</p>
                </Card>
              )}
            </Col>
            <Col span={8}>
              {isOwner ? (
                <QuotaForm tripId={overview.tripId} totalBudget={overview.totalBudget} categories={overview.categories} onDone={refresh} />
              ) : (
                <Card title="分类额度设置（发起人）" size="small">
                  <p style={{ color: '#888' }}>分类额度合计不得超过总预算，由发起人维护。</p>
                </Card>
              )}
            </Col>
          </Row>
          <Row gutter={16} style={{ marginTop: 16 }}>
            <Col span={12}>
              <Card title="费用记录" size="small">
                <List
                  size="small"
                  dataSource={overview.expenses}
                  locale={{ emptyText: '暂无费用记录' }}
                  renderItem={(item) => (
                    <List.Item>
                      <Space>
                        <Tag>{item.label}</Tag>
                        <span>{money(item.amount)}</span>
                        <span style={{ color: '#888' }}>{item.memberName}</span>
                        {item.note && <span style={{ color: '#888' }}>{item.note}</span>}
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card title="调拨记录" size="small">
                <List
                  size="small"
                  dataSource={overview.transfers}
                  locale={{ emptyText: '暂无调拨记录' }}
                  renderItem={(item) => (
                    <List.Item>
                      <Space>
                        <Tag color="blue">{item.fromLabel}</Tag>→<Tag color="green">{item.toLabel}</Tag>
                        <span>{money(item.amount)}</span>
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </Card>
  );
}
