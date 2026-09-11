import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import styles from '@/components/portfolio/portfolio.module.css';
export const metadata = { title: 'Project terms · TejAi' };
export default function Terms() { return <><Navbar /><main className={styles.page}><p className={styles.eyebrow}>Personal portfolio project</p><h1 className={styles.title}>Use the project thoughtfully.</h1><div className={styles.card}>
  <h2>Purpose and access</h2><p className={styles.lead}>TejAi demonstrates routine tracking and software engineering. It is free to explore and offers no paid plans. Free hosting, account configuration and shared provider capacity may limit live availability.</p>
  <h2>Cosmetic guidance</h2><p className={styles.lead}>Observations and routines are for general cosmetic wellness. They are not medical diagnoses, treatments or assurances of results. Do not use this project to assess a skin condition; consult a qualified clinician when needed.</p>
  <h2>Portraits and accounts</h2><p className={styles.lead}>Live portrait analysis is for adults aged 18 or over. Upload only your own portrait with explicit consent. Do not upload another person’s image, abuse account creation, bypass limits or submit unlawful content. The sample demo requires no portrait.</p>
  <h2>Availability</h2><p className={styles.lead}>This is a personal project provided without an uptime promise. Keep any information you need independently. The source repository documents technical limitations and the applicable software license.</p>
</div></main><Footer /></>; }
