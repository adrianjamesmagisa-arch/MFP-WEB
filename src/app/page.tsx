import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowDown, ArrowRight, Building2, ChartNoAxesCombined, ClipboardList, FileSpreadsheet, HeartHandshake, MapPin, Milk, School, ShieldCheck, Truck } from 'lucide-react'
import styles from './landing.module.css'

export const metadata: Metadata = {
  title: 'DA-PCC MFP | Milk Feeding Program Monitoring',
  description: 'The DA-PCC Milk Feeding Program monitoring system. Manage SBFP, DSWD, LDS, and LGU procurement, school drop-offs, deliveries, and reports in one place.',
}

const programs = [
  { name: 'SBFP', partner: 'DepEd', icon: School, description: 'Monitor SDO procurement, school drop-offs, and milk deliveries by school year.', tone: 'blue' },
  { name: 'DSWD', partner: 'Community feeding', icon: HeartHandshake, description: 'Keep procurement, beneficiaries, and delivery progress together by calendar year.', tone: 'green' },
  { name: 'LDS', partner: 'Partner-supported feeding', icon: Milk, description: 'Track partner program commitments and accomplishments across participating centers.', tone: 'purple' },
  { name: 'LGU', partner: 'Local government', icon: Building2, description: 'Manage local feeding program records, drop-off points, and delivery reporting.', tone: 'gold' },
] as const

const workflow = [
  { icon: ClipboardList, title: 'Record procurement', description: 'Keep contracts, milk types, and school allocations organized under the right center and program.' },
  { icon: Truck, title: 'Follow each delivery', description: 'Update delivered packs, dates, and payments, and compare progress with program commitments.' },
  { icon: FileSpreadsheet, title: 'Bring the data together', description: 'Review masterlists and monitoring summaries, then prepare reports and export your records.' },
]

export default function RootPage() {
  return (
    <div className={styles.page}>
      <a href="#main-content" className={styles.skipLink}>Skip to content</a>
      <header className={styles.header}>
        <div className={styles.navInner}>
          <Link href="/" className={styles.brand} aria-label="DA-PCC MFP home">
            <span className={styles.brandMark}><Milk size={25} aria-hidden="true" /></span>
            <span><strong>DA-PCC MFP</strong><span className={styles.brandCaption}>Milk Feeding Program</span></span>
          </Link>
          <nav className={styles.nav} aria-label="Main navigation">
            <a className={styles.navLink} href="#programs">Programs</a>
            <a className={styles.navLink} href="#monitoring">The system</a>
            <Link className={styles.navSignIn} href="/login">Sign in <ArrowRight size={16} aria-hidden="true" /></Link>
          </nav>
        </div>
      </header>
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}><span aria-hidden="true" /> Philippine Carabao Center</p>
              <h1 id="hero-title">Every delivery.<br />A <em>healthier</em><br />tomorrow.</h1>
              <p className={styles.heroDescription}>One place to keep our milk feeding programs moving. Connect procurement, beneficiaries, and delivery progress across DA-PCC centers.</p>
              <div className={styles.heroActions}>
                <Link href="/login" className={styles.primaryButton}>Access the system <ArrowRight size={19} aria-hidden="true" /></Link>
                <a href="#programs" className={styles.exploreLink}>Explore the programs <ArrowDown size={16} aria-hidden="true" /></a>
              </div>
              <p className={styles.accessNote}><ShieldCheck size={15} aria-hidden="true" /> For authorized DA-PCC personnel and program users</p>
            </div>
            <div className={styles.heroVisual}>
              <div className={styles.visualHeading}><span>THE PURPOSE BEHIND THE NUMBERS</span><HeartHandshake size={23} aria-hidden="true" /></div>
              <div className={styles.photoStage}>
                <div className={styles.photoCircle} aria-hidden="true" />
                <Image src="/assets/pimd-infographic/08_THREE_CHILDREN_DRINKING_MILK_TRANSPARENT.png" alt="Children enjoying milk through feeding programs" width={490} height={309} priority sizes="(max-width: 720px) 90vw, (max-width: 1100px) 45vw, 530px" className={styles.heroPhoto} />
              </div>
              <div className={styles.visualCaption}><span className={styles.captionIcon}><MapPin size={20} aria-hidden="true" /></span><p><strong>Closer to every community.</strong><span>From our centers to the children we serve.</span></p></div>
            </div>
          </div>
          <div className={styles.heroFootnote}><span>OPERATIONS DEPARTMENT</span><span className={styles.footnoteLine} /><span>Better records. Clearer progress. Shared purpose.</span></div>
        </section>
        <section id="programs" className={styles.programs} aria-labelledby="programs-title">
          <div className={styles.sectionHeading}>
            <div><p className={styles.sectionLabel}>OUR PROGRAMS</p><h2 id="programs-title">Four programs.<br />One connected view.</h2></div>
            <p>Different communities, a shared commitment. Find the records and reporting tools for each feeding program in one monitoring system.</p>
          </div>
          <div className={styles.programGrid}>
            {programs.map(({ name, partner, icon: Icon, description, tone }) => (
              <article key={name} className={`${styles.programCard} ${styles[tone]}`}>
                <span className={styles.programIcon}><Icon size={25} strokeWidth={1.7} aria-hidden="true" /></span>
                <p className={styles.programPartner}>{partner}</p><h3>{name}</h3>
                <p className={styles.programDescription}>{description}</p>
                <Link href="/login" className={styles.programLink} aria-label={`Sign in to access ${name} monitoring`}>Open monitoring <ArrowRight size={16} aria-hidden="true" /></Link>
              </article>
            ))}
          </div>
        </section>
        <section id="monitoring" className={styles.monitoring} aria-labelledby="monitoring-title">
          <div className={styles.monitoringIntro}>
            <p className={styles.sectionLabel}>FROM ENCODING TO REPORTING</p>
            <h2 id="monitoring-title">Keep the details together.<br />See the bigger picture.</h2>
            <p>Give center encoders and monitoring teams a common place to work, with access based on their assigned roles.</p>
            <div className={styles.monitoringNote}><ChartNoAxesCombined size={22} aria-hidden="true" /><span>Procurement, delivery tracking, masterlists, and reports—connected in one workflow.</span></div>
          </div>
          <ol className={styles.workflow}>
            {workflow.map(({ icon: Icon, title, description }, index) => (
              <li key={title}><span className={styles.stepNumber}>0{index + 1}</span><div><h3><Icon size={18} aria-hidden="true" />{title}</h3><p>{description}</p></div></li>
            ))}
          </ol>
        </section>
        <section className={styles.accessSection} aria-labelledby="access-title">
          <div><p className={styles.sectionLabel}>YOUR PROGRAM, IN VIEW</p><h2 id="access-title">Ready to get started?</h2><p>Sign in with your assigned account to access your workspace.</p></div>
          <div className={styles.accessActions}><Link href="/login" className={styles.primaryButton}>Sign in to DA-PCC MFP <ArrowRight size={18} aria-hidden="true" /></Link><p>Need an account? Contact your system administrator.</p></div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerIdentity}><Image src="/assets/pimd-infographic/06_DA_PCC_LOGO_TRANSPARENT.png" alt="Department of Agriculture – Philippine Carabao Center" width={62} height={54} /><div><strong>DA-PCC Milk Feeding Program</strong><p>Operations Department · Philippine Carabao Center</p></div></div>
        <p>Monitoring with purpose.</p>
      </footer>
    </div>
  )
}
