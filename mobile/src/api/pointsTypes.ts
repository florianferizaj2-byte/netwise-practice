export type PointServicePrice = {
  id: string;
  name: string;
  sampleUnits: number;
  sampleCostMicros?: number;
  steps: { taskType: string; inputTokens: number; outputTokens: number }[];
};
export type PointPriceModel = {
  id: string;
  kind: 'configured' | 'reference';
  name: string;
  model: string;
  priority: number | null;
  verifiedAt: string;
  expiresAt: string;
  inputUnitsPer1000: number;
  outputUnitsPer1000: number;
  cachedInputUnitsPer1000: number;
  services: PointServicePrice[];
  priceBand?: 'peak' | 'off-peak' | 'fixed';
  priceBandLabel?: string;
  comparison?: { peak: { services: PointServicePrice[] }; offPeak: { services: PointServicePrice[] } };
};
export type PointServicesResponse = {
  billingMode: 'actual-usage';
  billingPolicy?: { admission: 'wallet-only'; dailyCostLimitMicros: null; serviceMultiplier: number };
  scale: number;
  pointsPerCny: number;
  available: boolean;
  primaryModelId: string | null;
  models: PointPriceModel[];
  assumptions: { inputTokensPerCall: number; notice: string };
  freeServices: { id: string; name: string; units: number }[];
};
export type PointCall = { operationId: string; model: string; taskType: string };
export type PointWallet = {
  availableUnits: number; heldUnits: number; expiredUnits?: number;
  pendingUnits?: number; scale: number; pointsPerCny?: number;
  ledgerRevision?:number;
  snapshotAt?:number;
};
export type PointReceipt = {
  found: boolean; pending: boolean; chargedUnits: number; heldUnits: number;
  refundedUnits: number; releasedUnits: number; wallet: PointWallet;
  operations: {id:string;feature:string;state:'pending'|'settled'|'refunded';error:string|null}[];
  calls: PointCall[];
};
