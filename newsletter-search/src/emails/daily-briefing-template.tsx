/**
 * Daily Intelligence Briefing - Email Template
 * 
 * A professional dark-mode email template for rendering BriefingContent
 * to HTML for inbox delivery. Mirrors the Glass Cockpit aesthetic.
 * 
 * Uses @react-email/components for maximum email client compatibility.
 */

import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Heading,
  Hr,
  Link,
  Preview,
  Font,
} from '@react-email/components';
import type { BriefingContent, NarrativeCluster, SerendipityItem } from '@/lib/briefing';

// ============================================================================
// Types
// ============================================================================

interface DailyBriefingEmailProps {
  content: BriefingContent;
  briefingId: string;
  generatedAt: string;
  emailCount: number;
  dashboardUrl?: string;
}

// ============================================================================
// Color Palette (Dark Mode Professional)
// ============================================================================

const colors = {
  bg: '#09090b',           // zinc-950
  bgCard: '#18181b',       // zinc-900
  bgCardHover: '#27272a',  // zinc-800
  border: '#3f3f46',       // zinc-700
  borderSubtle: '#27272a', // zinc-800
  textPrimary: '#fafafa',  // zinc-50
  textSecondary: '#a1a1aa',// zinc-400
  textMuted: '#71717a',    // zinc-500
  accent: '#10b981',       // emerald-500
  accentBg: 'rgba(16, 185, 129, 0.1)',
  positive: '#34d399',     // emerald-400
  negative: '#f87171',     // red-400
  mixed: '#fbbf24',        // amber-400
  serendipity: '#a78bfa',  // violet-400
  serendipityBg: 'rgba(167, 139, 250, 0.1)',
};

// ============================================================================
// Styles (Inline for email compatibility)
// ============================================================================

const styles = {
  body: {
    backgroundColor: colors.bg,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    margin: 0,
    padding: '40px 0',
  },
  container: {
    maxWidth: '680px',
    margin: '0 auto',
    backgroundColor: colors.bg,
  },
  header: {
    textAlign: 'center' as const,
    paddingBottom: '32px',
    borderBottom: `1px solid ${colors.borderSubtle}`,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: '28px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    margin: '0 0 8px 0',
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: '14px',
    margin: 0,
  },
  sectionTitle: {
    color: colors.accent,
    fontSize: '12px',
    fontWeight: '600',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    margin: '32px 0 16px 0',
  },
  executiveSummaryCard: {
    backgroundColor: colors.bgCard,
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
    padding: '24px',
    marginBottom: '16px',
  },
  executiveSummaryText: {
    color: colors.textPrimary,
    fontSize: '16px',
    lineHeight: '1.7',
    margin: 0,
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
  clusterCard: {
    backgroundColor: colors.bgCard,
    borderRadius: '12px',
    border: `1px solid ${colors.border}`,
    padding: '20px',
    marginBottom: '16px',
  },
  clusterHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  clusterTitle: {
    color: colors.textPrimary,
    fontSize: '18px',
    fontWeight: '600',
    margin: '0 0 4px 0',
  },
  clusterBadge: {
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '20px',
    marginBottom: '12px',
    marginRight: '8px',
  },
  clusterSynthesis: {
    color: colors.textSecondary,
    fontSize: '15px',
    lineHeight: '1.7',
    margin: '0 0 16px 0',
    fontFamily: 'Georgia, "Times New Roman", serif',
  },
  counterPoint: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderLeft: `3px solid ${colors.mixed}`,
    borderRadius: '0 8px 8px 0',
    padding: '12px 16px',
    marginTop: '12px',
  },
  counterPointLabel: {
    color: colors.mixed,
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    margin: '0 0 4px 0',
  },
  counterPointText: {
    color: colors.textSecondary,
    fontSize: '14px',
    lineHeight: '1.6',
    margin: 0,
  },
  sourcesLabel: {
    color: colors.textMuted,
    fontSize: '11px',
    fontWeight: '500',
    marginTop: '12px',
    display: 'block',
  },
  serendipityCard: {
    backgroundColor: colors.serendipityBg,
    borderRadius: '12px',
    border: `1px solid rgba(167, 139, 250, 0.3)`,
    padding: '20px',
    marginBottom: '16px',
  },
  serendipityTitle: {
    color: colors.serendipity,
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 8px 0',
  },
  serendipityText: {
    color: colors.textSecondary,
    fontSize: '14px',
    lineHeight: '1.6',
    margin: '0 0 8px 0',
  },
  serendipityPublisher: {
    color: colors.textMuted,
    fontSize: '12px',
    margin: 0,
  },
  radarContainer: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginTop: '12px',
  },
  radarSignal: {
    backgroundColor: colors.accentBg,
    color: colors.accent,
    fontSize: '13px',
    fontWeight: '500',
    padding: '6px 14px',
    borderRadius: '20px',
    border: `1px solid rgba(16, 185, 129, 0.3)`,
  },
  footer: {
    textAlign: 'center' as const,
    paddingTop: '32px',
    borderTop: `1px solid ${colors.borderSubtle}`,
    marginTop: '32px',
  },
  footerText: {
    color: colors.textMuted,
    fontSize: '12px',
    margin: '0 0 12px 0',
  },
  footerLink: {
    color: colors.accent,
    textDecoration: 'none',
  },
  hr: {
    border: 'none',
    borderTop: `1px solid ${colors.borderSubtle}`,
    margin: '24px 0',
  },
};

// ============================================================================
// Helper Components
// ============================================================================

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const config = {
    Positive: { bg: 'rgba(52, 211, 153, 0.15)', color: colors.positive, label: '↑ Positive' },
    Negative: { bg: 'rgba(248, 113, 113, 0.15)', color: colors.negative, label: '↓ Negative' },
    Mixed: { bg: 'rgba(251, 191, 36, 0.15)', color: colors.mixed, label: '◐ Mixed' },
  };
  const { bg, color, label } = config[sentiment as keyof typeof config] || config.Mixed;
  
  return (
    <span style={{ ...styles.clusterBadge, backgroundColor: bg, color }}>
      {label}
    </span>
  );
}

function SourceCountBadge({ count }: { count: number }) {
  return (
    <span style={{ 
      ...styles.clusterBadge, 
      backgroundColor: 'rgba(16, 185, 129, 0.1)', 
      color: colors.accent 
    }}>
      {count} {count === 1 ? 'Source' : 'Sources'}
    </span>
  );
}

function ClusterCard({ cluster }: { cluster: NarrativeCluster }) {
  return (
    <Section style={styles.clusterCard}>
      <div>
        <SentimentBadge sentiment={cluster.consensus_sentiment} />
        <SourceCountBadge count={cluster.source_ids?.length || 0} />
      </div>
      <Heading as="h3" style={styles.clusterTitle}>
        {cluster.title}
      </Heading>
      <Text style={styles.clusterSynthesis}>
        {cluster.synthesis}
      </Text>
      {cluster.counter_point && (
        <div style={styles.counterPoint}>
          <Text style={styles.counterPointLabel}>⚡ Dissenting View</Text>
          <Text style={styles.counterPointText}>{cluster.counter_point}</Text>
        </div>
      )}
      {cluster.source_ids && cluster.source_ids.length > 0 && (
        <Text style={styles.sourcesLabel}>
          Cited: {cluster.source_ids.map(id => id.substring(0, 8)).join(', ')}...
        </Text>
      )}
    </Section>
  );
}

function SerendipityCard({ item }: { item: SerendipityItem }) {
  return (
    <Section style={styles.serendipityCard}>
      <Heading as="h4" style={styles.serendipityTitle}>
        ✨ {item.title}
      </Heading>
      <Text style={styles.serendipityText}>
        {item.insight}
      </Text>
      <Text style={styles.serendipityPublisher}>
        via {item.publisher}
      </Text>
    </Section>
  );
}

// ============================================================================
// Main Template
// ============================================================================

export function DailyBriefingEmail({
  content,
  briefingId,
  generatedAt,
  emailCount,
  dashboardUrl = 'https://newsletter-control-center.vercel.app/briefing',
}: DailyBriefingEmailProps) {
  const date = new Date(generatedAt);
  const formattedDate = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <Html>
      <Head>
        <Font
          fontFamily="Georgia"
          fallbackFontFamily="serif"
        />
        <title>Daily Intelligence Briefing • {formattedDate}</title>
      </Head>
      <Preview>
        {content.executive_summary?.[0]?.substring(0, 100) || 'Your Daily Intelligence Briefing'}...
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Header */}
          <Section style={styles.header}>
            <Heading as="h1" style={styles.headerTitle}>
              Intelligence Briefing
            </Heading>
            <Text style={styles.headerSubtitle}>
              {formattedDate} • {formattedTime} • {emailCount} newsletters analyzed
            </Text>
          </Section>

          {/* Executive Summary */}
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          {content.executive_summary?.map((point, idx) => (
            <Section key={idx} style={styles.executiveSummaryCard}>
              <Text style={styles.executiveSummaryText}>
                {point}
              </Text>
            </Section>
          ))}

          <Hr style={styles.hr} />

          {/* Narrative Clusters */}
          <Text style={styles.sectionTitle}>Key Narratives</Text>
          {content.narrative_clusters?.map((cluster, idx) => (
            <ClusterCard key={idx} cluster={cluster} />
          ))}

          <Hr style={styles.hr} />

          {/* Serendipity Corner */}
          {content.serendipity_corner && content.serendipity_corner.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>✨ Serendipity Corner</Text>
              <Text style={{ ...styles.footerText, marginBottom: '16px' }}>
                High-value insights outside the main narratives
              </Text>
              {content.serendipity_corner.map((item, idx) => (
                <SerendipityCard key={idx} item={item} />
              ))}
              <Hr style={styles.hr} />
            </>
          )}

          {/* Radar Signals */}
          {content.radar_signals && content.radar_signals.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>📡 Radar Signals</Text>
              <Text style={{ ...styles.footerText, marginBottom: '12px' }}>
                Emerging terms with unusual velocity
              </Text>
              <div style={styles.radarContainer}>
                {content.radar_signals.map((signal, idx) => (
                  <span key={idx} style={styles.radarSignal}>
                    {signal}
                  </span>
                ))}
              </div>
              <Hr style={styles.hr} />
            </>
          )}

          {/* Footer */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Generated by Newsletter Control Center
            </Text>
            <Text style={styles.footerText}>
              <Link href={`${dashboardUrl}?id=${briefingId}`} style={styles.footerLink}>
                View Interactive Dashboard →
              </Link>
            </Text>
            <Text style={{ ...styles.footerText, fontSize: '11px' }}>
              Briefing ID: {briefingId}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default DailyBriefingEmail;

