import { Button, Form, Input, Space, Tag, message } from 'antd';
import { useState } from 'react';
import { api, ApiError } from '../api';
import { AuthUser, clearAuth, saveAuth } from '../auth';

interface LoginResult {
  token: string;
  user: AuthUser;
}

interface Props {
  user: AuthUser | null;
  onAuth(user: AuthUser | null): void;
}

export default function LoginPanel({ user, onAuth }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm<{ email: string; nickname?: string; password: string }>();

  const submit = async (values: { email: string; nickname?: string; password: string }) => {
    setLoading(true);
    try {
      if (mode === 'register') {
        await api('/users/register', { method: 'POST', body: JSON.stringify({ email: values.email, nickname: values.nickname ?? values.email.split('@')[0], password: values.password }) });
      }
      const result = await api<LoginResult>('/users/login', { method: 'POST', body: JSON.stringify({ email: values.email, password: values.password }) });
      if (!result?.token) throw new Error('登录失败，请检查账号密码');
      saveAuth(result.token, result.user);
      onAuth(result.user);
      message.success(`欢迎，${result.user.nickname}`);
    } catch (error) {
      message.error(error instanceof ApiError ? error.message : '操作失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <Space>
        <Tag color="blue">当前用户：{user.nickname}</Tag>
        <Button
          size="small"
          onClick={() => {
            clearAuth();
            onAuth(null);
          }}
        >
          退出登录
        </Button>
      </Space>
    );
  }

  return (
    <Form form={form} layout="inline" onFinish={submit}>
      <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }]}>
        <Input placeholder="邮箱，如 demo@tripmatch.cn" style={{ width: 220 }} />
      </Form.Item>
      {mode === 'register' && (
        <Form.Item name="nickname" rules={[{ required: true, message: '请输入昵称' }]}>
          <Input placeholder="昵称" style={{ width: 120 }} />
        </Form.Item>
      )}
      <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
        <Input.Password placeholder="密码" style={{ width: 140 }} />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={loading}>
            {mode === 'login' ? '登录' : '注册并登录'}
          </Button>
          <Button type="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
          </Button>
        </Space>
      </Form.Item>
    </Form>
  );
}
