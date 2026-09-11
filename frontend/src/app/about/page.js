import Link from 'next/link';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { REPOSITORY_URL } from '@/lib/projectConfig';
import styles from '@/components/portfolio/portfolio.module.css';
export const metadata = { title: 'The project · TejAi' };
export default function About() { return <><Navbar /><main className={styles.page}>
  <p className={styles.eyebrow}>Built to learn. Built to work.</p><h1 className={styles.title}>A small product with thoughtful engineering.</h1>
  <p className={styles.lead}>TejAi is a personal software engineering portfolio project for skincare routines and progress tracking. It has no paid plans. The public demo runs on synthetic data, independently of the live application.</p>
  <div className={styles.grid}><article className={styles.card}><h2>Two ways to explore</h2><p className={styles.muted}>Use the sample workspace immediately, or sign in with GitHub to save your own routine. Live analysis is optional and may be disabled or at capacity.</p></article><article className={styles.card}><h2>What is under the hood</h2><p className={styles.muted}>Next.js and React, an Express API, PostgreSQL with owner isolation, transactional scan reservations, and request throttling. A shared result contract keeps provider scales separate.</p></article><article className={styles.card}><h2>Honest limits</h2><p className={styles.muted}>Free hosting may sleep. Skin observations come from an external provider when enabled; the project does not train a vision model. Routine guidance follows deterministic rules and is not medical advice.</p></article></div>
  <div className={styles.row}><Link href="/demo" className={`${styles.button} ${styles.primary}`}>Explore demo</Link><a className={styles.button} href={REPOSITORY_URL} target="_blank" rel="noreferrer">View source on GitHub ↗</a></div>
</main><Footer /></>; }
