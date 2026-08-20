/**
 * RHLZ — single source of truth for product identity.
 *
 * Product name:  RHLZ  (the control plane)
 * Panel UI name: RHLZ Panel
 * Mark:          angular R cut from a rounded square (see IntroOverlay SVG)
 *
 * Every page title, banner, footer, log line, installer echo, and metadata
 * file must import from here. Never hardcode brand strings in components.
 *
 * Legal: this project is derived from an MIT-licensed upstream work by
 * Jishnu. Rebranding the product, UI, banners and identity is permitted;
 * the upstream MIT license text and the author's copyright notice stay
 * intact in the LICENSE file (RHLZ's copyright sits ABOVE it).
 */

export const PRODUCT_NAME = "RHLZ";
export const PANEL_UI_NAME = "RHLZ Panel";
export const FAMILY_NAME = "RHLZ";
export const SHORT_CODE = "rhlz";
export const SECURITY_CORE = "RHLZ Secure Core";
export const VERSION = "3.1.0";
export const TAGLINE = "Compact control plane for game servers and jailed code runtimes.";
export const COPYRIGHT = "© 2026 RHLZ. All rights reserved.";
/** API keys are minted with this prefix; rvn_ (previous-generation) keys stay valid. */
export const API_KEY_PREFIX = "rhlz_";

export const MAIN_BANNER = `
============================================================
    R H L Z   P A N E L
    ${TAGLINE}
    ${COPYRIGHT}
============================================================`;

/** Keep the legacy export name working (server.ts prints this on boot). */
export const ASCII_BANNER = MAIN_BANNER;

export const MINI_MARK = `
   RHLZ PANEL
   rhlz-node agent
   © 2026 RHLZ`;

export const CYPHER_SEAL = [
  "┌─[ RHLZ SECURE CORE ]───────────────┐",
  "│  ✓ hardened · audited · watching   │",
  "└────────────────────────────────────┘",
].join("\n");
