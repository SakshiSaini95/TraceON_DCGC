import { Fragment, useEffect, useLayoutEffect, useState, type FormEvent } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Instagram,
  Link2,
  Menu,
  MessageCircle,
  MousePointer2,
  Play,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Moon,
  Star,
  X,
} from 'lucide-react';
import LookupDemo from '@/components/LookupDemo';
import TracyChat from '@/components/TracyChat';
import { registerBeta } from '@/api/api';
import { initMotion } from '@/motion';

const features = [
  { number: '001', icon: ShieldCheck, title: 'PAY-GUARD', text: 'A second opinion before your money moves.' },
  { number: '002', icon: Search, title: 'SELLER PASSPORT', text: 'One clean view of every public signal.' },
  { number: '003', icon: Link2, title: 'SCAM GRAPH', text: 'See the profiles, numbers and links connected.' },
  { number: '004', icon: Sparkles, title: 'EVIDENCE PACK', text: 'Clear proof you can save, share and act on.' },
  { number: '005', icon: CircleHelp, title: 'PRIVACY FIRST', text: 'Check a stranger without giving away yours.' },
  { number: '006', icon: Star, title: 'VERIFIED BADGE', text: 'Let genuine sellers stand out from the noise.' },
];

const notes = [
  'BUYERS ABOUT TO PAY A STRANGER',
  'GENUINE SELLERS WHO WANT A VERIFIED BADGE',
  'COMMUNITY ADMINS',
  'MARKETPLACES WITH SPAM LISTINGS',
];

function Mascot({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? 'mascot mascot-small' : 'mascot'} aria-label="Trace mascot">
      <div className="mascot-ear mascot-ear-left" />
      <div className="mascot-ear mascot-ear-right" />
      <div className="mascot-body">
        <div className="mascot-face">
          <span className="eye" />
          <span className="eye" />
        </div>
        <div className="mascot-mouth" />
      </div>
      {!small && <><div className="mascot-arm mascot-arm-left" /><div className="mascot-arm mascot-arm-right" /></>}
    </div>
  );
}

/** Splits a plain string into masked words for the word-by-word reveal (styled in motion.css). */
function Words({ children }: { children: string }) {
  const words = children.split(' ');
  return (
    <>
      {words.map((word, i) => (
        <Fragment key={i}>
          <span className="word" style={{ '--w': i } as React.CSSProperties}><b>{word}</b></span>
          {i < words.length - 1 ? ' ' : ''}
        </Fragment>
      ))}
    </>
  );
}

function Sticker({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`sticker ${className}`}>{children}</span>;
}

function LogoMark() {
  return <span className="logo-mark" aria-hidden="true"><span /><span /><span /></span>;
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [lightMode, setLightMode] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = lightMode ? 'light' : 'dark';
  }, [lightMode]);

  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>('.reveal');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
      });
    }, { threshold: 0.12 });
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const phrase = 'TRACE THE SIGNAL';
    let index = 0;
    let deleting = false;
    const timer = window.setInterval(() => {
      if (!deleting) {
        index += 1;
        setTypedText(phrase.slice(0, index));
        if (index === phrase.length) deleting = true;
      } else {
        index -= 1;
        setTypedText(phrase.slice(0, index));
        if (index === 0) deleting = false;
      }
    }, 115);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => initMotion(), []);

  const openModal = () => { setSent(false); setFormError(''); setModalOpen(true); };

  const submitBetaRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const formData = new FormData(event.currentTarget);
    const username = String(formData.get('username') || '').trim();
    const email = String(formData.get('email') || '').trim();

    if (!username || !email) {
      setFormError('Full name and email are required.');
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      await registerBeta({
        username,
        email,
        phone: String(formData.get('phone') || '').trim(),
        user_type: String(formData.get('user_type') || '').trim(),
        profile_url: String(formData.get('profile_url') || '').trim(),
      });
      setSent(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Could not submit your registration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main>
      <div className="scroll-progress" aria-hidden="true"><span /></div>
      <nav className="nav">
        <a href="#top" className="brand" aria-label="Traceon home"><LogoMark /><span>TRACE<span className="brand-accent">ON</span></span></a>
        <div className={`nav-links ${menuOpen ? 'nav-links-open' : ''}`}>
          <a href="#how">How it works</a><a href="#features">Features</a><a href="#why">Why us</a><a href="#people">Who it&apos;s for</a>
          <button className="nav-cta" onClick={openModal}>Get the demo <ArrowUpRight size={15} /></button>
          <button className="theme-toggle" aria-label={lightMode ? 'Switch to dark mode' : 'Switch to light mode'} onClick={() => setLightMode(!lightMode)}>{lightMode ? <Moon size={15} /> : <Sun size={15} />}</button>
        </div>
        <button className="menu-button" aria-label="Toggle menu" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
      </nav>

      <section className="hero" id="top">
        <div className="living-orb orb-a" data-parallax="0.16" /><div className="living-orb orb-b" data-parallax="-0.1" /><div className="living-orb orb-c" data-parallax="0.22" />
        <div className="hero-copy reveal">
          <div className="typed-line"><span className="typed-dot" />{typedText}<span className="type-caret" /></div>
          <Sticker>FREE FOR BUYERS</Sticker>
          <h1><Words>CHECK THE</Words><br /><span><Words>SELLER.</Words></span><br /><Words>BEFORE THE</Words><br /><span><Words>MONEY MOVES.</Words></span></h1>
          <p>TRACEON links the clues hiding in plain sight—so you can trust the person behind the profile.</p>
          <div className="hero-actions"><button className="button button-lime" onClick={openModal}>ADD TO CHROME <ArrowUpRight size={17} /></button><a href="#demo" className="button button-paper">TRY THE LOOKUP <ArrowDownRight size={17} /></a></div>
        </div>
        <div className="hero-mascot reveal"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><Mascot /><div className="float-card card-profile"><Instagram size={16} /><span>@vintage.store</span><b>?</b></div><div className="float-card card-phone"><Smartphone size={16} /><span>+91 98••• 381</span></div><div className="float-card card-link"><Link2 size={16} /><span>3 links found</span></div></div>
        <div className="scroll-cue"><MousePointer2 size={15} /> SCROLL TO EXPOSE <ChevronDown size={16} /></div>
      </section>

      <section className="promise section-dark" id="how">
        <div className="section-label reveal">01 / THE PROMISE</div>
        <div className="promise-lines reveal"><p data-fill>NO ACCOUNT NEEDED</p><p data-fill>NO WAITING FOR A COMPLAINT</p><p data-fill>NO EVIDENCE HIDDEN</p><p><span data-fill>VERDICT WITH PROOF</span></p></div>
        <div className="steps">
          {[['01', 'PASTE OR PEEK', 'Open a profile, or paste a link, phone, UPI ID or photo.'], ['02', 'WE LINK THE CLUES', 'OCR, image fingerprints and entity linking connect the dots.'], ['03', 'GET THE VERDICT', 'Low, medium or high—with reasons you can actually understand.']].map(([num, title, text]) => <article className="fold-card reveal" key={num}><span className="card-number">{num}</span><h3>{title}</h3><p>{text}</p><ArrowUpRight size={17} /></article>)}
        </div>
      </section>

      <section className="paper-section" id="features">
        <div className="torn-top" /><div className="section-label dark-label reveal">02 / THE TOOLKIT</div>
        <div className="feature-heading reveal"><h2><Words>BUILT ONLY FOR</Words><br /><em><Words>PRE-PAYMENT</Words></em> <Words>TRUST.</Words></h2><p>No complicated dashboard. No detective work. Just the useful stuff, at the exact moment it matters.</p></div>
        <div className="feature-grid">{features.map(({ number, icon: Icon, title, text }) => <article className="feature-card reveal" key={number}><div className="feature-top"><span>{number}</span><Icon size={27} strokeWidth={1.7} /></div><h3>{title}</h3><p>{text}</p><ArrowUpRight className="feature-arrow" size={17} /></article>)}</div>
      </section>

      <section className="comparison section-dark" id="why">
        <div className="section-label reveal">03 / THE DIFFERENCE</div><h2 className="comparison-title reveal">WHAT USUALLY<br /><span data-fill>HAPPENS…</span></h2>
        <div className="compare-wrap"><article className="compare-card others reveal" data-parallax="0.05"><div className="compare-head"><span>OTHERS</span><X size={20} /></div><ul><li>Reports after the loss</li><li>Separate website</li><li>One complaint at a time</li><li>No link between usernames</li><li>Just a case number</li></ul></article><article className="compare-card traceon reveal" data-parallax="-0.05"><div className="compare-head"><span>TRACEON</span><Check size={22} /></div><ul><li>Checks before you pay</li><li>Inside the places you already use</li><li>Links 5 usernames to 1 person</li><li>Verdict with evidence</li><li>Results in seconds</li></ul><Sticker>BETTER CALL</Sticker></article></div>
      </section>

      <section className="audience section-dark" id="people"><div className="section-label reveal">04 / WHO IT&apos;S FOR</div><h2 className="audience-title reveal">BUILT FOR BUYERS.<br /><span data-fill>GOOD FOR HONEST SELLERS.</span></h2><div className="audience-stage"><div className="planet" data-media data-parallax="0.08"><div className="planet-ring" /><Mascot /></div><div className="notes">{notes.map((note, i) => <div className={`tape tape-${i + 1} reveal`} key={note}>{note}</div>)}</div></div></section>

      <section className="coverage section-dark" id="demo"><div className="section-label reveal">05 / LIVE DEMO</div><div className="coverage-head reveal"><h2><Words>TRY IT</Words><br /><span><Words>RIGHT HERE.</Words></span></h2><p>Paste a profile, number or UPI ID. See what Traceon would show you before you pay.</p></div><div className="demo-panel reveal"><LookupDemo /></div><div className="platforms"><div className="platform-card reveal"><Instagram size={36} /><div><h3>INSTAGRAM</h3><small>Profile, DM or bio link</small></div></div><div className="platform-card platform-green reveal"><MessageCircle size={36} /><div><h3>WHATSAPP</h3><small>Number, payment or group</small></div></div></div></section>

      <footer className="footer paper-section"><div className="torn-top" /><div className="footer-scanline" aria-hidden="true"><div className="scan-track">{[0, 1].map((g) => <div className="scan-group" key={g}>{Array.from({ length: 14 }, (_, i) => <span key={i}>CHECK BEFORE YOU PAY</span>)}</div>)}</div></div><div className="footer-inner reveal"><div><Sticker>BEFORE YOU PAY</Sticker><h2><Words>INSTALL IT.</Words><br /><em><Words>CHECK FIRST.</Words></em></h2><div className="footer-actions"><button className="button button-black" onClick={openModal}>ADD TO CHROME <ArrowUpRight size={17} /></button><button className="button button-lime" onClick={openModal}>GET THE DEMO <Play size={16} fill="currentColor" /></button></div></div><div className="footer-mascot" data-parallax="0.06"><div className="footer-halo" /><div className="footer-orbit" aria-hidden="true"><i className="fo-ring fo-ring-a" /><i className="fo-ring fo-ring-b" /><i className="orbiter orbiter-a"><b /></i><i className="orbiter orbiter-b"><b /></i><div className="float-card fc-1"><ShieldCheck size={16} /><span>CHECK FIRST</span></div><div className="float-card fc-2"><Link2 size={16} /><span>3 links found</span></div></div><Mascot /></div></div><div className="footer-bottom"><span>TRACEON © 2026</span><div><a href="#how">How it works</a><a href="#features">Features</a><a href="#why">Why us</a><a href="#people">Who it&apos;s for</a></div><span>BUILT TO SEE THE SIGNAL</span></div></footer>

      <TracyChat />

      {modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Join the demo">
          <div className="modal">
            <button className="modal-close" aria-label="Close" onClick={() => setModalOpen(false)}><X /></button>
            {sent ? (
              <div className="success">
                <Mascot />
                <Sticker>GOT IT</Sticker>
                <h2>WE&apos;LL BE IN TOUCH.</h2>
                <p>Your spot is saved. We&apos;ll send the next steps shortly.</p>
                <button className="button button-lime" onClick={() => setModalOpen(false)}>BACK TO TRACEON</button>
              </div>
            ) : (
              <>
                <div className="modal-copy">
                  <Sticker>JOIN THE BETA</Sticker>
                  <h2>FILL OUT THE FORM.<br /><span>WE&apos;LL CONTACT YOU.</span></h2>
                  <p>A better way to know before you pay.</p>
                </div>
                <form onSubmit={submitBetaRegistration}>
                  <input name="username" aria-label="Full name" placeholder="FULL NAME" autoComplete="name" required />
                  <input name="email" type="email" aria-label="Email" placeholder="EMAIL" autoComplete="email" required />
                  <input name="phone" aria-label="Phone or Telegram" placeholder="PHONE / TELEGRAM" autoComplete="tel" />
                  <select name="user_type" aria-label="I am a">
                    <option value="buyer">I AM A BUYER</option>
                    <option value="seller">I AM A SELLER</option>
                    <option value="community_admin">I AM A COMMUNITY ADMIN</option>
                    <option value="marketplace">I RUN A MARKETPLACE</option>
                  </select>
                  <input name="profile_url" aria-label="Link to your page" placeholder="LINK TO YOUR PAGE" autoComplete="url" />
                  {formError && <small role="alert">{formError}</small>}
                  <button className="button button-lime" type="submit" disabled={submitting}>SEND <ArrowUpRight size={17} /></button>
                  <small>By sending this form, I agree to the privacy policy and cookies.</small>
                </form>
                <div className="modal-mascot"><Mascot /></div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
