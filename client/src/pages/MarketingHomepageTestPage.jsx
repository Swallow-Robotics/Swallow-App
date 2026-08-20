import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import PanoramaViewer from '../components/photo/PanoramaViewer';
import apiClient from '../services/api';
import { STANDARD_STYLE_URL } from '../utils/basemapStyle';
import {
  WAYPOINT_MARKER_ACTIVE_FILL,
  WAYPOINT_MARKER_SIZE_MINI,
  buildCircleMarkerSvg,
} from '../utils/waypointMarkerIcons';

const R2_BASE = (
  process.env.REACT_APP_R2_PUBLIC_BASE_URL ||
  process.env.REACT_APP_R2_PUBLIC_URL ||
  ''
).replace(/\/$/, '');

/** Demonstration panorama captured at Mill 19, Pittsburgh. */
const SAMPLE_PANO_PATH =
  'projects/0bd820dd-9cd2-42f4-8c3d-3a576fbd1a18/photos/ba34fef5-ecf9-46b3-9a60-b6a352586f8f.jpg';

const SAMPLE_PANO_URL = R2_BASE
  ? `${R2_BASE}/${SAMPLE_PANO_PATH}`
  : `https://pub-8a4ba64eef054a38a9bb078be4726e58.r2.dev/${SAMPLE_PANO_PATH}`;

/** Location of the Mill 19 demonstration capture. */
const SAMPLE_LOCATION = { lng: -79.94744, lat: 40.413825 };

const LOCATION_PIN_SVG = buildCircleMarkerSvg('drone', {
  width: WAYPOINT_MARKER_SIZE_MINI.width,
  height: WAYPOINT_MARKER_SIZE_MINI.height,
  fillColor: WAYPOINT_MARKER_ACTIVE_FILL,
});

const STEPS = [
  {
    n: '1',
    title: 'Schedule a Visit',
    body: 'Give us a time that works for the project.',
  },
  {
    n: '2',
    title: 'We Capture It',
    body: 'Swallow coordinates the visit and delivers the finished aerials.',
  },
  {
    n: '3',
    title: 'Share with Your Team',
    body: 'Send a link or PDF to anyone. No logins.',
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

const LocationPin = ({ className }) => (
  <span
    className={className}
    // Marker SVG is generated from Swallow's own waypoint icon helper.
    // eslint-disable-next-line react/no-danger
    dangerouslySetInnerHTML={{ __html: LOCATION_PIN_SVG }}
    aria-hidden="true"
  />
);

/** Stylized site drawing used to show that each panorama has a place on the plan. */
const SitePlanPreview = () => (
  <svg
    className="mkt-home__plan-svg"
    viewBox="0 0 320 240"
    role="img"
    aria-label="Example project drawing with a capture location marked"
  >
    <rect width="320" height="240" fill="#e8eef4" />
    <g stroke="#c5d3e2" strokeWidth="0.6">
      {Array.from({ length: 15 }, (_, i) => (
        <line key={`v-${i}`} x1={20 * (i + 1)} y1="0" x2={20 * (i + 1)} y2="240" />
      ))}
      {Array.from({ length: 11 }, (_, i) => (
        <line key={`h-${i}`} x1="0" y1={20 * (i + 1)} x2="320" y2={20 * (i + 1)} />
      ))}
    </g>
    <rect
      x="28"
      y="24"
      width="264"
      height="192"
      fill="none"
      stroke="#1f3a5f"
      strokeWidth="1.2"
      strokeDasharray="5 3"
    />
    <rect x="18" y="168" width="284" height="28" fill="#d5dee8" />
    <rect x="18" y="178" width="284" height="8" fill="#c3cedb" />
    <rect
      x="48"
      y="48"
      width="132"
      height="88"
      fill="#b7cde6"
      stroke="#3f6fa0"
      strokeWidth="1.4"
    />
    <rect
      x="188"
      y="56"
      width="72"
      height="52"
      fill="#c9d9eb"
      stroke="#3f6fa0"
      strokeWidth="1.4"
    />
    <rect
      x="48"
      y="148"
      width="64"
      height="16"
      fill="#d7e2ee"
      stroke="#3f6fa0"
      strokeWidth="1"
    />
    <g fill="none" stroke="#8aa0b8" strokeWidth="0.8">
      <line x1="196" y1="168" x2="252" y2="168" />
      <line x1="196" y1="174" x2="252" y2="174" />
      <line x1="196" y1="180" x2="252" y2="180" />
      <line x1="196" y1="186" x2="252" y2="186" />
    </g>
    <polygon points="292,18 298,32 286,32" fill="#1f3a5f" />
    <text
      x="292"
      y="44"
      textAnchor="middle"
      fill="#1f3a5f"
      fontSize="9"
      fontFamily="Inter, sans-serif"
      fontWeight="600"
    >
      N
    </text>
  </svg>
);

const SampleLocationMap = ({ zoom = 15.6 }) => {
  const containerRef = useRef(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;

    const map = new maplibregl.Map({
      container: node,
      style: STANDARD_STYLE_URL,
      center: [SAMPLE_LOCATION.lng, SAMPLE_LOCATION.lat],
      zoom,
      interactive: false,
      attributionControl: false,
      transformRequest: (url, resourceType) => {
        if (
          resourceType === 'Style' ||
          resourceType === 'Source' ||
          resourceType === 'Tile'
        ) {
          return { url, headers: {}, credentials: 'omit' };
        }
        return undefined;
      },
    });

    const pin = document.createElement('div');
    pin.className = 'mkt-home__map-pin';
    pin.innerHTML = LOCATION_PIN_SVG;
    pin.setAttribute('aria-hidden', 'true');
    const marker = new maplibregl.Marker({ element: pin, anchor: 'center' })
      .setLngLat([SAMPLE_LOCATION.lng, SAMPLE_LOCATION.lat])
      .addTo(map);
    marker.getElement().setAttribute('aria-hidden', 'true');
    marker.getElement().setAttribute('role', 'img');
    marker.getElement().tabIndex = -1;

    const resize = () => map.resize();
    const handleReady = () => resize();
    map.on('load', handleReady);
    map.once('idle', handleReady);
    const observer = new ResizeObserver(resize);
    observer.observe(node);

    return () => {
      observer.disconnect();
      map.off('load', handleReady);
      marker.remove();
      map.remove();
    };
  }, [zoom]);

  return <div ref={containerRef} className="mkt-home__map" />;
};

const MarketingHomepageTestPage = () => {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Swallow';
    return () => {
      document.title = previousTitle;
    };
  }, []);

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
      <header className="App-header mkt-home__banner">
        <div className="App-header__inner">
          <div className="App-header__left">
            <a href="#top" className="App-header__logoLink" aria-label="Swallow">
              <img
                src={`${process.env.PUBLIC_URL}/logo192-white.png`}
                alt="Swallow"
                className="App-header__logo"
              />
              <span className="mkt-home__brand-name">Swallow</span>
            </a>
            <nav className="App-header__tabs" aria-label="Marketing">
              <button
                type="button"
                className="App-header__tab"
                onClick={() => scrollToId('viewer')}
              >
                Aerials
              </button>
              <button
                type="button"
                className="App-header__tab"
                onClick={() => scrollToId('how-it-works')}
              >
                How It Works
              </button>
            </nav>
          </div>
          <div className="App-header__right">
            <button
              type="button"
              className="mkt-home__banner-cta"
              onClick={openForm}
            >
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="mkt-home__main">
        <section className="mkt-home__hero">
          <div className="mkt-home__hero-copy">
            <h1>Construction Aerials Made Simple</h1>
            <p>
              Swallow makes aerial imagery easy for construction projects.
              Your team gets the Aerial photos, video, and 360° panoramas. We
              take care of the rest.
            </p>
          </div>
          <div className="mkt-home__hero-viewer" id="viewer">
            <div className="mkt-home__pano-frame">
              <PanoramaViewer
                src={SAMPLE_PANO_URL}
                className="mkt-home__pano"
              />
              <div className="mkt-home__pano-locate" aria-hidden="true">
                <div className="mkt-home__locate-frame">
                  <SampleLocationMap zoom={12.5} />
                </div>
              </div>
            </div>
            <p className="mkt-home__pano-caption">Explore a 360° panorama.</p>
          </div>
        </section>

        <section className="mkt-home__section" id="location">
          <div className="mkt-home__location">
            <div className="mkt-home__location-copy">
              <h2>Know exactly where you&rsquo;re looking.</h2>
              <p>
                Each 360° view is pinned to your project drawing and map, so
                anyone can see the site and know where they are. Share it with
                a link or a PDF. No logins or limits.
              </p>
            </div>
            <div className="mkt-home__location-visuals">
              <figure className="mkt-home__locate-card">
                <div className="mkt-home__locate-frame mkt-home__locate-frame--large">
                  <SitePlanPreview />
                  <LocationPin className="mkt-home__plan-pin" />
                </div>
                <figcaption>Project drawing</figcaption>
              </figure>
              <figure className="mkt-home__locate-card">
                <div className="mkt-home__locate-frame mkt-home__locate-frame--large">
                  <SampleLocationMap />
                </div>
                <figcaption>Map</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="mkt-home__section--muted" id="how-it-works">
          <div className="mkt-home__section-inner">
            <h2 className="mkt-home__section-title">How It Works</h2>
            <ol className="mkt-home__steps">
              {STEPS.map(step => (
                <li key={step.n} className="mkt-home__step">
                  <span className="mkt-home__step-n">{step.n}</span>
                  <div className="mkt-home__step-copy">
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="mkt-home__footer">
        <p className="mkt-home__footer-brand">Swallow</p>
        <p className="mkt-home__footer-legal">
          Construction Technology and Robotics
        </p>
        <a href="mailto:contact@swallow-ctr.com">contact@swallow-ctr.com</a>
      </footer>

      <div className="mkt-home__mobile-cta-bar">
        <button
          type="button"
          className="mkt-home__mobile-cta"
          onClick={openForm}
        >
          Get Started
        </button>
      </div>

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
              Get Started
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
