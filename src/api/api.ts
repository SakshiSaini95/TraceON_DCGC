const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data: unknown = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'object' && data !== null && 'message' in data) {
    const message = data.message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
  } catch {
    throw new ApiError('Cannot connect to TRACEON. Check that the backend is running.', 0);
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new ApiError('TRACEON backend returned an invalid response.', response.status);
      }
      data = { message: text };
    }
  }

  if (!response.ok) {
    throw new ApiError(
      getErrorMessage(data, `TRACEON request failed (${response.status}).`),
      response.status,
      data,
    );
  }

  return data as T;
}

export interface Seller {
  id: number;
  platform: string;
  username: string;
  profile_url: string | null;
  phone?: string | null;
  upi_id?: string | null;
}

export interface SellerLookupResponse {
  success: boolean;
  found: boolean;
  seller?: Seller;
  matchedBy?: 'username' | 'profile_url' | 'phone' | 'upi_id';
  message?: string;
}

function isSellerLookupResponse(data: unknown): data is SellerLookupResponse {
  return typeof data === 'object'
    && data !== null
    && 'found' in data
    && data.found === false;
}

export async function lookupSeller(query: string): Promise<SellerLookupResponse> {
  const params = new URLSearchParams({ query });
  try {
    return await apiRequest<SellerLookupResponse>(`/api/sellers/lookup?${params}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404 && isSellerLookupResponse(error.data)) {
      return error.data;
    }
    throw error;
  }
}

export interface SellerRegistration {
  username: string;
  profile_url?: string;
  platform?: string;
  phone?: string;
  upi_id?: string;
}

export interface RiskEvidenceReference {
  id: number;
  reference: string;
  source: string;
  verificationStatus: 'verified' | 'demo';
  timestamp: string;
}

export interface RiskSignal {
  type: string;
  name: string;
  explanation: string;
  severity: 'low' | 'medium' | 'high';
  points: number;
  evidence: RiskEvidenceReference[];
  associatedSellers: Array<Pick<Seller, 'id' | 'username' | 'platform'>>;
}

export interface SellerRiskAnalysis {
  status: 'insufficient_evidence' | 'scored';
  score: number | null;
  riskLevel: 'low' | 'medium' | 'high' | null;
  summary: string;
  evidenceConfidence: {
    level: 'insufficient' | 'limited' | 'corroborated' | 'demo';
    basis: string;
  };
  verifiedEvidenceCount: number;
  unverifiedEvidenceCount: number;
  signals: RiskSignal[];
  model: {
    version: string;
    weights: Record<string, number>;
    severityMultipliers: Record<string, number>;
    thresholds: { lowMax: number; mediumMax: number };
    aggregation: string;
  };
}

export interface SellerConnectionNode {
  id: string;
  type: 'phone' | 'upi' | 'photo' | 'profile';
  label: string;
  platform?: string;
}

export interface SellerConnectionEdge {
  id: string;
  target: string;
  relationshipType: string;
  evidenceId: number;
  severity: 'low' | 'medium' | 'high';
}

export interface SellerConnections {
  root: Pick<Seller, 'id' | 'username' | 'platform'> & { type: 'seller'; label: string };
  nodes: SellerConnectionNode[];
  edges: SellerConnectionEdge[];
  empty: boolean;
}

export interface SellerEvidence {
  id: number;
  reference: string;
  signalType: string | null;
  signalName: string | null;
  severity: 'low' | 'medium' | 'high' | null;
  source: string;
  verificationStatus: 'unverified' | 'verified' | 'rejected' | 'revoked';
  createdAt: string;
  verifiedAt: string | null;
}

export const getSellerRiskAnalysis = (sellerId: number) =>
  apiRequest<{ success: boolean; sellerId: number; analysis: SellerRiskAnalysis }>(
    `/api/sellers/${sellerId}/risk-analysis`,
  );

export const getSellerConnections = (sellerId: number) =>
  apiRequest<{ success: boolean; sellerId: number; connections: SellerConnections }>(
    `/api/sellers/${sellerId}/connections`,
  );

export const getSellerEvidence = (sellerId: number) =>
  apiRequest<{ success: boolean; sellerId: number; count: number; evidence: SellerEvidence[] }>(
    `/api/sellers/${sellerId}/evidence`,
  );

export const submitSellerEvidence = (sellerId: number, submission: { description: string; evidence_url?: string }) =>
  apiRequest<{ success: boolean; message: string; evidenceId: number; verificationStatus: string }>(
    `/api/sellers/${sellerId}/evidence`,
    {
      method: 'POST',
      body: JSON.stringify(submission),
    },
  );

export const getSellers = () =>
  apiRequest<{ success: boolean; count: number; sellers: Seller[] }>('/api/sellers');

export const addSeller = (seller: SellerRegistration) =>
  apiRequest<{ success: boolean; message: string; sellerId: number }>('/api/sellers', {
    method: 'POST',
    body: JSON.stringify(seller),
  });

export interface BetaRegistration {
  username: string;
  email: string;
  phone?: string;
  user_type?: string;
  profile_url?: string;
}

export const registerBeta = (registration: BetaRegistration) =>
  apiRequest<{ success: boolean; message: string; userId: number }>('/api/users', {
    method: 'POST',
    body: JSON.stringify(registration),
  });

export interface ReportSubmission {
  seller_id: number;
  reason: string;
  description?: string;
  user_id?: number;
}

export interface Report {
  id: number;
  seller_id: number;
  user_id: number | null;
  reason: string;
  description: string | null;
  created_at: string;
  username: string | null;
}

export const getReports = () =>
  apiRequest<{ success: boolean; count: number; reports: Report[] }>('/api/reports');

export const submitReport = (report: ReportSubmission) =>
  apiRequest<{ success: boolean; message: string; reportId: number }>('/api/reports', {
    method: 'POST',
    body: JSON.stringify(report),
  });

export const getUsers = () =>
  apiRequest('/api/users');
