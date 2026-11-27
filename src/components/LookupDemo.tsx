import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, Check, CircleHelp, Loader2, Search, ShieldAlert } from 'lucide-react';
import {
  getSellerConnections,
  getSellerEvidence,
  getSellerRiskAnalysis,
  lookupSeller,
  type Seller,
  type SellerConnections,
  type SellerEvidence,
  type SellerRiskAnalysis,
} from '@/api/api';
import { findDemoSellerProfile } from '@/data/demoSellerProfiles';

type DisplaySeller = Omit<Seller, 'id'>;

type LookupResult =
  | {
      kind: 'found';
      seller: DisplaySeller;
      matchedBy?: 'username' | 'profile_url' | 'phone' | 'upi_id';
      analysis: SellerRiskAnalysis | null;
      connections: SellerConnections | null;
      evidence: SellerEvidence[];
      errors: string[];
      isDemo: boolean;
      demoRiskLabel?: string;
      demoHeadline?: string;
    }
  | { kind: 'not-found' | 'validation' | 'error'; message: string };

const STEPS = [
  'Checking TRACEON seller records',
  'Loading verified evidence',
  'Calculating risk from confirmed signals',
  'Mapping verified relationships',
];

const SAMPLES = ['+91 90000 00001', '@demo_seller_02', 'https://example.com/seller/demo-03'];
const SCAN_DURATION = STEPS.length * 450 + 250;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The requested TRACEON data could not be loaded.';
}

function formatEvidenceDate(value: string): string {
  return value.slice(0, 10);
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `•••• •••• ${digits.slice(-4)}` : 'Phone identifier';
}

function maskUpi(value: string): string {
  const account = value.split('@')[0] || '';
  return `${account[0] || ''}••••@•••`;
}

function ScoreRing({ score }: { score: number | null }) {
  const [displayScore, setDisplayScore] = useState<number | null>(score);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (score === null) {
      setDisplayScore(null);
      setProgress(0);
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayScore(score);
      setProgress(score);
      return;
    }

    setDisplayScore(0);
    setProgress(0);
    const start = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const elapsed = Math.min(1, (now - start) / 900);
      const value = score * (1 - Math.pow(1 - elapsed, 3));
      setDisplayScore(Math.round(value));
      setProgress(value);
      if (elapsed < 1) {
        frame = window.requestAnimationFrame(animate);
      }
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [score]);

  const style = { '--pct': `${progress}%` } as CSSProperties;
  return (
    <div
      className="score-ring"
      style={style}
      aria-label={score === null ? 'Risk score unavailable' : `Risk score ${score} out of 100`}
    >
      <strong>{displayScore === null ? '—' : displayScore}</strong>
      <small>{score === null ? 'not scored' : 'out of 100'}</small>
    </div>
  );
}

function SellerRecord({
  seller,
  matchedBy,
  query,
  connections,
  isDemo,
}: {
  seller: DisplaySeller;
  matchedBy?: 'username' | 'profile_url' | 'phone' | 'upi_id';
  query: string;
  connections: SellerConnections | null;
  isDemo: boolean;
}) {
  const centralType = matchedBy === 'phone' ? 'phone' : matchedBy === 'upi_id' ? 'upi' : 'profile';
  const centralLabel = matchedBy === 'phone'
    ? isDemo ? query : maskPhone(query)
    : matchedBy === 'upi_id'
      ? isDemo ? query : maskUpi(query)
      : `@${seller.username}`;
  const nodes = connections?.nodes.filter((node) => !(
    (matchedBy === 'phone' && node.type === 'phone')
    || (matchedBy === 'upi_id' && node.type === 'upi')
  )) || [];
  const positions = new Map(nodes.map((node, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(nodes.length, 1);
    return [node.id, {
      x: 50 + 35 * Math.cos(angle),
      y: 50 + 34 * Math.sin(angle),
    }];
  }));
  const visibleEdges = connections?.edges.filter((edge) => positions.has(edge.target)) || [];
  const typeClasses: Record<string, string> = {
    phone: 'node-phone',
    upi: 'node-profile',
    photo: 'node-photo',
    profile: 'node-profile',
  };
  const upiStyle = { borderLeft: '3px solid var(--ok)' };

  return (
    <div
      className="graph"
      role="group"
      aria-label={connections?.empty
        ? 'Seller record with no verified relationships'
        : 'Seller record and verified relationships'}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {visibleEdges.map((edge) => {
          const point = positions.get(edge.target);
          if (!point) return null;
          return (
            <g key={edge.id}>
              <line
                className={`edge edge-${edge.severity}`}
                x1="50"
                y1="50"
                x2={point.x}
                y2={point.y}
              >
                <title>{`Evidence #${edge.evidenceId}`}</title>
              </line>
            </g>
          );
        })}
      </svg>
      <span
        className={`node node-seller node-main node-${centralType}`}
        style={{ left: '50%', top: '50%' }}
        title={centralLabel}
      >
        {centralLabel}
      </span>
      {nodes.map((node) => {
        const point = positions.get(node.id);
        if (!point) return null;
        const isUpi = node.type === 'upi';
        return (
          <span
            key={node.id}
            className={`node ${typeClasses[node.type] || 'node-profile'}`}
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
              ...(isUpi ? upiStyle : {}),
            }}
            title={`${node.label}${node.platform ? ` · ${node.platform}` : ''}`}
          >
            {node.label}
          </span>
        );
      })}
      {(!connections || connections.empty || nodes.length === 0) && (
        <span
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 10,
            transform: 'translateX(-50%)',
            color: 'var(--muted)',
            font: "10px 'DM Mono', monospace",
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {connections ? 'No verified relationships recorded' : 'Verified relationship data unavailable'}
        </span>
      )}
    </div>
  );
}

function riskHeadline(analysis: SellerRiskAnalysis | null, demoHeadline?: string): string {
  if (demoHeadline) return demoHeadline;
  if (!analysis || analysis.status === 'insufficient_evidence') {
    return 'Insufficient verified evidence';
  }
  if (analysis.riskLevel === 'high') return 'High risk indicators verified';
  if (analysis.riskLevel === 'medium') return 'Verified warning signals found';
  return 'Limited verified warning signals';
}

export default function LookupDemo() {
  const [query, setQuery] = useState('test_seller');
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'done'>('idle');
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<LookupResult | null>(null);
  const timers = useRef<number[]>([]);
  const inFlight = useRef(false);

  const clear = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  };

  useEffect(() => clear, []);

  const run = async (value = query) => {
    if (inFlight.current) return;

    const normalizedQuery = value.trim();
    clear();
    if (!normalizedQuery) {
      setResult({
        kind: 'validation',
        message: 'Enter a username, phone number, UPI ID, or profile URL to search.',
      });
      setPhase('done');
      return;
    }

    inFlight.current = true;
    setPhase('scanning');
    setStep(0);
    setResult(null);

    STEPS.forEach((_, index) => {
      timers.current.push(window.setTimeout(() => setStep(index + 1), 450 * (index + 1)));
    });

    const scanDelay = new Promise<void>((resolve) => {
      timers.current.push(window.setTimeout(resolve, SCAN_DURATION));
    });
    const demo = findDemoSellerProfile(normalizedQuery);
    const demoOutcome = demo ? {
      kind: 'found' as const,
      seller: demo.seller,
      matchedBy: demo.matchedBy,
      analysis: demo.analysis,
      connections: demo.connections,
      evidence: [],
      errors: [],
      isDemo: true,
      demoRiskLabel: demo.riskLabel,
      demoHeadline: demo.headline,
    } : null;
    const request = demoOutcome
      ? Promise.resolve(demoOutcome)
      : lookupSeller(normalizedQuery).then(async (response) => {
      if (!response.found) return { kind: 'lookup' as const, response };
      if (!response.seller) {
        throw new Error('TRACEON backend returned a seller match without seller details.');
      }

      const [riskResult, connectionResult, evidenceResult] = await Promise.allSettled([
        getSellerRiskAnalysis(response.seller.id),
        getSellerConnections(response.seller.id),
        getSellerEvidence(response.seller.id),
      ]);
      const errors: string[] = [];
      if (riskResult.status === 'rejected') errors.push(`Risk analysis: ${getErrorMessage(riskResult.reason)}`);
      if (connectionResult.status === 'rejected') errors.push(`Relationships: ${getErrorMessage(connectionResult.reason)}`);
      if (evidenceResult.status === 'rejected') errors.push(`Evidence: ${getErrorMessage(evidenceResult.reason)}`);

      return {
        kind: 'found' as const,
        seller: response.seller,
        matchedBy: response.matchedBy,
        analysis: riskResult.status === 'fulfilled' ? riskResult.value.analysis : null,
        connections: connectionResult.status === 'fulfilled' ? connectionResult.value.connections : null,
        evidence: evidenceResult.status === 'fulfilled' ? evidenceResult.value.evidence : [],
        errors,
        isDemo: false,
        demoRiskLabel: undefined,
        demoHeadline: undefined,
      };
    }).catch((error: unknown) => ({
      kind: 'error' as const,
      error: error instanceof Error ? error : new Error('Seller lookup failed.'),
    }));

    const [outcome] = await Promise.all([request, scanDelay]);
    clear();

    if (outcome.kind === 'error') {
      setResult({ kind: 'error', message: outcome.error.message || 'Seller lookup failed. Please try again.' });
    } else if (outcome.kind === 'found') {
      setResult({
        kind: 'found',
        seller: outcome.seller,
        matchedBy: outcome.matchedBy,
        analysis: outcome.analysis,
        connections: outcome.connections,
        evidence: outcome.evidence,
        errors: outcome.errors,
        isDemo: outcome.isDemo,
        demoRiskLabel: outcome.demoRiskLabel,
        demoHeadline: outcome.demoHeadline,
      });
    } else if (outcome.response.found && outcome.response.seller) {
      setResult({
        kind: 'found',
        seller: outcome.response.seller,
        matchedBy: outcome.response.matchedBy,
        analysis: null,
        connections: null,
        evidence: [],
        errors: ['Risk analysis, evidence, and relationships could not be loaded.'],
        isDemo: false,
      });
    } else {
      setResult({
        kind: 'not-found',
        message: outcome.response.message || 'No matching seller record was found.',
      });
    }

    setPhase('done');
    inFlight.current = false;
  };

  const foundResult = result?.kind === 'found' ? result : null;
  const analysis = foundResult?.analysis || null;
  const verdictClass = analysis?.status === 'scored' && analysis.riskLevel
    ? `verdict-${analysis.riskLevel}`
    : 'verdict-insufficient';
  const verdictStyle = analysis?.status === 'scored'
    ? undefined
    : { '--tone': 'var(--muted)' } as CSSProperties;
  const unverifiedCount = foundResult?.evidence.filter(
    (item) => item.verificationStatus === 'unverified',
  ).length || 0;

  return (
    <div className="lookup">
      <form className="lookup-form" onSubmit={(event) => { event.preventDefault(); void run(); }}>
        <label htmlFor="lookup-input" className="sr-only">Seller username, phone number, UPI ID, or profile URL</label>
        <Search size={18} aria-hidden="true" />
        <input
          id="lookup-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Enter username, phone number, UPI ID, or profile URL"
          autoComplete="off"
          spellCheck={false}
        />
        <button className="button button-lime" type="submit" disabled={phase === 'scanning'}>
          {phase === 'scanning' ? <><Loader2 size={16} className="spin" /> Checking</> : <>Check seller <ArrowUpRight size={16} /></>}
        </button>
      </form>

      <div className="lookup-samples">
        <span>Try</span>
        {SAMPLES.map((sample) => (
          <button
            key={sample}
            type="button"
            className="chip"
            disabled={phase === 'scanning'}
            onClick={() => {
              setQuery(sample);
              void run(sample);
            }}
          >
            {sample}
          </button>
        ))}
      </div>

      <div className="lookup-body" aria-live="polite">
        {phase === 'idle' && (
          <p className="lookup-empty">
            Search TRACEON seller records by username, phone number, UPI ID, or profile URL. Scores use verified evidence only and are not guarantees of safety.
          </p>
        )}

        {phase === 'scanning' && (
          <ol className="scan-steps">
            {STEPS.map((label, index) => (
              <li key={label} className={index < step ? 'is-done' : index === step ? 'is-active' : ''}>
                <span className="scan-icon">
                  {index < step ? <Check size={14} /> : index === step ? <Loader2 size={14} className="spin" /> : null}
                </span>
                {label}
              </li>
            ))}
          </ol>
        )}

        {phase === 'done' && foundResult && (
          <div className={`verdict ${verdictClass}`} style={verdictStyle}>
            <div className="verdict-main">
              <ScoreRing score={analysis?.status === 'scored' ? analysis.score : null} />
              <div>
                <span className="risk-pill">
                  {analysis?.status === 'scored'
                    ? <><ShieldAlert size={14} /> {foundResult.demoRiskLabel || (analysis.riskLevel === 'low' ? 'Low observed risk' : `${analysis.riskLevel} risk`)}</>
                    : <><CircleHelp size={14} /> Insufficient evidence</>}
                </span>
                <h3>{riskHeadline(analysis, foundResult.demoHeadline)}</h3>
                <p>
                  {analysis?.summary || 'The seller record was found, but verified risk analysis is unavailable. No score has been assigned.'}
                </p>
                <p>
                  Seller: <strong>@{foundResult.seller.username}</strong> · {foundResult.seller.platform}
                </p>
                {analysis && !foundResult.isDemo && (
                  <p>
                    Evidence confidence: {analysis.evidenceConfidence.level} · {analysis.verifiedEvidenceCount} verified item{analysis.verifiedEvidenceCount === 1 ? '' : 's'}.
                    {analysis.status === 'scored' && ' Rule-based score, not probability.'}
                  </p>
                )}
                {analysis?.signals.length ? (
                  <ul className="signals">
                    {analysis.signals.map((signal) => (
                      <li key={signal.type}>
                        <div>
                          <strong>{signal.name} · {signal.severity} · {signal.points} points</strong>
                          <p>{signal.explanation}</p>
                          <small>
                            {signal.evidence.map((item) => (
                              `${item.reference} · ${item.source} · ${item.verificationStatus === 'demo' ? 'demo' : 'verified'}${item.timestamp ? ` · ${formatEvidenceDate(item.timestamp)}` : ''}`
                            )).join(' / ')}
                          </small>
                          <small>
                            Profile: {signal.associatedSellers.map((item) => `@${item.username}`).join(', ')}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="signals">
                    <li>No applicable verified warning signals are available.</li>
                  </ul>
                )}
                {unverifiedCount > 0 && (
                  <p role="status">
                    {unverifiedCount} submitted evidence item{unverifiedCount === 1 ? '' : 's'} remain unverified and are excluded from this score.
                  </p>
                )}
                {foundResult.errors.length > 0 && (
                  <p role="alert">{foundResult.errors.join(' ')}</p>
                )}
              </div>
            </div>
            <SellerRecord
              seller={foundResult.seller}
              matchedBy={foundResult.matchedBy}
              query={query}
              connections={foundResult.connections}
              isDemo={foundResult.isDemo}
            />
          </div>
        )}

        {phase === 'done' && result && result.kind !== 'found' && (
          <p className="lookup-empty" role={result.kind === 'error' ? 'alert' : 'status'}>
            {result.message}
          </p>
        )}
      </div>
    </div>
  );
}
