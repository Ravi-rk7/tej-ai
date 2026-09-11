'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './HeroSection.module.css';

function Icon({ name }) {
  const paths = {
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    scan: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 12h18" />,
    sparkle: <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4" />,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function HeroSection() {
  const [paused, setPaused] = useState(false);
  return <div className={styles.home} data-paused={paused}>
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.container}>
        <div className={styles.copy}>
          <div className={styles.eyebrow}><span className={styles.dot} /> A little care. A little more you.</div>
          <h1 id="home-title" className={styles.heading}>Good skin days<br />start with<br /><span>little habits.</span><svg className={styles.underline} viewBox="0 0 360 18" fill="none" aria-hidden="true"><path d="M4 12C91 0 229 0 355 9M41 16c86-7 205-8 284-4" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></h1>
          <p className={styles.description}>Get to know your skin. Find your daily rhythm.<br /> Keep your care, routines, and progress in one calm place.</p>
          <div className={styles.actions}><Link href="/demo" className={styles.primary}>Explore the demo <Icon name="arrow" /></Link><Link href="/login" prefetch={false} className={styles.secondary}>Start your routine <span aria-hidden="true">↗</span></Link></div>
          <div className={styles.notes}><span><Icon name="check" /> No signup for the demo</span><span><Icon name="check" /> No subscriptions</span></div>
          <a href="#your-rhythm" className={styles.discover}><span aria-hidden="true">↓</span> Small steps. Something worth keeping.</a>
        </div>
        <div className={styles.visual}>
          <div className={styles.orbit} aria-hidden="true" /><span className={styles.sparkleOne} aria-hidden="true">✳</span><span className={styles.sparkleTwo} aria-hidden="true">✧</span>
          <div className={styles.portraitFrame}>
            <Image src="/images/hero-portrait.png" alt="AI-generated editorial portrait of a woman with natural skin texture" fill sizes="(max-width: 600px) 88vw, (max-width: 960px) 440px, 460px" loading="eager" fetchPriority="high" className={styles.portrait} />
            <div className={styles.previewBadge}><span /> SCAN PREVIEW</div>
            <div className={styles.scanFrame} aria-hidden="true"><i /><i /><i /><i /><div className={styles.scanSweep} /><svg viewBox="0 0 240 300" className={styles.faceMesh}><path d="m68 88 51-22 54 23-7 72-44 59-48-58Zm0 0 54 64 51-63M74 162l48-10 44 9M119 66l3 86v68" /><g><circle cx="68" cy="88" r="3" /><circle cx="119" cy="66" r="3" /><circle cx="173" cy="89" r="3" /><circle cx="74" cy="162" r="3" /><circle cx="122" cy="152" r="3" /><circle cx="166" cy="161" r="3" /><circle cx="122" cy="220" r="3" /></g></svg></div>
            <div className={styles.portraitCaption}><span>A moment for yourself.</span><strong>Care starts with curiosity.</strong></div>
          </div>
          <div className={styles.insightCard}><span className={styles.iconTile}><Icon name="scan" /></span><div><small>A closer look</small><strong>Understand your skin</strong><div className={styles.miniBars} aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></div><span className={styles.cardSparkle} aria-hidden="true">✧</span></div>
          <div className={styles.routineCard}><div className={styles.routineHeading}><span className={styles.sunIcon}><Icon name="sun" /></span><div><small>YOUR DAILY MOMENT</small><strong>Morning, made simple.</strong></div><span className={styles.checkCircle}><Icon name="check" /></span></div><div className={styles.routineSteps}><span>Cleanse</span><i /><span>Moisturize</span><i /><span>Protect</span></div></div>
          <div className={styles.visualFooter}><span>Illustrative animation · AI-generated portrait</span><button onClick={() => setPaused(value => !value)} aria-pressed={paused} className={styles.motionToggle}>{paused ? 'Resume motion' : 'Pause motion'}</button></div>
        </div>
      </div>
      <div className={styles.ribbon}><span>LESS GUESSWORK. MORE CONSISTENCY.</span><div><Icon name="sun" /> Daily routines</div><b aria-hidden="true">✧</b><div><Icon name="scan" /> Optional skin insights</div><b aria-hidden="true">✧</b><div><Icon name="sparkle" /> Your progress, in perspective</div></div>
    </section>
    <section id="your-rhythm" className={styles.features} aria-labelledby="features-title">
      <div className={styles.sectionIntro}><div><p className={styles.sectionLabel}>BUILT AROUND YOUR EVERYDAY</p><h2 id="features-title">A routine that feels<br />like <span>second nature.</span></h2></div><p>You don’t need a perfect routine.<br />Just a place to start, and a reason to come back.</p></div>
      <div className={styles.featureGrid}>
        <article className={`${styles.feature} ${styles.habitFeature}`}><div className={styles.featureTop}><span>01 / FIND YOUR RHYTHM</span><Icon name="sun" /></div><div className={styles.weekPreview} aria-label="Illustrative weekly routine check-ins">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <div key={index}><small>{day}</small><span className={index < 5 ? styles.dayComplete : styles.dayEmpty}>{index < 5 ? <Icon name="check" /> : '·'}</span></div>)}</div><h3>Little rituals. Real consistency.</h3><p>Check in morning and night. See your habits take shape, one local day at a time.</p><Link href="/demo">Find your daily rhythm <Icon name="arrow" /></Link></article>
        <article className={`${styles.feature} ${styles.progressFeature}`}><div className={styles.featureTop}><span>02 / SEE THE BIGGER PICTURE</span><Icon name="sparkle" /></div><div className={styles.progressPreview} aria-hidden="true"><span>Every check-in is a small step.</span><div>{[28, 46, 39, 62, 53, 77, 68, 90, 80, 100].map((height, i) => <i key={i} style={{ '--bar-height': `${height}%`, '--bar-delay': `${i * 55}ms` }} />)}</div></div><h3>Your story, over time.</h3><p>A home for your check-ins and saved observations. Follow patterns with a little perspective.</p><Link href="/demo/progress">Explore sample progress <Icon name="arrow" /></Link></article>
        <article className={`${styles.feature} ${styles.exploreFeature}`}><div className={styles.featureTop}><span>03 / MAKE YOURSELF AT HOME</span><Icon name="scan" /></div><div className={styles.demoPreview} aria-hidden="true"><div className={styles.demoSymbol}>✳</div><span>Room to explore.<br /><strong>Zero pressure.</strong></span></div><h3>Curious? Come on in.</h3><p>Try a complete sample workspace. No account, photo, or live analysis needed. Reset it anytime.</p><Link href="/demo/history">Take a look around <Icon name="arrow" /></Link></article>
      </div>
      <div className={styles.closing}><span className={styles.closingSymbol} aria-hidden="true">✳</span><div><h2>Your next little habit starts here.</h2><p>A personal portfolio project, made for thoughtful daily care. Demo data is synthetic.</p></div><Link href="/demo" className={styles.primary}>Make yourself at home <Icon name="arrow" /></Link></div>
    </section>
  </div>;
}
