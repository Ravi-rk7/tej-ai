'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { getCapabilities, getPrivacyStatus, grantPrivacyConsent, scanSkinFile } from '@/lib/api';
import { waitForBackend } from '@/lib/backendReadiness';
import styles from './portfolio.module.css';

export default function LiveScan() {
  const [stage, setStage] = useState('idle'), [capabilities, setCapabilities] = useState(null), [notice, setNotice] = useState(null);
  const [file, setFile] = useState(null), [consent, setConsent] = useState(false), [message, setMessage] = useState('');
  const [attempted, setAttempted] = useState(false), [key, setKey] = useState(null);
  const request = useRef(null), router = useRouter(), input = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const wake = async () => {
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setStage('waking'); setMessage('Starting the live service. Free hosting can take about a minute to wake.');
    try {
      await waitForBackend({ origin: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001', signal: controller.signal });
      const caps = await getCapabilities({ signal: controller.signal });
      const privacy = caps.liveScanEnabled ? await getPrivacyStatus({ signal: controller.signal }) : null;
      if (controller.signal.aborted) return;
      setCapabilities(caps); setNotice(privacy); setStage('ready');
      setMessage(caps.liveScanEnabled ? 'Ready. Review consent before choosing a portrait.' : 'Live analysis is disabled in this deployment. Your routine and the sample demo remain available.');
    } catch (error) { if (!controller.signal.aborted) { setStage('error'); setMessage(error.message); } }
  };
  const choose = event => {
    const next = event.target.files?.[0];
    setFile(null); setAttempted(false); setKey(null);
    if (!next) return;
    if (next.type !== 'image/jpeg' || next.size > 8 * 1024 * 1024 || next.size === 0) { setMessage('Choose a JPEG no larger than 8 MB.'); event.target.value = ''; return; }
    setFile(next); setKey(crypto.randomUUID()); setMessage('Portrait selected. It is sent only when you submit.');
  };
  const submit = async event => {
    event.preventDefault(); if (!file || !consent || !notice || attempted) return;
    setStage('processing'); setAttempted(true); setMessage('Processing once. Please keep this page open.');
    const controller = new AbortController(); request.current = controller;
    try {
      if (!notice.granted) await grantPrivacyConsent({ noticeVersion: notice.noticeVersion, signal: controller.signal });
      const result = await scanSkinFile(file, { idempotencyKey: key, signal: controller.signal });
      setFile(null); if (input.current) input.current.value = '';
      router.push(`/results?scanId=${encodeURIComponent(result.scanId)}`);
    } catch (error) {
      if (!controller.signal.aborted) { setStage('ready'); setMessage(`${error.message} Check history if processing was interrupted. This request will not be replayed automatically.`); }
    }
  };
  return <AppLayout><div className={styles.page}><p className={styles.eyebrow}>Optional skin observations</p><h1 className={styles.title}>A moment to check in.</h1><p className={styles.lead}>Face++ provides cosmetic categories, not a diagnosis or a health score. You can track your routine without uploading a photo.</p>
    <article className={styles.card}><h2>Live service availability</h2><p className={styles.muted}>Up to three successful scans per UTC month and one per UTC day. A small shared provider allowance may run out sooner.</p><p className={styles.status} role="status" aria-live="polite">{message}</p>
      {['idle', 'error'].includes(stage) && <button className={`${styles.button} ${styles.primary}`} onClick={wake}>Check live availability</button>}
      {stage === 'waking' && <button className={styles.button} onClick={() => { request.current?.abort(); setStage('idle'); setMessage('Availability check cancelled.'); }}>Cancel availability check</button>}
      {capabilities?.liveScanEnabled && notice && ['ready', 'processing'].includes(stage) && <form onSubmit={submit}>
        <label className={styles.field}><span><input type="checkbox" checked={consent} disabled={stage === 'processing'} onChange={event => setConsent(event.target.checked)} /> I am at least 18 and consent to sending my portrait to Face++ for skin analysis using its US endpoint.</span><span className={styles.muted}>The app processes images in memory and saves normalized observations only. Provider processing is described in the <Link href="/privacy">privacy notice</Link>. Consent can be withdrawn in Settings.</span></label>
        <label className={styles.field}>Choose one front-facing JPEG<input ref={input} type="file" accept="image/jpeg" disabled={!consent || stage === 'processing'} onChange={choose} /></label>
        <p className={styles.muted}>At least 200 × 200 pixels; input up to 8 MB. The server strips metadata and requires a normalized JPEG under 2 MB.</p>
        <button className={`${styles.button} ${styles.primary}`} disabled={!file || !consent || attempted || stage === 'processing'} type="submit">{stage === 'processing' ? 'Analyzing…' : 'Analyze this portrait'}</button>
        {attempted && stage !== 'processing' && <button className={styles.button} type="button" onClick={() => { setFile(null); setAttempted(false); setKey(null); if (input.current) input.current.value = ''; setMessage('Choose a portrait to start a new request. Shared capacity still applies.'); }}>Start a new request</button>}
      </form>}
    </article><div className={styles.row} style={{ marginTop: 24 }}><Link href="/demo" className={styles.button}>Explore the sample demo</Link><Link href="/history" className={styles.button}>Check history</Link><Link href="/dashboard" className={styles.button}>Track my routine</Link></div>
  </div></AppLayout>;
}
