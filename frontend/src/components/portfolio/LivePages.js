'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import RoutineProgressSection from '@/components/progress/RoutineProgressSection';
import { getDashboard, getHistory, getScanProgress, getScanResult, deleteScan } from '@/lib/api';
import { toPortfolioView, generateRulesRoutine } from '@shared/portfolio';
import { HistoryView, ProgressView, ResultView, RoutineView } from './PortfolioViews';
import styles from './portfolio.module.css';

function Failure({ message, retry }) { return <article className={styles.card} role="alert"><h2>The live service needs a moment</h2><p className={styles.lead}>{message || 'The free backend may be waking up, or its database may be paused.'}</p><div className={styles.row}><button className={styles.button} onClick={retry}>Retry</button><Link className={styles.button} href="/demo">Explore sample demo</Link></div></article>; }
function useLiveData(loader) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) setState({ loading: true, data: null, error: null }); });
    loader(controller.signal).then(data => { if (!controller.signal.aborted) setState({ loading: false, data, error: null }); })
      .catch(error => { if (!controller.signal.aborted) setState({ loading: false, data: null, error: error.message }); });
    return () => controller.abort();
  }, [loader, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
const loadDashboard = signal => getDashboard({ signal });
const loadProgress = signal => getScanProgress({ range: '1y', signal });

export function LiveDashboard() {
  const data = useLiveData(loadDashboard);
  return <AppLayout><div className={styles.page}>
    <p className={styles.eyebrow}>Your skincare journal</p><h1 className={styles.title}>Welcome to your daily rhythm.</h1><p className={styles.lead}>Build a routine that fits your day. A face scan is always optional.</p>
    {data.loading ? <p role="status">Loading your journal…</p> : data.error ? <Failure message={data.error} retry={data.retry} /> : <>
      <div className={styles.grid}><article className={styles.card}><h2>Live analysis allowance</h2><p className={styles.number}>{data.data.usage.remaining} / {data.data.usage.limit}</p><p className={styles.muted}>Scans remaining this UTC month. One successful scan per UTC day; shared capacity also applies.</p><Link href="/scan" className={styles.button} style={{ marginTop: 16 }}>{data.data.liveScanEnabled ? 'Check live availability' : 'About live analysis'}</Link></article><article className={styles.card}><h2>Your latest result</h2><p className={styles.muted}>{data.data.latestScan ? `${data.data.latestScan.provider.name} · ${new Date(data.data.latestScan.createdAt).toLocaleDateString()}` : 'No scans yet. Start with a simple daily routine.'}</p>{data.data.latestScan && <Link className={styles.button} href={`/results?scanId=${data.data.latestScan.scanId}`} style={{ marginTop: 16 }}>View saved result</Link>}</article></div>
    </>}
    <RoutineProgressSection latestRoutinePath={data.data?.latestScan ? `/results?scanId=${data.data.latestScan.scanId}` : undefined} />
    <div style={{ marginTop: 22 }}><RoutineView routine={data.data?.latestScan?.routine || generateRulesRoutine()} /></div>
    <div className={styles.row} style={{ marginTop: 22 }}><Link href="/progress" className={styles.button}>Explore your progress</Link><Link href="/history" className={styles.button}>View history</Link></div>
  </div></AppLayout>;
}

export function LiveHistory() {
  const [items, setItems] = useState([]), [cursor, setCursor] = useState(null), [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('loading'), [message, setMessage] = useState('');
  const controller = useRef(null);
  const load = useCallback(async (next = null) => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setStatus('loading'); setMessage('');
    try {
      const page = await getHistory({ cursor: next, signal: request.signal });
      if (request.signal.aborted) return;
      if (page.schemaVersion !== 2 || !Array.isArray(page.items)) throw new Error('History format is unavailable.');
      setItems(previous => next ? [...new Map([...previous, ...page.items].map(item => [item.scanId, item])).values()] : page.items);
      setCursor(page.pageInfo.nextCursor); setHasMore(page.pageInfo.hasMore); setStatus('ready');
    } catch (error) { if (!request.signal.aborted) { setStatus('error'); setMessage(error.message); } }
  }, []);
  useEffect(() => { queueMicrotask(() => load()); return () => controller.current?.abort(); }, [load]);
  return <AppLayout><div className={styles.page}><p className={styles.eyebrow}>Your private record</p><h1 className={styles.title}>History, at your pace.</h1><p className={styles.lead}>Saved observations stay labeled with their original provider. Deleting a result does not reset scan capacity.</p>
    {status === 'error' && <Failure message={message} retry={() => load(items.length ? cursor : null)} />}
    <HistoryView results={items} resultHref={id => `/results?scanId=${id}`} />
    {status === 'loading' && <p role="status">Loading saved results…</p>}
    {hasMore && <button className={styles.button} disabled={status === 'loading'} onClick={() => load(cursor)}>Load more results</button>}
  </div></AppLayout>;
}

export function LiveProgress() {
  const data = useLiveData(loadProgress);
  return <AppLayout><div className={styles.page}><p className={styles.eyebrow}>Consistency, made visible</p><h1 className={styles.title}>Your progress.</h1><p className={styles.lead}>Routine consistency and provider-specific readings tell different stories. Neither is a medical measurement.</p>
    <RoutineProgressSection />
    <div style={{ marginTop: 24 }}>{data.loading ? <p role="status">Loading progress…</p> : data.error ? <Failure message={data.error} retry={data.retry} /> : <ProgressView suppliedGroups={data.data.groups || []} />}</div>
  </div></AppLayout>;
}

export function LiveResult() {
  const params = useSearchParams(), router = useRouter();
  const id = params.get('scanId');
  const [deleting, setDeleting] = useState(false), [message, setMessage] = useState('');
  const loader = useCallback(async signal => id ? toPortfolioView(await getScanResult(id, { signal })) : null, [id]);
  const data = useLiveData(loader);
  const remove = async () => {
    if (!window.confirm('Delete this saved analysis? This cannot be undone.')) return;
    setDeleting(true);
    try { await deleteScan(id); router.replace('/history'); }
    catch (error) { setMessage(error.message); setDeleting(false); }
  };
  return <AppLayout><div className={styles.page}><p className={styles.eyebrow}>A closer look</p><h1 className={styles.title}>Your saved result.</h1>
    {data.loading ? <p role="status">Loading your analysis…</p> : data.error ? <Failure message={data.error} retry={data.retry} /> : <ResultView result={data.data} />}
    <div className={styles.row} style={{ marginTop: 24 }}><Link href="/history" className={styles.button}>Back to history</Link>{data.data && <button className={`${styles.button} ${styles.danger}`} disabled={deleting} onClick={remove}>Delete this result</button>}</div><p role="status" className={styles.status}>{message}</p>
  </div></AppLayout>;
}
