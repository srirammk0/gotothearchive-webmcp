# Visual system

## Direction

The visual direction is **warm editorial light**: an archive publication that can be operated, combined with the focus of a working desk.

Dark mode is deferred. It may later become a gallery or focus mode, but the first design system must be resolved in light mode rather than splitting attention across two themes.

## Emotional goals

The product should feel:

- Personal rather than institutional.
- Cultivated rather than algorithmic.
- Calm despite sophisticated capability.
- Expressive through the user's material.
- Trustworthy without resembling a security console.
- Alive through purposeful state transitions.

It should not feel like a generic SaaS dashboard, AI chat product, node graph, database admin tool, or clone of Are.na.

## Palette

- Warm ivory or paper neutral as the dominant background.
- Ink-like near-black for primary text.
- Warm grays and stone tones for metadata and separators.
- One lively accent used sparingly for attention and state.
- User media supplies most of the page's chroma.

Candidate accents include coral/vermilion or acidic chartreuse. The final accent should pass contrast requirements and retain meaning without relying on color alone.

Avoid pure white, pure black, blue-purple AI gradients, glowing neon controls, glassmorphism, and decorative gradient text.

## Typography

- Editorial serif for archive headings, artifact titles, reflective statements, and select display moments.
- Restrained sans-serif for metadata, navigation, controls, permissions, and dense operational information.
- Use a deliberate modular type scale with strong differences between display, section, item, and metadata levels.
- Keep body copy readable and relatively narrow.
- Avoid using monospaced type as the product's default “agent” aesthetic. Reserve it for actual code and technical inspection.

The type system should make a clear distinction between cultural material and operational controls without making them feel like different products.

## Composition

- Large negative space is structural, not leftover.
- Use editorial asymmetry and varied rhythm.
- Let one image or artifact dominate when it matters.
- Use hairline rules, alignment, and whitespace instead of card containers.
- Group related content through proximity before adding borders or backgrounds.
- Avoid identical card grids and evenly weighted dashboard modules.
- Do not center every page.

Archive browsing may use list, index, and gallery compositions. Workbench is more focused and utilitarian, but retains the same type, rules, and paper-like surface.

## Surfaces and controls

- Mostly flat surfaces.
- Minimal shadow, used only for actual elevation or transient overlays.
- Restrained corner radii tied to interaction rather than decoration.
- Buttons have clear hierarchy; not every action is primary.
- Permission and review states combine text, iconography, and color.
- Inline expansion is preferred over modal interruption.

## Motion

[interior.dev](https://www.interior.dev/) is the interaction-behavior reference, not the visual identity.

Use motion to clarify:

- Tool and permission registration changes.
- Agent task transitions.
- Artifact processing and version arrival.
- Annotation creation and resolution.
- Review decisions.
- Expansion of provenance and taste evidence.

Principles:

- Fast response at the point of interaction.
- No layout jumps when labels or loading states change.
- Smooth deceleration rather than bounce.
- Transform and opacity for most animation.
- Respect reduced-motion preferences.
- One orchestrated transition is better than many decorative micro-animations.

Potential interior.dev patterns include Dropdown for grant changes, Popover for access explanations, Loading Button and Progress Bar for processing, and Show More for influence trails. Components must be restyled to the Archive visual system.

## Image and artifact treatment

- Preserve original aspect ratios unless a deliberate crop is clear.
- Use neutral mats for mixed media.
- Avoid placing every image inside the same card shell.
- Show source and provenance quietly but consistently.
- Make selection and annotation targets visible without permanently obscuring the work.
- Use thumbnails as navigation aids, not substitutes for focused viewing.

## Accessibility

- Meet WCAG AA contrast at minimum.
- All spatial and hover interactions need keyboard and nonvisual equivalents.
- Focus states must be obvious within the quiet palette.
- Annotation meaning cannot depend on red/green alone.
- Support browser zoom and reflow.
- Provide meaningful alt text for Archive images where available and expose source descriptions separately from inferred captions.
- Agent capability changes and artifact status changes use appropriate live announcements.

## Reference interpretation

The saved light references contribute the primary direction: paper tone, serif/sans contrast, media-led color, editorial whitespace, and asymmetric hierarchy.

The saved Are.na references contribute spatial confidence, gallery scale, restrained chrome, and the sense that personal material is the protagonist. Their pure-black default and exact information architecture are not to be copied.

See [`design/references`](references/README.md).
