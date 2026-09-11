'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthProvider';
import { createDeletionChallenge, deleteAccount, getPrivacyStatus, withdrawPrivacyConsent } from '@/lib/api';
import { signInWithProvider } from '@/lib/oauth';
import styles from '@/components/portfolio/portfolio.module.css';
const CHALLENGE_KEY = 'tejai.deletion.challenge';
export default function Settings() {
  const { user, signOut } = useAuth(), router = useRouter();
  const provider = user?.app_metadata?.provider;
  const canReauthenticate = ['google', 'github'].includes(provider);
  const [privacy, setPrivacy] = useState(null), [challenge, setChallenge] = useState(null), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    getPrivacyStatus({ signal: controller.signal }).then(value => { if (!controller.signal.aborted) setPrivacy(value); }).catch(() => {});
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      try { const value = JSON.parse(sessionStorage.getItem(CHALLENGE_KEY)); if (Date.parse(value?.expiresAt) > Date.now()) setChallenge(value); else sessionStorage.removeItem(CHALLENGE_KEY); } catch { /* Storage may be blocked. */ }
    });
    return () => controller.abort();
  }, []);
  const withdraw = async () => {
    setBusy(true); setMessage('');
    try { setPrivacy(await withdrawPrivacyConsent()); setMessage('Face-scan consent withdrawn. Routine tracking remains available.'); }
    catch (error) { setMessage(error.message); } finally { setBusy(false); }
  };
  const startDeletion = async () => {
    if (!canReauthenticate) { setMessage('Sign in with Google or GitHub before confirming deletion.'); return; }
    setBusy(true); setMessage('');
    try {
      const value = await createDeletionChallenge();
      // This short-lived, server-bound challenge is not an auth token or scan record.
      sessionStorage.setItem(CHALLENGE_KEY, JSON.stringify(value));
      await signInWithProvider(provider, '/settings?reauth=1');
    } catch (error) { setMessage(error.message || 'Browser session storage is required for deletion confirmation.'); setBusy(false); }
  };
  const remove = async event => {
    event.preventDefault(); if (confirmation !== 'DELETE MY ACCOUNT' || !challenge) return;
    setBusy(true); setMessage('');
    try {
      await deleteAccount({ confirmation, challengeId: challenge.challengeId });
      try { sessionStorage.removeItem(CHALLENGE_KEY); } catch { /* Already deleted remotely. */ }
      await signOut(); router.replace('/');
    } catch (error) { setMessage(error.message); setBusy(false); }
  };
  return <AppLayout><div className={styles.page}><p className={styles.eyebrow}>Your account, your choices</p><h1 className={styles.title}>Settings.</h1>
    <div className={styles.grid}><article className={styles.card}><h2>Account</h2><p className={styles.muted}>{user?.email || 'Signed-in account'}</p><p className={styles.muted}>Free portfolio access. There are no paid plans or subscriptions.</p></article><article className={styles.card}><h2>Face-scan consent</h2><p className={styles.muted}>{privacy ? privacy.granted ? 'Consent is currently granted.' : 'Consent is not currently granted.' : 'Consent status is unavailable. You can still request withdrawal.'}</p><button className={styles.button} style={{ marginTop: 16 }} disabled={busy || privacy?.granted === false} onClick={withdraw}>Withdraw consent</button><p className={styles.muted} style={{ marginTop: 12 }}>Withdrawal stops future scans. Delete individual saved results from history.</p></article></div>
    <article className={styles.card}><h2>Delete your account</h2><p className={styles.lead}>This permanently removes your account, saved analyses, routine preferences and check-ins. A limited deletion audit and anonymous provider-attempt accounting may remain. Read the <Link href="/privacy">privacy notice</Link>.</p><p className={styles.muted}>First confirm through a new Google or GitHub sign-in. The server verifies the new session and a single-use, ten-minute challenge.</p>
      <button className={styles.button} disabled={busy || !canReauthenticate} onClick={startDeletion}>Confirm identity with {provider === 'google' ? 'Google' : 'GitHub'}</button>
      {challenge && <form onSubmit={remove}><label className={styles.field}>Type DELETE MY ACCOUNT<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} /></label><button className={`${styles.button} ${styles.danger}`} disabled={busy || confirmation !== 'DELETE MY ACCOUNT'} type="submit">Permanently delete account</button></form>}
    </article><p className={styles.status} role="status" aria-live="polite">{message}</p><Link href="/privacy" className={styles.button}>Read the privacy notice</Link>
  </div></AppLayout>;
}
