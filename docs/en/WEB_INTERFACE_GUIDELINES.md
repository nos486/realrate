# Web interface checklist

A condensed checklist adapted from [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) (read the source for the full rules). Follow it when writing or reviewing UI in `web/src`. Where it conflicts with `CLAUDE.md` (Persian-only copy rules, i18n, RTL, tokens), `CLAUDE.md` wins.

## Accessibility and focus
- Icon-only buttons have `aria-label`; decorative icons have `aria-hidden="true"`.
- `<button>` for actions, `<a>`/`<Link>` for navigation. Never a `div`/`tr`/`span` with `onClick` unless it also has `role="button"`, `tabIndex={0}` and Enter/Space handling.
- Every control has a label; async updates (toasts, validation) use `aria-live="polite"`.
- Focus is always visible. The global `:focus-visible` ring in `styles/base.css` covers links, buttons and roles; a text field may drop `outline` only if it shows its own focus border.

## Forms
- Use the shared fields (`shared/ui/Input.jsx`, `TextField.jsx`, `NumericInput.jsx`): they default to `autocomplete="off"`, skip spellcheck for email/url/tel/number, and honour `autoFocus` only with a fine pointer (`fieldDefaults.js`), so a phone keyboard never pops up unasked.
- Correct `type` and `inputMode`; never block paste; placeholders end with `…` and show an example.
- Errors sit inline next to the field.

## Motion and touch
- Never `transition: all`; list the properties. Animate `transform`/`opacity`; honour `prefers-reduced-motion`.
- Hit targets are at least 44px on phones; modals and sheets use `overscroll-behavior: contain`; full-bleed layouts respect `env(safe-area-inset-*)`.

## Content and layout
- Use `…`, not `...`, in loading texts and placeholders.
- Text containers handle long content (`min-width: 0`, ellipsis or wrap); empty states are handled.
- `<img>` has `width`/`height` (or a CSS size) and `loading="lazy"` below the fold.
- Brand names and code tokens may use `translate="no"`.
- Dates and numbers go through `intlLocale()` and the shared formatters.
- Destructive actions confirm or offer undo.
