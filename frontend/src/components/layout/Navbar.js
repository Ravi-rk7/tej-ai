import Link from 'next/link';
import styles from '@/components/portfolio/portfolio.module.css';
import homeStyles from './Navbar.module.css';
export default function Navbar({ home = false }) {
  if (home) return <header className={homeStyles.header}><nav className={homeStyles.nav} aria-label="Main navigation"><Link href="/" className={homeStyles.brand}><span aria-hidden="true">✳</span> TejAi<span className={homeStyles.brandDot}>.</span></Link><div className={homeStyles.middle}><a href="#your-rhythm">The experience</a><Link href="/about">The project <span aria-hidden="true">↗</span></Link></div><div className={homeStyles.actions}><Link href="/login" prefetch={false} className={homeStyles.signIn}>Sign in</Link><Link href="/demo" className={homeStyles.demo}>Explore demo <span aria-hidden="true">↗</span></Link></div></nav></header>;
  return <nav className={styles.nav} aria-label="Main navigation">
    <Link href="/" className={styles.brand}>TejAi</Link>
    <div className={styles.row}><Link href="/about">The project</Link><Link href="/login" prefetch={false}>Sign in</Link><Link href="/demo" className={`${styles.button} ${styles.primary}`}>Explore demo</Link></div>
  </nav>;
}
