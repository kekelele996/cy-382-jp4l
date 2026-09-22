export interface ApiErrorDetail {
  success: false;
  code: string;
  message: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: ApiErrorDetail
  ) {
    super(detail.message ?? `请求失败 ${status}`);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // 非 JSON 响应（如网关错误），按状态码兜底
  }
  if (!response.ok) {
    if (payload && typeof payload === 'object') {
      throw new ApiError(response.status, payload as ApiErrorDetail);
    }
    throw new ApiError(response.status, { success: false, code: 'REQUEST_FAILED', message: `请求失败 ${response.status}` });
  }
  return payload as T;
}
