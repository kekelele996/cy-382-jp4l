import { Button, Card, Form, Input, InputNumber, Select, message } from 'antd';
import { useState } from 'react';
import { api, ApiError } from '../api';
import { BUDGET_CATEGORY_OPTIONS, BudgetCategoryView } from '../types/budget';

interface Props {
  tripId: number;
  categories: BudgetCategoryView[];
  canEdit: boolean;
  onDone(): void;
}

interface ExpenseResult {
  duplicated: boolean;
}

export default function ExpenseForm({ tripId, categories, canEdit, onDone }: Props) {
  const [form] = Form.useForm<{ category: string; amount: number; note?: string }>();
  const [loading, setLoading] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const remainingOf = (category?: string) => categories.find((item) => item.category === category)?.remaining;

  const submit = async (values: { category: string; amount: number; note?: string }) => {
    setLoading(true);
    try {
      const result = await api<ExpenseResult>(`/trips/${tripId}/expenses`, {
        method: 'POST',
        body: JSON.stringify({ category: values.category, amount: values.amount, note: values.note, idempotencyKey })
      });
      if (result.duplicated) {
        message.info('该笔费用已登记过，未重复扣减');
      } else {
        message.success('费用登记成功');
      }
      form.resetFields();
      setIdempotencyKey(crypto.randomUUID());
      onDone();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EXPENSE_EXCEEDS_CATEGORY') {
        const maxAmount = error.details?.maxAmount;
        message.error(`${error.message}，当前可登记上限 ¥${maxAmount}`);
      } else {
        message.error(error instanceof ApiError ? error.message : '登记失败，请稍后重试');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="登记费用" size="small">
      {canEdit ? (
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ category: 'TRANSPORT' }}>
          <Form.Item name="category" label="费用分类" rules={[{ required: true, message: '请选择分类' }]}>
            <Select
              options={BUDGET_CATEGORY_OPTIONS.map((option) => ({ ...option, label: `${option.label}（剩余 ¥${remainingOf(option.value) ?? 0}）` }))}
              onChange={() => form.validateFields(['amount']).catch(() => undefined)}
            />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.category !== next.category}>
            {({ getFieldValue }) => (
              <Form.Item
                name="amount"
                label="金额（元）"
                rules={[
                  { required: true, message: '请输入金额' },
                  {
                    validator: (_, value: number) => {
                      const remaining = remainingOf(getFieldValue('category'));
                      if (value != null && remaining != null && value > remaining) {
                        return Promise.reject(new Error(`超出该分类剩余额度，可登记上限 ¥${remaining}`));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <InputNumber min={0.01} precision={2} style={{ width: '100%' }} placeholder="只能扣减所选分类" />
              </Form.Item>
            )}
          </Form.Item>
          <Form.Item name="note" label="备注">
            <Input placeholder="如：古城到双廊拼车" maxLength={120} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            登记费用
          </Button>
        </Form>
      ) : (
        <p style={{ color: '#888' }}>登录后即可登记费用，金额只会扣减所选分类的额度。</p>
      )}
    </Card>
  );
}
