# Colour research for MuTick

These are short findings that inform the palette options and the plan. Sources are linked inline. Where the only source is a third-party write-up rather than the company itself, it says so.

## 1. How respected finance and data products use colour

| Product | What they do | What MuTick can take from it |
|---|---|---|
| **Linear** | Rebuilt its theme generator in **LCH** (a perceptual colour space, so the same lightness looks equally light in every hue). Themes now come from 3 inputs (base, accent, contrast) instead of 98 variables, and the team cut how much blue goes into the greys to get "a more neutral and timeless appearance". [Linear: How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) | Define neutrals in OKLCH with almost no chroma. Derive panel, raised and line by lightness steps, not by eye. |
| **Stripe** | Built its colour system in a perceptually uniform space (CIELAB) because HSL lightness lies: yellow looks lighter than blue at the "same" value. Contrast targets came first and the hues were chosen to fit them. [Stripe: Designing accessible color systems](https://stripe.com/blog/accessible-color-systems) | Pick lightness for the contrast you need, then pick the hue. This is how the options were built (see `palettes.mjs`). |
| **Bloomberg Terminal** | Estimates about 20,000 of its users have colour vision deficiency. It ships alternative schemes for deuteranopia and protanomaly instead of dropping red and green, because those colours carry meaning in finance. [Tech at Bloomberg: Designing the Terminal for color accessibility](https://www.techatbloomberg.com/blog/designing-the-terminal-for-color-accessibility/) (page blocks fetching; findings come from its summary and Bloomberg's [accessibility page](https://www.bloomberg.com/ux/accessibility/)) | Keep green for up and red for down so Amir's mental model holds, but tune them so they still separate for colour-blind users, and keep the arrows. |
| **Koyfin** | Folded its dark themes (Midnight Blue, Pitch Black, Monochrome, Deep Ocean) into a single Dark Mode built on the midnight-blue theme. [Koyfin help: Light and dark modes](https://www.koyfin.com/help/theme-update-light-and-dark-modes-in-koyfin/amp/) | Even a dense analyst tool keeps a single quiet dark ground. Pure black was not the one it kept. |
| **Robinhood** (2024 identity) | Palette "rooted in black, white and neutrals" with "purposeful pops" of one bright accent. [Robinhood newsroom](https://robinhood.com/us/en/newsroom/a-new-visual-identity), [Porto Rocha case study](https://www.portorocha.com/robinhood) | Neutrals carry the product and the accent is rare. The accent is a decision, not decoration. |
| **Ramp, Mercury** (third-party summaries) | Ramp: mostly monochrome with one accent used mainly on the main CTA. Mercury: dark indigo-black canvas with the accent saved for the primary button; it deliberately avoids the usual finance blue and green. [Kombai: Ramp](https://kombai.com/gallery/design-systems/ramp-kombai/), [925 Studios: Mercury breakdown](https://www.925studios.co/blog/mercury-design-breakdown) | Unofficial sources, so treat the hex values as approximate. The pattern is consistent: one accent, used sparingly. |
| **Vercel (Geist)** | Systematic grey scale (100–1000) plus a small set of functional hues; high contrast and accessible. [Geist design system](https://vercel.com/geist) | A disciplined grey ramp does most of the work. |

**In common:** near-neutral grounds with a slight tint, one accent used rarely, data colours kept for data, and colour defined in a perceptual space. None of them put a glow behind the content.

## 2. What reads as "AI-generated" today

- **Defaults from training data.** Anthropic's own write-up says unguided models drift to "Clichéd color schemes (particularly purple gradients on white backgrounds)", Inter, and minimal motion, because those safe patterns dominate the web. [Claude blog: Improving frontend design through skills](https://claude.com/blog/improving-frontend-design-through-skills)
- **Tailwind's indigo.** Adam Wathan apologised for making every Tailwind UI button `bg-indigo-500`, which is often blamed for purple AI UIs. [prg.sh: Why your AI keeps building the same purple gradient website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website) (blog)
- **The dark-mode version of the same tell** is what MuTick has now: near-black blue-black, one saturated warm accent, a **blurred radial glow** behind the hero, a **faint grid**, **gradient text** on the headline, and **glassy chips** with `backdrop-blur`. Each is fine alone. Together they are the template look.
- **Glassmorphism** has no fixed contrast to test against WCAG, so text on glass is a readability risk. [Medium: Glassmorphism, the most beautiful trap](https://medium.com/design-bootcamp/glassmorphism-the-most-beautiful-trap-in-modern-ui-design-a472818a7c0a)

**What reads as crafted instead:** tinted neutrals rather than pure or blue-black; warm or cool chosen on purpose; one accent with a reason behind it; light that comes from one direction; texture rather than blur; emphasis through type weight and tone, not gradient fills on text.

## 3. Using gradients so they look deliberate

1. **Tonal, not chromatic.** Keep a gradient inside one hue family, changing only lightness (for example ink to a slightly lifted ink-blue). Two-hue gradients like amber to orange or purple to pink are the generic ones.
2. **Light from one direction.** Gradients should agree on where the light is. For MuTick that is **from above**: hero wash from the top, card highlight on the top edge, borders brighter at the top.
3. **Gradient borders, 1px, low opacity.** The usual technique is two backgrounds, one clipped to `padding-box` and one to `border-box`. Guidance from the same sources: 1px, keep stops under about 0.4 opacity, no rainbow and no animation. [tessl: css-border-gradient](https://tessl.io/registry/skills/github/MengTo/Skills/css-border-gradient), [macmyths: 4 gradient border techniques](https://macmyths.com/how-to-add-a-gradient-border-in-css-4-reliable-techniques/)
4. **One hero element.** Pick one place where the gradient is the point (the start-screen wash) and keep everything else flat or nearly flat.
5. **Grain to kill banding.** Long, soft, dark gradients band in 8-bit colour. A tiny tiled `feTurbulence` noise at low opacity hides the bands and adds a printed-paper feel. Use `stitchTiles`, a small tile and 3 octaves at most for speed. [Frontend Masters: Grainy gradients](https://frontendmasters.com/blog/grainy-gradients/), [InstantGradient: Why noise makes gradients look better](https://instantgradient.com/blog/grainy-gradients)
6. **Never on text, buttons or numbers.** Gradient text lowers legibility and is the clearest AI tell.

## 4. Up and down colours that pass AA and work for colour-blind users

- **Red and green merge for about 1 in 12 men** (deuteranopia and protanopia). Blue and orange is the safest pair. If you must keep red and green, **separate them in lightness and push the hues apart**: green toward blue-green, red toward vermilion. [Datawrapper: Colorblindness part 2](https://www.datawrapper.de/blog/colorblindness-part2), [Datylon: Data viz for colorblind readers](https://www.datylon.com/blog/data-visualization-for-colorblind-readers), [Okabe & Ito: Color Universal Design](https://jfly.uni-koeln.de/html/color_blind)
- **Don't rely on colour alone** (WCAG 1.4.1). MuTick's `Delta` chip already shows ↗/↘ and a sign, which covers it. Keep that. The trading app Futubull uses hollow and filled candles for the same reason. [Android Developers: Futubull](https://developer.android.com/stories/apps/futu)
- **Check text contrast on the tinted chip as well as on the panel.** `bg-up/12` darkens or lightens the background a little.
- **Measured for MuTick** (see `palettes.mjs`, Machado 2009 simulation, ΔE in OKLab ×100):
  - Today's `#34c38f` / `#ef6161` are only **ΔE 6.8 apart for deuteranopia**, so they are hard to tell apart.
  - The proposed `#6ad6b0` / `#e87556` are **12.8 apart**, nearly twice as far, while staying recognisably green and red. Both pass AA on the panel (10.1 and 6.1) and on their chips (8.0 and 5.2).
  - A true blue/orange pair would separate further. It's worth offering later as a setting (as Bloomberg does), but it would change what Amir is used to, so it isn't the default.
