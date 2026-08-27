export type MetricsContext = {
  tenantId: string;
  now?: Date;
};

export type TodaySalesResult = {
  date: string;
  total: number;
};

export type SummaryScope = 'kpi' | 'extra' | 'full';

export type TimingLegs = Record<string, number>;
