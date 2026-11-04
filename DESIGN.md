# DESIGN.md: howtousecosmetics.html

Direction: session sheet. The page reads as the order of a tattoo session.
Each phase opens with a thin black band. Products sit in rows, grouped where
they are alternatives. No tinted surfaces: every phase sits on white. The
hero is outside this system and stays as it is.

## Colours (roles)

| Role | Value | Where it is defined | Use |
|---|---|---|---|
| Ink | `#000000` | `--black` (css/main.css) | headings, phase bands, buttons |
| Paper | `#FFFFFF` | `--bg` (css/main.css) | page, image tiles |
| Teal | `#43BDAB` | `--color-primary` (css/main.css) | sequence and state only: phase number, active index marker, button hover |
| Text | `#1A2422` | `--htu-text` (css/howtouse.css) | steps (15.9:1 on white) |
| Muted | `#5A6866` | `--htu-muted` (css/howtouse.css) | supporting copy and step numbers (5.8:1 on white) |
| Rule | `#DDE6E4` | `--htu-rule` (css/howtouse.css) | dividers and thumbnail edges, never the only cue |
| On-dark muted | `#B9C7C5` | `--htu-on-dark-muted` (css/howtouse.css) | secondary text on black (12:1) |

Teal rules:
- As text: only on black (9.11:1).
- As a fill: white text, the brand look (active index marker, button hover). This is 2.31:1, below AA, accepted by the owner on 2026-11-04. Both are states, not the only place the information lives: the active phase name turns black and bold, and the button text is readable before hover.
- On white: only as a reinforcement, never the only signal (2.31:1).

The muted grey is `#5A6866`, not `--color-muted` (`#666666`): it leans towards the teal on purpose.

Not used on this page: orange `#ffa300` (promotions) and blue `#075985` (header dropdown).

## Typography

- Outfit 800 for display (phase number and title, tips title), 700 for product names. Never 900: it is not loaded.
- Montserrat 400 for body, 600 for buttons, the index and group labels (Transfer, Fix, Clean, Glide: 14px desktop, 13px mobile, muted).
- Three levels inside a product, never the same size and colour twice: name (Outfit 700), intro (Montserrat 14px on mobile, muted), steps (Montserrat 15px, dark).
- Sizes (desktop): 13, 14, 15, 17, 20, 22, 28. On mobile the 28 becomes 22 and the 22 becomes 18.
- Line height: 1.55 to 1.6 for body, 1.1 to 1.3 for headings.
- Tracking: -0.02em only at 28px; 0 below that.
- `text-wrap: balance` on headings, `pretty` on paragraphs and steps.

## Space

- Scale: 4, 8, 12, 16, 24, 32, 40, 48, 64, 96.
- Tight inside a group, wide between groups and phases.
- Gutter: 40px desktop, 24px below 1100px, 16px at 768px and down.

## Shape

- Radii: 4 (index markers), 8 (buttons, focus rings), 12 (phase bands, image tiles).
- Product rows have no box: a 1px rule separates them.
- No shadows. No gradients (the hero's own fade is part of the hero).

## Motion

- One moment: the phase index marking where you are (180ms colour change).
- Hover and transitions only on things you can click: buttons, index links, the mobile accordion.
- `prefers-reduced-motion`: css/main.css already removes transitions site-wide.

## Layout and breakpoints

- 1100px and up: index as a sticky column on the left; glides (phase 3) and home care (phase 5) side by side.
- 769px to 1099px: index as a sticky strip below the header; every product as a row, all open.
- 768px and down: no index. Each phase band (exactly 40px, 1px #2A2A2A top hairline) sticks under the header while its phase is on screen, like a list section header; products are an accordion with 56px thumbnails. From band to the first row's content is 24px in every phase.
- The index sticks below the injected header: `--htu-header-h` falls back to 80px (desktop), 86px (mobile), 77px (400px and down), and js/howtouse.js replaces it with the measured height. The index sits at z-index 900, under the header (1000), the cart drawer (999/1000) and the mobile menu (2000).

## Rules

- No pill or eyebrow labels above headings. No centred section headings.
- Phase bands show only the teal number and the title. The word "Phase" stays in the HTML for screen readers (`.howtouse-sr-only`).
- Numbers only for real sequences: the five phases and the steps inside a product. Products are not numbered. Step numbers are quiet (Montserrat 600, 13px, muted), so the steps read first.
- Content is in the HTML and visible without JavaScript; the script only collapses it.
- Copy is closed. New labels (group names, aria-labels) need approval before they go in.
