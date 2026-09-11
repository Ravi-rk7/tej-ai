'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { getSafeInternalPath } from '@/lib/authRedirect';
import styles from '@/components/portfolio/portfolio.module.css';
function Callback() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [expired, setExpired] = useState(false);
  const failed = params.has('error') || params.has('error_code');
  useEffect(() => {
    if (session && !failed) router.replace(getSafeInternalPath(params.get('next')));
    const timer = setTimeout(() => setExpired(true), 15000);
    return () => clearTimeout(timer);
  }, [session, failed, params, router]);
  const rejected = failed || expired || (!loading && !session);
  return <main className={styles.page}><h1 className={styles.title}>{rejected ? 'Sign-in could not be completed' : 'Completing your sign-in…'}</h1><p className={styles.lead} role="status">{rejected ? 'The sign-in link may have expired, been denied, or opened in another browser. Start again in this browser.' : 'Verifying your GitHub session.'}</p>{rejected && <Link href="/login" className={styles.button}>Try sign-in again</Link>}<Link href="/demo" className={styles.button}>Explore demo</Link></main>;
}
export default function Page() { return <Suspense fallback={<p role="status">Completing sign-in…</p>}><Callback /></Suspense>; }
