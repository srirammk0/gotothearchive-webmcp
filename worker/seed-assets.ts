/**
 * Seeded visual references, as SVG.
 *
 * The Archive is a designer's working library, and the visual system asks for
 * the person's material to be the protagonist. Seeding items with no image at
 * all left every "Image" rendering as a grey text row, which is why the first
 * pass read as a list rather than an archive. These are drawn rather than
 * fetched so the demo has no external asset dependency and no licensing question.
 */

export interface SeedAsset {
  key: string;
  svg: string;
}

const palette = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <rect width="800" height="600" fill="#EFE9DC"/>
  <rect x="0" y="0" width="800" height="300" fill="#C2542E"/>
  <rect x="0" y="300" width="266" height="300" fill="#E0A97B"/>
  <rect x="266" y="300" width="267" height="300" fill="#8C4A32"/>
  <rect x="533" y="300" width="267" height="300" fill="#F5EFE3"/>
  <circle cx="640" cy="150" r="74" fill="#F5EFE3" opacity="0.92"/>
  <text x="640" y="158" font-family="Georgia, serif" font-size="26" fill="#8C4A32" text-anchor="middle">Atlas</text>
  <text x="40" y="272" font-family="Helvetica, Arial, sans-serif" font-size="15" letter-spacing="3" fill="#F5EFE3">TERRACOTTA / CREAM</text>
  <text x="40" y="356" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="2" fill="#5A3B2A">E0A97B</text>
  <text x="306" y="356" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="2" fill="#F0DFD2">8C4A32</text>
  <text x="573" y="356" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="2" fill="#8A8071">F5EFE3</text>
</svg>`;

const typeSpecimen = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 620" width="800" height="620">
  <rect width="800" height="620" fill="#F7F3EA"/>
  <line x1="56" y1="92" x2="744" y2="92" stroke="#D9D1BF" stroke-width="1"/>
  <text x="56" y="76" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="4" fill="#8A8071">SPECIMEN — EDITORIAL SERIF</text>
  <text x="56" y="230" font-family="Georgia, serif" font-size="132" fill="#211D17">Aa</text>
  <text x="300" y="196" font-family="Georgia, serif" font-size="54" fill="#211D17">Warmth,</text>
  <text x="300" y="252" font-family="Georgia, serif" font-size="54" fill="#C2542E" font-style="italic">set in serif</text>
  <line x1="56" y1="300" x2="744" y2="300" stroke="#D9D1BF" stroke-width="1"/>
  <text x="56" y="352" font-family="Georgia, serif" font-size="30" fill="#211D17">The quick brown fox jumps over</text>
  <text x="56" y="392" font-family="Georgia, serif" font-size="30" fill="#211D17">the lazy dog — 0123456789</text>
  <text x="56" y="452" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#57503F">Humanist sans for the body. Quiet, even colour on the page, and</text>
  <text x="56" y="476" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#57503F">a wide enough aperture to hold up at small sizes.</text>
  <rect x="56" y="524" width="180" height="6" fill="#C2542E"/>
  <text x="56" y="566" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="3" fill="#8A8071">DISPLAY / TEXT PAIRING</text>
</svg>`;

const onboarding = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 560" width="900" height="560">
  <rect width="900" height="560" fill="#EDE7DA"/>
  <text x="56" y="60" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="4" fill="#8A8071">ONBOARDING — THREE SCREENS</text>
  <g>
    <rect x="56" y="96" width="230" height="400" rx="26" fill="#FBF8F2" stroke="#D9D1BF"/>
    <circle cx="171" cy="200" r="44" fill="#E0A97B"/>
    <rect x="96" y="272" width="150" height="12" rx="6" fill="#211D17"/>
    <rect x="96" y="298" width="110" height="9" rx="4" fill="#C9C1B1"/>
    <rect x="96" y="318" width="130" height="9" rx="4" fill="#C9C1B1"/>
    <rect x="96" y="424" width="150" height="34" rx="17" fill="#C2542E"/>
  </g>
  <g>
    <rect x="326" y="96" width="230" height="400" rx="26" fill="#FBF8F2" stroke="#D9D1BF"/>
    <rect x="366" y="150" width="150" height="90" rx="10" fill="#EDE7DA"/>
    <rect x="366" y="150" width="60" height="90" rx="10" fill="#8C4A32"/>
    <rect x="366" y="266" width="130" height="12" rx="6" fill="#211D17"/>
    <rect x="366" y="292" width="150" height="9" rx="4" fill="#C9C1B1"/>
    <rect x="366" y="424" width="150" height="34" rx="17" fill="#C2542E"/>
  </g>
  <g>
    <rect x="596" y="96" width="230" height="400" rx="26" fill="#FBF8F2" stroke="#D9D1BF"/>
    <circle cx="711" cy="210" r="52" fill="none" stroke="#C2542E" stroke-width="7"/>
    <path d="M688 210 l16 17 l30 -34" fill="none" stroke="#C2542E" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="636" y="298" width="150" height="12" rx="6" fill="#211D17"/>
    <rect x="656" y="324" width="110" height="9" rx="4" fill="#C9C1B1"/>
    <rect x="636" y="424" width="150" height="34" rx="17" fill="#211D17"/>
  </g>
</svg>`;

const logoDraft = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" width="800" height="520">
  <rect width="800" height="520" fill="#211D17"/>
  <text x="56" y="60" font-family="Helvetica, Arial, sans-serif" font-size="12" letter-spacing="4" fill="#8A8071">ATLAS — WORDMARK DRAFT v1</text>
  <text x="56" y="250" font-family="Georgia, serif" font-size="112" fill="#F5EFE3" letter-spacing="-2">atlas</text>
  <circle cx="612" cy="212" r="58" fill="#C2542E"/>
  <line x1="56" y1="310" x2="744" y2="310" stroke="#3C352C"/>
  <text x="56" y="366" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#B9AF9C">Rounded terminals, low contrast, one warm accent.</text>
  <text x="56" y="392" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#B9AF9C">Client feedback pending.</text>
  <rect x="56" y="436" width="34" height="34" fill="#C2542E"/>
  <rect x="98" y="436" width="34" height="34" fill="#E0A97B"/>
  <rect x="140" y="436" width="34" height="34" fill="#F5EFE3"/>
</svg>`;

/** Keyed by the seed item they belong to. */
export const SEED_ASSETS: Record<string, string> = {
  ref_terracotta: palette,
  ref_editorial_type: typeSpecimen,
  ref_onboarding_flow: onboarding,
  draft_atlas_v1: logoDraft,
};
