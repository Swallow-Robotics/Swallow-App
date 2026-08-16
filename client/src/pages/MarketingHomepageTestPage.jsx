import React, { useState } from 'react';
import PanoramaViewer from '../components/photo/PanoramaViewer';
import apiClient from '../services/api';

const R2_BASE = (
  process.env.REACT_APP_R2_PUBLIC_BASE_URL ||
  process.env.REACT_APP_R2_PUBLIC_URL ||
  ''
).replace(/\/$/, '');

/** Sample project drone 360° panorama (project 0bd820dd…). */
const SAMPLE_PANO_PATH =
  'projects/0bd820dd-9cd2-42f4-8c3d-3a576fbd1a18/photos/a58632e4-a60b-4175-af0a-0c273d95d724.jpg';

const SAMPLE_PANO_URL = R2_BASE
  ? `${R2_BASE}/${SAMPLE_PANO_PATH}`
  : `https://pub-8a4ba64eef054a38a9bb078be4726e58.r2.dev/${SAMPLE_PANO_PATH}`;

const BENEFITS = [
  {
    title: 'Capture',
    body: 'Quickly capture 360° imagery of your entire jobsite.',
  },
  {
    title: 'Document',
    body: 'Build a visual record of construction progress over time.',
  },
  {
    title: 'Share',
    body:
      "Give project teams, owners, and stakeholders an easy way to see what's happening without being on site.",
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Capture',
    body: 'Drone captures a panorama of the jobsite.',
  },
  {
    n: '2',
    title: 'Explore',
    body: 'View the site interactively in a 360° viewer.',
  },
  {
    n: '3',
    title: 'Track',
    body: 'Track site conditions and progress over time.',
  },
];

const EMPTY_FORM = {
  name: '',
  company: '',
  email: '',
  phone: '',
  message: '',
};

const scrollToId = id => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const MarketingHomepageTestPage = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);

  const openForm = () => {
    setFormOpen(true);
    setSuccess(false);
    setSubmitError('');
    setErrors({});
  };

  const closeForm = () => {
    setFormOpen(false);
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitError('');
    setSuccess(false);
  };

  const onChange = event => {
    const { name, value } = event.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Name is required.';
    if (!form.company.trim()) next.company = 'Company is required.';
    if (!form.email.trim()) {
      next.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Enter a valid email.';
    }
    if (!form.message.trim()) next.message = 'Message is required.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onSubmit = async event => {
    event.preventDefault();
    setSubmitError('');
    if (!validate()) return;
    setSubmitting(true);
    try {
      await apiClient.post('/v1/contact', {
        name: form.name.trim(),
        company: form.company.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        message: form.message.trim(),
      });
      setSuccess(true);
      setForm(EMPTY_FORM);
    } catch (err) {
      setSubmitError(
        err?.message || 'Unable to send your request. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mkt-home">
      <header className="mkt-home__header">
        <div className="mkt-home__header-inner">
          <a href="#top" className="mkt-home__brand">
            <img
              src={`${process.env.PUBLIC_URL}/logo192.png`}
              alt=""
              className="mkt-home__brand-logo"
            />
            <span>Swallow CTR</span>
          </a>
          <nav className="mkt-home__nav" aria-label="Marketing">
            <button
              type="button"
              className="mkt-home__nav-link"
              onClick={() => scrollToId('platform')}
            >
              Platform
            </button>
            <button
              type="button"
              className="mkt-home__nav-link"
              onClick={() => scrollToId('how-it-works')}
            >
              How It Works
            </button>
            <button
              type="button"
              className="mkt-home__nav-link"
              onClick={() => scrollToId('contact')}
            >
              Contact
            </button>
          </nav>
          <button type="button" className="btn-primary" onClick={openForm}>
            Request a Demo
          </button>
        </div>
      </header>

      <main id="top">
        <section className="mkt-home__hero">
          <div className="mkt-home__hero-copy">
            <h1>See Your Jobsite From Anywhere.</h1>
            <p>
              Capture immersive 360° drone panoramas of your construction site
              and keep a visual record of progress over time.
            </p>
            <div className="mkt-home__hero-actions">
              <button type="button" className="btn-primary" onClick={openForm}>
                Request a Demo
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => scrollToId('viewer')}
              >
                See It In Action
              </button>
            </div>
          </div>
          <div className="mkt-home__hero-viewer" id="viewer">
            <div className="mkt-home__pano-frame">
              <PanoramaViewer
                src={SAMPLE_PANO_URL}
                className="mkt-home__pano"
              />
            </div>
            <p className="mkt-home__pano-caption">
              Explore a 360° panorama captured on an active construction site.
            </p>
          </div>
        </section>

        <section className="mkt-home__section" id="platform">
          <h2 className="mkt-home__section-title">Built for construction</h2>
          <div className="mkt-home__cards">
            {BENEFITS.map(item => (
              <article key={item.title} className="mkt-home__card">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mkt-home__section mkt-home__section--muted" id="how-it-works">
          <h2 className="mkt-home__section-title">How It Works</h2>
          <ol className="mkt-home__steps">
            {STEPS.map(step => (
              <li key={step.n} className="mkt-home__step">
                <span className="mkt-home__step-n">{step.n}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mkt-home__cta" id="contact">
          <h2>Want to see what Swallow CTR can do for your project?</h2>
          <button type="button" className="btn-primary" onClick={openForm}>
            Request a Demo
          </button>
        </section>
      </main>

      <footer className="mkt-home__footer">
        <strong>Swallow CTR</strong>
        <p>Construction site documentation, reimagined.</p>
        <a href="mailto:contact@swallow-ctr.com">contact@swallow-ctr.com</a>
      </footer>

      {formOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={event => {
            if (event.target === event.currentTarget) closeForm();
          }}
        >
          <div
            className="modal-body mkt-home__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mkt-demo-title"
          >
            <h3 className="modal-header" id="mkt-demo-title">
              Request a Demo
            </h3>
            {success ? (
              <div className="mkt-home__success">
                <p>
                  Thanks — we received your request and will follow up soon.
                </p>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={closeForm}
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form className="modal-form" onSubmit={onSubmit} noValidate>
                <label className="form-label" htmlFor="mkt-name">
                  Name
                  <input
                    id="mkt-name"
                    className="form-input"
                    name="name"
                    value={form.name}
                    onChange={onChange}
                    autoComplete="name"
                    required
                  />
                  {errors.name ? (
                    <span className="form-error">{errors.name}</span>
                  ) : null}
                </label>
                <label className="form-label" htmlFor="mkt-company">
                  Company
                  <input
                    id="mkt-company"
                    className="form-input"
                    name="company"
                    value={form.company}
                    onChange={onChange}
                    autoComplete="organization"
                    required
                  />
                  {errors.company ? (
                    <span className="form-error">{errors.company}</span>
                  ) : null}
                </label>
                <label className="form-label" htmlFor="mkt-email">
                  Email
                  <input
                    id="mkt-email"
                    className="form-input"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={onChange}
                    autoComplete="email"
                    required
                  />
                  {errors.email ? (
                    <span className="form-error">{errors.email}</span>
                  ) : null}
                </label>
                <label className="form-label" htmlFor="mkt-phone">
                  Phone (optional)
                  <input
                    id="mkt-phone"
                    className="form-input"
                    name="phone"
                    type="tel"
                    value={form.phone}
                    onChange={onChange}
                    autoComplete="tel"
                  />
                </label>
                <label className="form-label" htmlFor="mkt-message">
                  Message
                  <textarea
                    id="mkt-message"
                    className="form-input form-textarea"
                    name="message"
                    rows={4}
                    value={form.message}
                    onChange={onChange}
                    required
                  />
                  {errors.message ? (
                    <span className="form-error">{errors.message}</span>
                  ) : null}
                </label>
                {submitError ? (
                  <div className="form-error">{submitError}</div>
                ) : null}
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={closeForm}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submitting}
                  >
                    {submitting ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default MarketingHomepageTestPage;
