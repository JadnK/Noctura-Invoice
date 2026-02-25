/**
 * Tailwind-Preset. Die Farben zeigen auf die CSS-Variablen aus tokens.css,
 * damit es genau eine Quelle fuer Werte gibt. Kein Light-Mode-Zweig.
 */
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'var(--n-canvas)',
        sidebar: 'var(--n-sidebar)',
        surface: 'var(--n-surface)',
        raised: 'var(--n-surface-raised)',
        input: 'var(--n-input)',
        border: 'var(--n-border)',
        'border-strong': 'var(--n-border-strong)',
        text: 'var(--n-text)',
        muted: 'var(--n-text-muted)',
        subtle: 'var(--n-text-subtle)',
        primary: {
          DEFAULT: 'var(--n-primary)',
          hover: 'var(--n-primary-hover)',
          press: 'var(--n-primary-press)',
          soft: 'var(--n-primary-soft)',
        },
        success: 'var(--n-success)',
        warning: 'var(--n-warning)',
        danger: 'var(--n-danger)',
        info: 'var(--n-info)',
        state: {
          draft: 'var(--n-state-draft)',
          finalized: 'var(--n-state-finalized)',
          sent: 'var(--n-state-sent)',
          partially: 'var(--n-state-partially)',
          paid: 'var(--n-state-paid)',
          overdue: 'var(--n-state-overdue)',
          cancelled: 'var(--n-state-cancelled)',
          uncollectible: 'var(--n-state-uncollectible)',
        },
      },
      fontFamily: {
        sans: 'var(--n-font-ui)',
        mono: 'var(--n-font-mono)',
      },
      borderRadius: {
        sm: 'var(--n-radius-sm)',
        DEFAULT: 'var(--n-radius-md)',
        lg: 'var(--n-radius-lg)',
      },
      boxShadow: {
        elev1: 'var(--n-elev-1)',
        elev2: 'var(--n-elev-2)',
        focus: 'var(--n-focus-ring)',
      },
      transitionTimingFunction: { base: 'var(--n-ease)' },
    },
  },
  plugins: [],
};
