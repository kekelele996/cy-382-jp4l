import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  message
} from 'antd';
import { ReloadOutlined, SwapOutlined, WalletOutlined } from '@ant-design/icons';
import type { ApiError } from '../api';
import { fetchBudget, newRequestId, registerExpense, setupBudget, transferBudget } from '../api/budget';
import type { BudgetCategoryCode, BudgetSummary } from '../types/budget';

const CATEGORY_COLORS: Record<BudgetCategoryCode, string> = {
  transport: 'blue',
  lodging: 'geekblue',
  food: 'orange',
  tickets: 'magenta'
};

const yuan = (value: number) => `¥ ${Number(value ?? 0).toFixed(2)}`;

export default function BudgetPanel() {
  const [tripId, setTripId] = useState(1);
  const [memberId, setMemberId] = useState(1);
  const [summary, setSummary] = useState<BudgetSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [setupForm] = Form.useForm();
  const [expenseForm] = Form.useForm();
  const [transferForm] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();

  const load = useCallback(async (id: number) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchBudget(id);
      setSummary(data);
      setupForm.setFieldsValue(
        Object.fromEntries(data.categories.map(item => [item.category, item.planned]))
      );
    } catch (err) {
      const apiError = err as ApiError;
      setSummary(null);
      setError(apiError.detail?.message ?? apiError.message);
    } finally {
      setLoading(false);
    }
  }, [setupForm]);

  useEffect(() => {
    void load(tripId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleError = (err: unknown) => {
    const apiError = err as ApiError;
    const detail = apiError.detail ?? ({} as ApiError['detail']);
    if (detail.code === 'BUDGET_QUOTA_EXCEEDED' && typeof detail.maxAmount === 'number') {
      messageApi.error(`${detail.message}，可登记上限：¥${Number(detail.maxAmount).toFixed(2)}（整笔已拒绝，未扣款）`);
    } else if (detail.code === 'BUDGET_TRANSFER_EXCEEDED' && typeof detail.maxTransferable === 'number') {
      messageApi.error(`${detail.message}，可调拨上限：¥${Number(detail.maxTransferable).toFixed(2)}`);
    } else {
      messageApi.error(detail.message ?? apiError.message);
    }
  };

  const onSetup = async (values: Record<BudgetCategoryCode, number>) => {
    try {
      const data = await setupBudget(tripId, values, memberId);
      setSummary(data);
      messageApi.success('分类额度已保存');
    } catch (err) {
      handleError(err);
    }
  };

  const onRegister = async (values: { category: BudgetCategoryCode; amount: number; note?: string }) => {
    const requestId = newRequestId();
    try {
      const result = await registerExpense(tripId, { ...values, memberId }, requestId);
      messageApi.success(result.duplicate ? '该登记已提交过，本次为重复请求，未重复扣款' : '费用登记成功，对应分类额度已扣减');
      expenseForm.resetFields(['amount', 'note']);
      await load(tripId);
    } catch (err) {
      handleError(err);
    }
  };

  const onTransfer = async (values: {
    fromCategory: BudgetCategoryCode;
    toCategory: BudgetCategoryCode;
    amount: number;
  }) => {
    const requestId = newRequestId();
    try {
      const result = await transferBudget(tripId, { ...values, operatorId: memberId }, requestId);
      messageApi.success(result.duplicate ? '该调拨已处理过，本次为重复请求，未重复调拨' : '额度调拨已一次生效');
      transferForm.resetFields(['amount']);
      await load(tripId);
    } catch (err) {
      handleError(err);
    }
  };

  const categoryOptions = (summary?.categories ?? []).map(item => ({
    value: item.category,
    label: `${item.label}（剩余 ${yuan(item.remaining)}）`
  }));

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {contextHolder}
      <Card
        title={
          <Space>
            <WalletOutlined />
            分类预算
          </Space>
        }
        extra={
          <Space wrap>
            <span>行程 ID</span>
            <InputNumber min={1} value={tripId} onChange={value => value && setTripId(value)} style={{ width: 90 }} />
            <span>我的用户 ID</span>
            <InputNumber min={1} value={memberId} onChange={value => value && setMemberId(value)} style={{ width: 90 }} />
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load(tripId)}>
              刷新
            </Button>
          </Space>
        }
      >
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
        {summary && !summary.initialized && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message="该行程尚未设置分类预算"
            description="请行程发起人先在下方填写交通、住宿、餐饮、门票四类额度，合计不得超过行程总预算。"
          />
        )}

        {summary && (
          <Row gutter={16}>
            <Col span={6}>
              <Statistic title="行程总预算" value={summary.totalBudget ?? '不限'} precision={summary.totalBudget == null ? undefined : 2} prefix={summary.totalBudget == null ? '' : '¥'} />
            </Col>
            <Col span={6}>
              <Statistic title="分类额度合计" value={summary.totalPlanned} precision={2} prefix="¥" />
            </Col>
            <Col span={6}>
              <Statistic title="已用合计" value={summary.totalSpent} precision={2} prefix="¥" />
            </Col>
            <Col span={6}>
              <Statistic
                title="剩余合计"
                value={summary.totalRemaining}
                precision={2}
                prefix="¥"
                valueStyle={{ color: summary.totalRemaining < 0 ? '#cf1322' : '#3f8600' }}
              />
            </Col>
          </Row>
        )}

        {summary && (
          <Table
            style={{ marginTop: 16 }}
            rowKey="category"
            pagination={false}
            dataSource={summary.categories}
            columns={[
              {
                title: '分类',
                dataIndex: 'label',
                render: (_, record) => (
                  <Tag color={CATEGORY_COLORS[record.category]}>
                    {record.label}
                  </Tag>
                )
              },
              { title: '分类额度', dataIndex: 'planned', align: 'right', render: (value: number) => yuan(value) },
              { title: '已用', dataIndex: 'spent', align: 'right', render: (value: number) => yuan(value) },
              {
                title: '剩余',
                dataIndex: 'remaining',
                align: 'right',
                render: (value: number) => (
                  <span style={{ color: value < 0 ? '#cf1322' : '#3f8600', fontWeight: 600 }}>{yuan(value)}</span>
                )
              },
              {
                title: '使用率',
                key: 'ratio',
                align: 'right',
                render: (_, record) =>
                  record.planned > 0 ? `${Math.min(100, Math.round((record.spent / record.planned) * 100))}%` : '—'
              }
            ]}
          />
        )}
      </Card>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="设置分类额度（发起人）">
            <Form form={setupForm} layout="vertical" onFinish={values => void onSetup(values as Record<BudgetCategoryCode, number>)}>
              {(summary?.categories ?? [
                { category: 'transport', label: '交通' },
                { category: 'lodging', label: '住宿' },
                { category: 'food', label: '餐饮' },
                { category: 'tickets', label: '门票' }
              ]).map(item => (
                <Form.Item
                  key={item.category}
                  label={`${item.label}额度`}
                  name={item.category}
                  rules={[{ required: true, message: `请填写${item.label}额度` }]}
                >
                  <InputNumber min={0} precision={2} style={{ width: '100%' }} prefix="¥" />
                </Form.Item>
              ))}
              <Button type="primary" htmlType="submit" block disabled={!summary}>
                保存额度
              </Button>
            </Form>
          </Card>
        </Col>

        <Col span={8}>
          <Card title="登记费用（成员）">
            <Form
              form={expenseForm}
              layout="vertical"
              onFinish={values => void onRegister(values as { category: BudgetCategoryCode; amount: number; note?: string })}
            >
              <Form.Item label="费用分类（只扣对应分类）" name="category" rules={[{ required: true, message: '请选择分类' }]}>
                <Select options={categoryOptions} placeholder="选择交通 / 住宿 / 餐饮 / 门票" />
              </Form.Item>
              <Form.Item
                label="金额（超出该分类剩余额度将整笔拒绝）"
                name="amount"
                rules={[{ required: true, message: '请输入金额' }]}
              >
                <InputNumber min={0.01} precision={2} style={{ width: '100%' }} prefix="¥" />
              </Form.Item>
              <Form.Item label="备注" name="note">
                <Input maxLength={160} placeholder="如：大理至丽江高铁票" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block disabled={!summary?.initialized}>
                登记费用
              </Button>
            </Form>
          </Card>
        </Col>

        <Col span={8}>
          <Card title={<><SwapOutlined /> 额度调拨（发起人）</>}>
            <Form
              form={transferForm}
              layout="vertical"
              onFinish={values =>
                void onTransfer(values as { fromCategory: BudgetCategoryCode; toCategory: BudgetCategoryCode; amount: number })
              }
            >
              <Form.Item label="调出分类（仅可调出剩余额度）" name="fromCategory" rules={[{ required: true, message: '请选择调出分类' }]}>
                <Select options={categoryOptions} placeholder="从哪个分类调出" />
              </Form.Item>
              <Form.Item label="调入分类" name="toCategory" rules={[{ required: true, message: '请选择调入分类' }]}>
                <Select options={categoryOptions} placeholder="调入哪个分类" />
              </Form.Item>
              <Form.Item label="调拨金额（调出后额度不得低于已用金额）" name="amount" rules={[{ required: true, message: '请输入金额' }]}>
                <InputNumber min={0.01} precision={2} style={{ width: '100%' }} prefix="¥" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block disabled={!summary?.initialized}>
                确认调拨
              </Button>
            </Form>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
