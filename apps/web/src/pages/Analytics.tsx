import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity as ActivityIcon, Clock, Flame, Plus, Sparkles, Trophy } from 'lucide-react';
import { api } from '../api';
import { useApp } from '../context/AppContext';
import { useAsync } from '../lib/hooks';
import type { AnalyticsData } from '../types';
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Panel,
  Progress,
  SectionHeading,
  Stat,
  Tabs,
} from '../components/ui';
import { formatNumber, formatPercent, formatShortDate, relativeTime, titleCase } from '../lib/format';

type Range = '7' | '30' | '90' | '180' | '365' | 'all';

const RANGE_TABS: Array<{ id: Range; label: string }> = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: '180', label: '6 months' },
  { id: '365', label: '1 year' },
  { id: 'all', label: 'All time' },
];

const AXIS = { fill: '#6b7688', fontSize: 10 };
const GRID = 'rgba(255,255,255,0.05)';

export function AnalyticsPage() {
  const { data, openComposer } = useApp();
  const [range, setRange] = useState<Range>('30');
  const analytics = useAsync(
    () => api.get<AnalyticsData>(`/analytics?range=${range}`),
    [range],
  );
  const report = analytics.data;

  const skillChart = useMemo(() => {
    if (!report?.skillProgression?.length) return { rows: [], names: [] as string[] };
    const ranked = report.skillProgression
      .map((skill) => ({
        name: skill.name,
        last: skill.points.length ? skill.points[skill.points.length - 1]?.value ?? 0 : 0,
        points: skill.points,
      }))
      .filter((skill) => skill.points.length > 0)
      .sort((a, b) => b.last - a.last)
      .slice(0, 5);
    const dates = [...new Set(ranked.flatMap((skill) => skill.points.map((point) => point.date)))].sort();
    const rows = dates.map((date) => {
      const row: Record<string, number | string> = { date };
      for (const skill of ranked) {
        let value = 0;
        for (const point of skill.points) {
          if (point.date <= date) value = point.value;
        }
        row[skill.name] = Math.round(value * 100) / 100;
      }
      return row;
    });
    return { rows, names: ranked.map((skill) => skill.name) };
  }, [report]);

  const lineColors = ['#cfa960', '#6fbfa0', '#6d8fb8', '#b07a9c', '#d97757'];

  const summary = report?.summary;

  return (
    <>
      <PageHeader
        eyebrow="Observatory"
        title="Analytics"
        subtitle="Progression over time, where your effort flows, and which branches are going quiet."
        actions={
          <Button variant="primary" onClick={() => openComposer()}>
            <Plus size={15} /> Log activity
          </Button>
        }
      />

      <Tabs
        tabs={RANGE_TABS}
        value={range}
        onChange={setRange}
        className="mb-5"
      />

      {analytics.error ? (
        <Panel className="panel-pad text-sm text-[#e0a0a0]">{analytics.error}</Panel>
      ) : !report || analytics.loading ? (
        <Panel className="panel-pad text-sm text-ink-500">Reading your chronicle…</Panel>
      ) : !report.hasData ? (
        <Panel>
          <EmptyState
            icon={<ActivityIcon size={18} />}
            title="No data in this window"
            description="Log an activity or widen the time range. Analytics are derived from approved activities and never invent progress."
            action={<Button variant="primary" size="sm" onClick={() => openComposer()}><Plus size={14} /> Log an activity</Button>}
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="XP earned"
              value={formatNumber(summary?.earnedXp ?? 0)}
              hint={deltaLabel(report.comparison.xpDelta)}
              icon={<Sparkles size={15} />}
            />
            <Stat
              label="Activities"
              value={formatNumber(summary?.totalActivities ?? 0)}
              hint={deltaLabel(report.comparison.activityDelta)}
              icon={<Flame size={15} />}
            />
            <Stat
              label="Learning time"
              value={`${formatNumber(summary?.learningHours ?? 0)}h`}
              hint={deltaLabel(report.comparison.learningHours)}
              icon={<Clock size={15} />}
            />
            <Stat
              label="Lifetime / Level"
              value={`${formatNumber(summary?.lifetimeXp ?? 0)}`}
              hint={`Player level ${summary?.level ?? 1}`}
              icon={<Trophy size={15} />}
            />
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
            <Panel className="panel-pad">
              <SectionHeading title="XP over time" subtitle={`Current streak ${summary?.currentStreak ?? 0} · best ${summary?.furthestStreak ?? 0}`} />
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.xpSeries} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#cfa960" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#cfa960" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tick={AXIS} tickFormatter={formatShortDate} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={42} />
                    <Tooltip
                      contentStyle={{ background: '#0b0d12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: '#98a2b3' }}
                      formatter={(value) => [formatNumber(Number(value)), 'XP']}
                    />
                    <Area type="monotone" dataKey="xp" stroke="#cfa960" strokeWidth={2} fill="url(#xpFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel className="panel-pad">
              <SectionHeading title="Attribute balance" subtitle="Current effective proficiency vs lifetime peak." />
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={report.attributeRadar} outerRadius="72%">
                    <PolarGrid stroke="rgba(255,255,255,0.08)" />
                    <PolarAngleAxis dataKey="attribute" tick={{ fill: '#98a2b3', fontSize: 10 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#3d4759', fontSize: 9 }} axisLine={false} />
                    <Radar name="Peak" dataKey="peak" stroke="#6b7688" fill="#6b7688" fillOpacity={0.08} strokeDasharray="3 3" />
                    <Radar name="Current" dataKey="current" stroke="#cfa960" fill="#cfa960" fillOpacity={0.22} />
                    <Tooltip
                      contentStyle={{ background: '#0b0d12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
                      formatter={(value) => Number(value).toFixed(1)}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <Panel className="panel-pad">
              <SectionHeading title="Where the XP went" subtitle="Approved XP by attribute." />
              <div className="h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.activityBreakdown} layout="vertical" margin={{ top: 0, right: 12, left: 18, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: '#c3c9d4', fontSize: 10 }} width={74} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0b0d12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
                      formatter={(value, name) => [formatNumber(Number(value)), name === 'xp' ? 'XP' : 'Activities']}
                    />
                    <Bar dataKey="xp" radius={[0, 3, 3, 0]} barSize={14}>
                      {report.activityBreakdown.map((entry, index) => (
                        <Cell key={entry.name} fill={['#cfa960', '#6d8fb8', '#6fbfa0', '#b07a9c', '#d97757', '#a89155', '#7f9fa8'][index % 7]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel className="panel-pad">
              <SectionHeading title="Skill momentum" subtitle="Top five practiced skills in this window." />
              <div className="h-[230px]">
                {skillChart.rows.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-xs text-ink-500">No skill-linked XP in this window.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={skillChart.rows} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke={GRID} vertical={false} />
                      <XAxis dataKey="date" tick={AXIS} tickFormatter={formatShortDate} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={42} />
                      <Tooltip
                        contentStyle={{ background: '#0b0d12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
                        formatter={(value) => [Number(value).toFixed(1), 'Proficiency']}
                      />
                      {skillChart.names.map((name, index) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={lineColors[index % lineColors.length]}
                          strokeWidth={1.8}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
              {skillChart.names.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  {skillChart.names.map((name, index) => (
                    <span key={name} className="inline-flex items-center gap-1 text-[10px] text-ink-400">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: lineColors[index % lineColors.length] }} />
                      {name}
                    </span>
                  ))}
                </div>
              ) : null}
            </Panel>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Panel className="panel-pad">
              <SectionHeading title="Level trajectory" subtitle={`Player level ${summary?.level ?? 1} · financial XP ${formatNumber(summary?.financialXp ?? 0)}`} />
              <div className="h-[190px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.levelSeries} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
                    <defs>
                      <linearGradient id="levelFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6fbfa0" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#6fbfa0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="date" tick={AXIS} tickFormatter={formatShortDate} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={38} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ background: '#0b0d12', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 12 }}
                      formatter={(value) => [`Level ${value}`, 'Level']}
                    />
                    <Area type="stepAfter" dataKey="level" stroke="#6fbfa0" strokeWidth={2} fill="url(#levelFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel className="panel-pad">
              <SectionHeading title="Neglected branches" subtitle="Proficiency decays only after the grace period; lifetime XP is untouched." />
              <div className="space-y-2">
                {report.neglect.slice(0, 7).map((attribute) => (
                  <div key={attribute.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-ink-300">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: attribute.color }} />
                        {attribute.name}
                      </span>
                      <span className="text-[10px] text-ink-500">
                        {attribute.lastActivityAt ? `${attribute.daysInactive ?? 0}d quiet` : 'never practiced'} · {attribute.proficiency.toFixed(0)}
                      </span>
                    </div>
                    <Progress
                      value={attribute.proficiency}
                      color={attribute.daysInactive && attribute.daysInactive > 21 ? '#c05a5a' : attribute.color}
                      height={4}
                      className="mt-1"
                    />
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Panel className="panel-pad">
              <SectionHeading title="Streaks" subtitle="Optional consistency rituals." />
              {report.streaks.length === 0 ? (
                <p className="py-4 text-xs text-ink-500">No streaks configured. Create them from the Quests page.</p>
              ) : (
                <div className="space-y-2">
                  {report.streaks.map((streak) => {
                    const pct = streak.longest > 0 ? (streak.current / streak.longest) * 100 : 0;
                    return (
                      <div key={streak.id} className="flex items-center gap-3">
                        <Flame size={14} className={streak.current > 0 ? 'text-gold-500' : 'text-ink-600'} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-ink-200">{streak.name}</span>
                            <span className="text-[10px] text-ink-500">{streak.current} / {streak.longest} best</span>
                          </div>
                          <Progress value={pct} height={3} className="mt-1" />
                        </div>
                        <Badge tone="muted">{titleCase(streak.cadence)}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel className="panel-pad">
              <SectionHeading title="Recent activity stream" subtitle={`${report.recentActivities.length} entries in view`} />
              <div className="divide-y divide-white/[0.05]">
                {report.recentActivities.slice(0, 8).map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate text-ink-200">{activity.title}</p>
                      <p className="text-[10px] text-ink-500">{titleCase(activity.category || 'uncategorised')} · {relativeTime(activity.occurredAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {activity.status === 'reversed' ? <Badge tone="danger">reversed</Badge> : null}
                      <span className="font-mono text-gold-400">+{formatNumber(activity.playerXp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <p className="mt-4 text-[10px] text-ink-600">
            Percent of lifetime XP from this window: {formatPercent(
              summary && summary.lifetimeXp > 0 ? summary.earnedXp / summary.lifetimeXp : 0,
            )} · {data?.profile?.progression.title ?? '—'}
          </p>
        </>
      )}
    </>
  );
}

function deltaLabel(delta: number | null): string {
  if (delta === null || delta === undefined) return 'no prior baseline';
  const positive = delta >= 0;
  return `${positive ? '+' : ''}${formatNumber(delta)} vs previous period`;
}
