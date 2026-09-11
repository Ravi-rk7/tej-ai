import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { LEGAL_CONFIG } from '@/lib/legalConfig';
import { REPOSITORY_URL } from '@/lib/projectConfig';
import styles from '@/components/portfolio/portfolio.module.css';
export default function Support() { return <><Navbar /><main className={styles.page}><p className={styles.eyebrow}>Project help</p><h1 className={styles.title}>A few useful pointers.</h1><div className={styles.card}>
  <h2>Live app slow to start</h2><p className={styles.lead}>The free backend may need about a minute to wake. Use Check live availability on the scan page. The sample demo is available independently of the live backend and database.</p>
  <h2>Scan unavailable</h2><p className={styles.lead}>Analysis may be disabled or the shared allowance exhausted. Routine tracking does not require a scan. A failed request never substitutes a sample analysis.</p>
  <h2>Report a software issue</h2><p className={styles.lead}><a href={`${REPOSITORY_URL}/issues`} target="_blank" rel="noreferrer">Open a GitHub issue</a> with reproduction steps and browser details. Do not include portraits, account data, authentication tokens or API keys.</p>
  <h2>Private contact</h2><p className={styles.lead}>{LEGAL_CONFIG.supportEmail ? <a href={`mailto:${LEGAL_CONFIG.supportEmail}`}>{LEGAL_CONFIG.supportEmail}</a> : 'Private support contact is not configured in this deployment. Do not submit personal information in public issues.'}</p>
</div></main><Footer /></>; }
