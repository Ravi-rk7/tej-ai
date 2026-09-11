'use client';
import Link from 'next/link';
import { useId, useState } from 'react';
import { buildPortfolioProgress } from '@shared/portfolio';
import styles from './portfolio.module.css';

export const displayDate = value => new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const number = value => Number.isFinite(value) ? Number(value.toFixed(2)) : '—';

export function RoutineView({ routine }) {
  return <article className={styles.card}>
    <div className={styles.row}><h2>Your everyday routine</h2><span className={styles.badge}>{routine?.source === 'rules' ? 'Rule-based guidance' : 'Saved routine'}</span></div>
    <div className={styles.grid}>{['morning', 'night'].map(period => <div key={period}>
      <h3>{period === 'morning' ? 'Morning · protect' : 'Night · reset'}</h3>
      <ol className={styles.list}>{(routine?.[period] || []).map((step, index) => <li key={step.name}>
        <strong>{index + 1}. {step.name}</strong><p className={styles.muted}>{step.instructions}</p>
      </li>)}</ol>
    </div>)}</div>
    <p className={styles.muted}>{routine?.safety?.patchTest} {routine?.safety?.disclaimer}</p>
  </article>;
}

export function ResultView({ result }) {
  if (!result) return <article className={styles.card}><h2>No result selected</h2><p className={styles.muted}>Choose a saved result from history.</p></article>;
  return <>
    <div className={styles.row}><span className={styles.badge}>{result.source === 'sample' ? 'Synthetic sample' : 'Saved analysis'}</span><span className={styles.muted}>{displayDate(result.createdAt)} · {result.provider.name}</span></div>
    <div className={styles.grid}>
      <article className={styles.card}><h2>{result.overallScore?.label || 'Overall score'}</h2><p className={styles.number}>{result.overallScore ? number(result.overallScore.value) : 'Not provided'}</p><p className={styles.muted}>{result.overallScore ? `${result.overallScore.min}–${result.overallScore.max} ${result.overallScore.unit}` : 'This result has no verified overall score. Individual observations stand on their own.'}</p></article>
      <article className={styles.card}><h2>Skin observations</h2><p className={styles.muted}>Skin type: {result.skinType || 'Not provided'}</p><ul className={styles.list}>{result.observations.map(item => <li key={item.key}><strong>{item.label}</strong><p className={styles.muted}>{item.value}</p></li>)}</ul>{!result.observations.length && <p className={styles.muted}>No supported categorical observations.</p>}</article>
    </div>
    {result.metrics.length > 0 && <div className={styles.grid}>{result.metrics.map(metric => <article className={styles.card} key={metric.key}><h2>{metric.label}</h2><p className={styles.number}>{number(metric.value)}</p><p className={styles.muted}>{metric.min}–{metric.max} {metric.unit} · {metric.direction === 'neutral' ? 'No better/worse interpretation' : `${metric.direction === 'higher' ? 'Higher' : 'Lower'} values on this scale are better`}</p></article>)}</div>}
    <RoutineView routine={result.routine} />
    <p className={styles.lead}>{result.warnings.join(' ')} Provider mapping: {result.provider.mappingVersion}.</p>
  </>;
}

export function HistoryView({ results, resultHref }) {
  const [filter, setFilter] = useState('all');
  const providers = [...new Set(results.map(result => result.provider.name))];
  const filtered = results.filter(result => filter === 'all' || result.provider.name === filter);
  return <>
    <label className={styles.row}>Provider <select className={styles.select} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All providers</option>{providers.map(provider => <option key={provider}>{provider}</option>)}</select></label>
    <div className={styles.grid}>{filtered.map(result => <article className={styles.card} key={result.scanId}>
      <span className={styles.eyebrow}>{displayDate(result.createdAt)}</span><h2 style={{ marginTop: 12 }}>{result.skinType || 'Skin analysis'}</h2>
      <p className={styles.muted}>{result.provider.name} · {result.metrics.length} supported metrics</p><p className={styles.muted}>{result.overallScore ? `${result.overallScore.label}: ${number(result.overallScore.value)}` : 'No overall score provided'}</p>
      <Link className={styles.button} href={resultHref(result.scanId)} style={{ marginTop: 16 }}>View result</Link>
    </article>)}</div>
    {!filtered.length && <article className={styles.card}><h2>No saved analyses yet</h2><p className={styles.muted}>Routine tracking works before your first scan.</p></article>}
  </>;
}

export function ProgressView({ results, suppliedGroups }) {
  const groups = suppliedGroups || buildPortfolioProgress(results);
  const [selected, setSelected] = useState('');
  const [range, setRange] = useState('90');
  const id = useId();
  const metric = groups.find(group => group.identity === selected) || groups[0];
  const allPoints = metric?.points || [];
  const end = Math.max(...allPoints.map(point => Date.parse(point.createdAt)));
  const points = allPoints.filter(point => Date.parse(point.createdAt) >= end - Number(range) * 86400000);
  const latest = points.at(-1)?.value;
  const change = points.length > 1 ? latest - points[0].value : null;
  const spread = Math.max(1, end - Date.parse(points[0]?.createdAt));
  const xy = point => [35 + (Date.parse(point.createdAt) - Date.parse(points[0].createdAt)) / spread * 590, 170 - (point.value - metric.min) / (metric.max - metric.min) * 145];
  return <article className={styles.card}>
    <h2>Progress over time</h2><p className={styles.muted}>Only the same provider, mapping and scale are compared. Camera conditions can change readings.</p>
    {!metric ? <p className={styles.lead}>No comparable numerical metrics yet. Your routine calendar remains available.</p> : <>
      <div className={styles.row} style={{ marginTop: 18 }}>
        <label>Metric <select aria-label="Progress metric" className={styles.select} value={metric.identity} onChange={event => setSelected(event.target.value)}>{groups.map(group => <option key={group.identity} value={group.identity}>{group.label} · {group.provider.name} · {group.provider.mappingVersion}</option>)}</select></label>
        <label>Window <select aria-label="Progress window" className={styles.select} value={range} onChange={event => setRange(event.target.value)}><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label>
      </div>
      <svg className={styles.chart} viewBox="0 0 660 200" role="img" aria-labelledby={`${id}-chart-title`}>
        <title id={`${id}-chart-title`}>{metric.label}: {points.length} readings. Values are also listed below.</title>
        {[0, .5, 1].map(part => <g key={part}><line x1="35" x2="625" y1={170 - part * 145} y2={170 - part * 145} stroke="#e8e0f0" /><text x="1" y={174 - part * 145} fontSize="10" fill="#776c88">{number(metric.min + part * (metric.max - metric.min))}</text></g>)}
        <polyline points={points.map(point => xy(point).join(',')).join(' ')} fill="none" stroke="#7454b0" strokeWidth="3" />
        {points.map(point => { const [cx, cy] = xy(point); return <circle key={point.scanId || point.createdAt} cx={cx} cy={cy} r="4" fill="#7454b0" />; })}
      </svg>
      <p className={styles.muted}>Latest: {number(latest)} {metric.unit} · Change from first reading in window: {change === null ? 'Not enough data' : `${change > 0 ? '+' : ''}${number(change)} ${metric.unit}`}{metric.direction === 'neutral' ? ' · Confidence is not severity.' : ''}</p>
      <details style={{ marginTop: 14 }}><summary>View readings as a table</summary><table className={styles.table}><thead><tr><th>Date (UTC)</th><th>{metric.label}</th></tr></thead><tbody>{points.map(point => <tr key={point.scanId || point.createdAt}><td>{displayDate(point.createdAt)}</td><td>{number(point.value)} {metric.unit}</td></tr>)}</tbody></table></details>
    </>}
  </article>;
}
