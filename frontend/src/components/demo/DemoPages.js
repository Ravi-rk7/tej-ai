'use client';
import Link from 'next/link';
import { useDemo } from './DemoProvider';
import { HistoryView, ProgressView, ResultView, RoutineView } from '@/components/portfolio/PortfolioViews';
import TodayRoutineCard from '@/components/progress/TodayRoutineCard';
import ContributionHeatmap from '@/components/progress/ContributionHeatmap';
import StreakSummaryCard from '@/components/progress/StreakSummaryCard';
import AdherenceCard from '@/components/progress/AdherenceCard';
import styles from '@/components/portfolio/portfolio.module.css';

export function DemoPage({ view = 'dashboard', sampleId }) {
  const { results, routine, toggle, message } = useDemo();
  const titles = { dashboard: 'Small habits. A clearer picture.', history: 'Your sample history', progress: 'A little progress, every day.', result: 'Explore a sample result' };
  const result = results.find(item => item.scanId === sampleId);
  return <main className={styles.page}>
    <p className={styles.eyebrow}>Your skincare journal</p><h1 className={styles.title}>{titles[view]}</h1>
    <p className={styles.lead}>Explore the product with a synthetic routine and eight illustrative analyses. The sample charts use legacy scales; they do not represent Face++ capabilities or real outcomes.</p>
    {view === 'result' ? result ? <ResultView result={result} /> : <article className={styles.card}><h2>Sample result not found</h2><Link href="/demo/history" className={styles.button}>Back to sample history</Link></article> : null}
    {view === 'history' && <HistoryView results={results} resultHref={id => `/demo/results/${id}`} />}
    {['dashboard', 'progress'].includes(view) && <>
      <TodayRoutineCard today={routine.today} preferences={routine.preferences} pending={[]} onToggle={toggle} message={message} generatedAt={routine.generatedAt} latestRoutinePath="/demo/results/sample-1" />
      <div className={styles.grid}><StreakSummaryCard streak={routine.streak} /><AdherenceCard adherence={routine.adherence} /></div>
      <ContributionHeatmap activity={routine.activity} />
      <div style={{ marginTop: 22 }}><ProgressView results={results} /></div>
      {view === 'dashboard' && <div style={{ marginTop: 22 }}><RoutineView routine={results[0].routine} /></div>}
    </>}
    <div className={styles.row} style={{ marginTop: 28 }}><Link className={`${styles.button} ${styles.primary}`} href="/login" prefetch={false}>Start your own routine</Link><Link className={styles.button} href="/about">About this project</Link></div>
  </main>;
}
