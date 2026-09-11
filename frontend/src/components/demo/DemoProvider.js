'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createDemoState, loadDemoState, sampleResults, sampleRoutine, saveDemoState } from '@/lib/demo/data';
import styles from '@/components/portfolio/portfolio.module.css';

const DemoContext = createContext(null);
export const useDemo = () => useContext(DemoContext);
const storage = () => { try { return window.localStorage; } catch { return null; } };
export default function DemoProvider({ children }) {
  const [state, setState] = useState(null);
  const [message, setMessage] = useState('');
  const pathname = usePathname();
  useEffect(() => { queueMicrotask(() => {
    const browserStorage = storage();
    const initialState = loadDemoState(browserStorage);
    saveDemoState(browserStorage, initialState);
    setState(initialState);
  }); }, []);
  const commit = next => {
    setState(next);
    const saved = saveDemoState(storage(), next);
    setMessage(saved ? 'Sample changes saved on this browser.' : 'Browser storage is unavailable. Sample changes last for this visit.');
  };
  const toggle = period => {
    if (!['morning', 'night'].includes(period)) return;
    commit({ ...state, completed: state.completed.includes(period) ? state.completed.filter(value => value !== period) : [...state.completed, period] });
  };
  return <div style={{ minHeight: '100vh', background: '#faf7fd' }}>
    <nav className={styles.nav} aria-label="Demo navigation"><Link className={styles.brand} href="/">TejAi<span className={styles.badge} style={{ marginLeft: 10 }}>PLAYGROUND</span></Link>
      <div className={styles.row}>{[['/demo', 'Overview'], ['/demo/history', 'History'], ['/demo/progress', 'Progress']].map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link>)}<Link href="/login" prefetch={false} className={styles.button}>Try live app</Link></div>
    </nav>
    <div className={styles.banner}><strong>Sample demo · synthetic data</strong><span>No photo, account or live API is used. Sample clock: {state?.today || 'loading'} (UTC).</span><button className={styles.button} onClick={() => commit(createDemoState())}>Reset demo</button></div>
    {state ? <DemoContext.Provider value={{ state, results: sampleResults(state.today), routine: sampleRoutine(state), toggle, message }}>{children}</DemoContext.Provider> : <main className={styles.page}><p role="status">Preparing the sample workspace…</p></main>}
  </div>;
}
