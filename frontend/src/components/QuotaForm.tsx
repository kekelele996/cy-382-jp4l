import { Button, Card, Form, InputNumber, message, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { BudgetCategoryView } from '../types/budget';

interface Props {
  tripId: number;
  totalBudget: number;
  categories: BudgetCategoryView[];
  onDone(): void;
}

export default function QuotaForm({ tripId, totalBudget, categories, onDone }: Props) {
  const [form] = Form.useForm<Record<string, number>>();
  const [loading, setLoading] = useState(false);
  const [sum, setSum] = useState(0);

  useEffect(() => {
    const values = Object.fromEntries(categories.map((item) => [item.category, item.quota]));
    form.setFieldsValue(values);
    setSum(categories.reduce((acc, item) => acc + item.quota, 0));
  }, [categories, form]);

  const submit = async (values: Record<string, number>) => {
    setLoading(true);
    try {
      await api(`/trips/${tripId}/budget/categories`, { method: 'PUT', body: JSON.stringify({ quotas: values }) });
      message.success('分类额度已更新');
      onDone();
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '保存失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="分类额度设置（发起人）" size="small">
      <Form
        form={form}
        layout="vertical"
        onFinish={submit}
        onValuesChange={() => {
          const values = form.getFieldsValue();
          setSum(Object.values(values).reduce((acc: number, value) => acc + (Number(value) || 0), 0));
        }}
      >
        {categories.map((item) => (
          <Form.Item
            key={item.category}
            name={item.category}
            label={`${item.label}额度（已用 ¥${item.used}）`}
            rules={[
              { required: true, message: '请输入额度' },
              {
                validator: (_, value: number) =>
                  value != null && value < item.used ? Promise.reject(new Error(`不能低于已用金额 ¥${item.used}`)) : Promise.resolve()
              }
            ]}
          >
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        ))}
        <Typography.Paragraph type={sum > totalBudget ? 'danger' : 'secondary'}>
          合计 ¥{sum.toFixed(2)} / 总预算 ¥{totalBudget.toFixed(2)}
        </Typography.Paragraph>
        <Button type="primary" htmlType="submit" loading={loading} disabled={sum > totalBudget} block>
          保存分类额度
        </Button>
      </Form>
    </Card>
  );
}
