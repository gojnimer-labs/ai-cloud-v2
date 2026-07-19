// The Stone theme is vendored as editable source at src/themes/stone/ (via
// `npx astryx theme add stone`) and compiled to CSS + JS (via
// `npx astryx theme build`). Importing the built artifact here — instead of
// the source theme + <Theme>'s runtime style injection — is what Astryx
// recommends for production: the CSS ships as a static file rather than
// being generated in the browser on every load. Its companion CSS is
// imported statically in src/app/styles/index.css.
export { stoneTheme as appTheme } from "@/themes/stone/stone";
