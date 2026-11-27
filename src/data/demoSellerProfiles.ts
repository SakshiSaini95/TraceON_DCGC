import type { Seller, SellerConnections, SellerRiskAnalysis, RiskSignal } from '@/api/api';

type DemoSeller = Omit<Seller, 'id'>;

export interface DemoSellerProfile {
  seller: DemoSeller;
  matchedBy: 'phone' | 'username' | 'profile_url';
  riskLabel: string;
  headline: string;
  analysis: SellerRiskAnalysis;
  connections: SellerConnections;
}

const demoEvidence = (id: number) => ({
  id,
  reference: `Demo evidence ${id}`,
  source: 'Synthetic demo fixture',
  verificationStatus: 'demo' as const,
  timestamp: '',
});

function demoSignal(
  seller: DemoSeller,
  id: number,
  type: string,
  name: string,
  points: number,
  severity: 'low' | 'medium' | 'high',
): RiskSignal {
  return {
    type,
    name,
    severity,
    points,
    explanation: 'Demo example.',
    evidence: [demoEvidence(id)],
    associatedSellers: [{ id: -id, username: seller.username, platform: seller.platform }],
  };
}

function demoConnections(
  id: number,
  username: string,
  platform: string,
  phone: string,
  upi: string,
  relatedProfileCount = 1,
): SellerConnections {
  const profileNodes: SellerConnections['nodes'] = Array.from(
    { length: relatedProfileCount },
    (_, index) => ({
      id: `demo-profile-${id}-${index + 1}`,
      type: 'profile' as const,
      label: `@demo_related_${id}_${index + 1}`,
      platform,
    }),
  );
  const nodes: SellerConnections['nodes'] = [
    ...profileNodes,
    { id: `demo-phone-${id}`, type: 'phone', label: phone },
    { id: `demo-photo-${id}`, type: 'photo', label: 'Reused photo · demo' },
    { id: `demo-upi-${id}`, type: 'upi', label: upi },
  ];
  const relationships = [
    ...profileNodes.map(() => 'related_profile'),
    'shared_phone',
    'reused_photo',
    'shared_upi',
  ];
  const edges: SellerConnections['edges'] = nodes.map((node, index) => ({
    id: `demo-edge-${id}-${index}`,
    target: node.id,
    relationshipType: relationships[index],
    evidenceId: id * 10 + index + 1,
    severity: index === 0 ? 'low' : index === 1 ? 'medium' : 'high',
  }));

  return {
    root: { id: -id, type: 'seller', username, label: username, platform },
    nodes,
    edges,
    empty: false,
  };
}

function demoAnalysis(signals: RiskSignal[], score: number): SellerRiskAnalysis {
  const riskLevel = score <= 29 ? 'low' : score <= 59 ? 'medium' : 'high';
  return {
    status: 'scored',
    score,
    riskLevel,
    summary: 'Demo only; synthetic, not a real assessment.',
    evidenceConfidence: {
      level: 'demo',
      basis: 'Synthetic fixture data only; it is not verified evidence or a real-world confidence estimate.',
    },
    verifiedEvidenceCount: 0,
    unverifiedEvidenceCount: 0,
    signals,
    model: {
      version: 'demo',
      weights: {},
      severityMultipliers: {},
      thresholds: { lowMax: 29, mediumMax: 59 },
      aggregation: 'Predefined demo score; not calculated from real evidence.',
    },
  };
}

const safeSeller: DemoSeller = {
  username: 'demo_phone_seller_01',
  platform: 'Instagram',
  profile_url: null,
  phone: '+91 90000 00001',
  upi_id: 'safe.demo@upi',
};
const possibleSeller: DemoSeller = {
  username: 'demo_seller_02',
  platform: 'Instagram',
  profile_url: null,
  phone: '+91 90000 00002',
  upi_id: 'demo_seller_02@upi',
};
const highRiskSeller: DemoSeller = {
  username: 'demo_seller_03',
  platform: 'Marketplace',
  profile_url: 'https://example.com/seller/demo-03',
  phone: '+91 90000 00003',
  upi_id: 'demo_seller_03@upi',
};

export const DEMO_SELLER_PROFILES: DemoSellerProfile[] = [
  {
    seller: safeSeller,
    matchedBy: 'phone',
    riskLabel: 'SAFE · DEMO',
    headline: '2 demo profiles. 1 phone.',
    analysis: demoAnalysis([
      demoSignal(safeSeller, 1, 'demo_low_indicator', 'Illustrative low-severity signal', 8, 'low'),
    ], 8),
    connections: demoConnections(1, safeSeller.username, safeSeller.platform, safeSeller.phone || '', safeSeller.upi_id || ''),
  },
  {
    seller: possibleSeller,
    matchedBy: 'username',
    riskLabel: 'POSSIBLE SCAM · DEMO',
    headline: '2 demo profiles. 1 phone.',
    analysis: demoAnalysis([
      demoSignal(possibleSeller, 2, 'demo_shared_phone', 'Phone identifier shared in demo data', 24, 'medium'),
      demoSignal(possibleSeller, 3, 'demo_reused_photo', 'Photo reuse indicator in demo data', 17, 'medium'),
      demoSignal(possibleSeller, 4, 'demo_upi_mismatch', 'UPI identity mismatch in demo data', 15, 'low'),
    ], 56),
    connections: demoConnections(2, possibleSeller.username, possibleSeller.platform, possibleSeller.phone || '', possibleSeller.upi_id || ''),
  },
  {
    seller: highRiskSeller,
    matchedBy: 'profile_url',
    riskLabel: 'HIGH RISK / SCAMMER · DEMO',
    headline: '3 demo profiles. 1 phone.',
    analysis: demoAnalysis([
      demoSignal(highRiskSeller, 5, 'demo_shared_phone', 'Phone identifier shared in demo data', 24, 'high'),
      demoSignal(highRiskSeller, 6, 'demo_reused_photo', 'Photo reuse indicator in demo data', 32, 'high'),
      demoSignal(highRiskSeller, 7, 'demo_upi_mismatch', 'UPI identity mismatch in demo data', 35, 'high'),
    ], 91),
    connections: demoConnections(3, highRiskSeller.username, highRiskSeller.platform, highRiskSeller.phone || '', highRiskSeller.upi_id || '', 2),
  },
];

export function findDemoSellerProfile(query: string): DemoSellerProfile | null {
  const trimmed = query.trim();
  const digits = trimmed.replace(/\D/g, '');
  const username = trimmed.replace(/^@/, '').toLowerCase();
  const profileUrl = trimmed.replace(/\/+$/, '').toLowerCase();

  if (digits === '919000000001') {
    return DEMO_SELLER_PROFILES[0];
  }
  if (username === 'demo_seller_02') {
    return DEMO_SELLER_PROFILES[1];
  }
  if (profileUrl === 'https://example.com/seller/demo-03') {
    return DEMO_SELLER_PROFILES[2];
  }
  return null;
}
