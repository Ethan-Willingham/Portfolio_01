# Descent assets

`hydrogen-still.png` is an original CPU calculation of the stated analytic
1s/2p density. Its exact origin is in `hydrogen-still-origin.json`. It is not
a photograph or a GPU recording.

`drand-verifier-1.4.2.js` is the official npm drand-client 1.4.2 prebuilt browser
ESM artifact, locally minified with esbuild 0.25.10. The public project is
https://github.com/drand/drand-client. Its MIT license and the bundled dependency
licenses are retained alongside it. This file verifies the pinned quicknet
chain; it contains no API key or remote-code import.

Evidence screenshots are captures of the live Descent host and actual room
models, not pre-rendered inputs used by the piece. Film colors and hydrogen's
spectral encoding derive from the International Commission on Illumination's
CIE 1931 2-degree observer, DOI 10.25039/CIE.DS.xvudnb9b, and the film also uses
CIE standard illuminant D65. Those source tables and their derived encodings
are CC BY-SA 4.0. Film and spectral-hydrogen screenshots retain that attribution
and license. See the source rooms' asset attribution for unchanged input tables.

Sources:

- https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer
- https://cie.co.at/datatable/cie-standard-illuminant-d65
- https://creativecommons.org/licenses/by-sa/4.0/
