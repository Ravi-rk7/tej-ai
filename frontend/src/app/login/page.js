'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { liveAuthConfigured } from '@/lib/supabaseClient';
import { signInWithGithub } from '@/lib/oauth';
import { getSafeInternalPath } from '@/lib/authRedirect';
import Navbar from '@/components/layout/Navbar';
import styles from '@/components/portfolio/portfolio.module.css';
function Login() {
  const { session, loading } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const next = getSafeInternalPath(params.get('next'));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!loading && session) router.replace(next); }, [session, loading, next, router]);
  const login = async () => {
    setBusy(true); setMessage('Opening GitHub…');
    try { await signInWithGithub(next); } catch (error) { setMessage(error.message); setBusy(false); }
  };
  return <><Navbar /><main className={styles.page} style={{ maxWidth: 630, paddingTop: 70 }}>
    <p className={styles.eyebrow}>Your personal journal</p><h1 className={styles.title}>Make room for a little care.</h1>
    <p className={styles.lead}>Sign in with GitHub to save your routine and private history. Live scans are optional and have a small shared allowance.</p>
    <article className={styles.card}><h2>Welcome to TejAi</h2>
      {liveAuthConfigured ? <button className={`${styles.button} ${styles.primary}`} disabled={busy || loading} onClick={login}>Continue with GitHub</button> : <p className={styles.muted}>Live sign-in is not configured in this deployment. The complete sample workspace is available below.</p>}
      <p role="status" className={styles.status}>{message}</p><Link className={styles.button} href="/demo">Explore the sample demo</Link>
      <p className={styles.muted} style={{ marginTop: 20 }}>Using the live app is subject to the <Link href="/terms">terms</Link> and <Link href="/privacy">privacy notice</Link>. Face-scan consent is requested separately.</p>
    </article>
  </main></>;
}
export default function Page() { return <Suspense fallback={<p role="status">Preparing sign-in…</p>}><Login /></Suspense>; }
