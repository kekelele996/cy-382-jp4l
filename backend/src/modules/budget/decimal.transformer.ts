import { ValueTransformer } from 'typeorm';

// MySQL DECIMAL 经 mysql2 默认以字符串返回，统一转成数字便于业务计算与 JSON 输出
export const decimalTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | number | null) => (value === null || value === undefined ? value : Number(value))
};
