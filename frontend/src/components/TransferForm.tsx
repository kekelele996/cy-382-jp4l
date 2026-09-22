import { Button, Card, Form, InputNumber, Select, message } from 'antd';
import { useState } from 'react';
import { api, ApiError } from '../api';
import { BUDGET_CATEGORY_OPTIONS, BudgetCategoryView } from '../types/budget';

interface Props {
  tripId: number;
  categories: BudgetCategoryView[];
  onDone(): void;
}

interface TransferResult {
  duplicated: boolean;
}

export default function TransferForm({ tripId, categories, onDone }: Props) {
  const [form] = Form.useForm<{ fromCategory: string; toCategory: string; amount: number }>();
  const [loading, setLoading] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const remainingOf = (category?: string) => categories.find((item) => item.category === category)?.remaining;

  const submit = async (values: { fromCategory: string; toCategory: string; amount: number }) => {
    setLoading(true);
    try {
      const result = await api<TransferResult>(`/trips/${tripId}/budget/transfers`, {
        method: 'POST',
        body: JSON.stringify({ fromCategory: values.fromCategory, toCategory: values.toCategory, amount: values.amount, idempotencyKey })
      });
      if (result.duplicated) {
        message.info('该笔调拨已生效过，未重复执行');
      } else {
        message.success('调拨成功');
      }
      form.resetFields();
      setIdempotencyKey(crypto.randomUUID());
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'TRANSFER_EXCEEDS_REMAINING') {
        const maxAmount = error.details?.maxAmount;
        message.error(`${error.message}，当前可调出上限 ¥${maxAmount}`);
      } else {
        message.error(error instanceof ApiError ? error.message : '调拨失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="分类额度调拨（发起人）" size="small">
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ fromCategory: 'LODGING', toCategory: 'FOOD' }}>
        <Form.Item noStyle shouldUpdate={(prev, next) => prev.fromCategory !== next.fromCategory || prev.toCategory !== next.toCategory}>
          {({ getFieldValue }) => (
            <>
              <Form.Item name="fromCategory" label="调出分类" rules={[{ required: true, message: '请选择调出分类' }]}>
                <Select
                  options={BUDGET_CATEGORY_OPTIONS.map((option) => ({ ...option, label: `${option.label}（可调出 ¥${remainingOf(option.value) ?? 0}）` }))}
                  onChange={() => form.validateFields(['amount', 'toCategory']).catch(() => undefined)}
                />
              </Form.Item>
              <Form.Item
                name="toCategory"
                label="调入分类"
                rules={[
                  { required: true, message: '请选择调入分类' },
                  {
                    validator: (_, value: string) =>
                      value && value === getFieldValue('fromCategory') ? Promise.reject(new Error('调出与调入分类不能相同')) : Promise.resolve()
                  }
                ]}
              >
                <Select options={BUDGET_CATEGORY_OPTIONS} />
              </Form.Item>
              <Form.Item
                name="amount"
                label="调拨金额（元）"
                rules={[
                  { required: true, message: '请输入调拨金额' },
                  {
                    validator: (_, value: number) => {
                      const remaining = remainingOf(getFieldValue('fromCategory'));
                      if (value != null && remaining != null && value > remaining) {
                        return Promise.reject(new Error(`调出后不得低于已用金额，可调出上限 ¥${remaining}`));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="不超过调出分类剩余额度" />
              </Form.Item>
            </>
          )}
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={loading} block>
          确认调拨
        </Button>
      </Form>
    </Card>
  );
}
