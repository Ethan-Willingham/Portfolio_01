# Soap-film optical data

CIE 2019, Colour-matching functions of CIE 1931 standard colorimetric observer,
International Commission on Illumination (CIE), Vienna, AT.
DOI: https://doi.org/10.25039/CIE.DS.xvudnb9b
Original data: https://files.cie.co.at/CIE_xyz_1931_2deg.csv
MD5: 17cca777db64b17170f06f67ce9d3ab7

CIE 2019, CIE standard illuminant D65, International Commission on Illumination
(CIE), Vienna, AT. DOI: https://doi.org/10.25039/CIE.DS.hjfjmt59
Original data: https://files.cie.co.at/CIE_std_illum_D65.csv
MD5: 03d4eb9b837c60671627c946fb534deb

Both original datasets and their unmodified metadata are included here. Their
metadata declares Creative Commons Attribution-ShareAlike 4.0 International:
https://creativecommons.org/licenses/by-sa/4.0/

The derived linear-lut.bin, lut.json, optical-checkpoints.json and still.webp
are distributed under the same CC BY-SA 4.0 license. The lookup is a new
calculation of lossless air-film-air reflection, not a CIE measurement of a soap
solution. Build it with node tools/test-soap-film-optics.mjs --bake.
The checkpoints came from the supplied research calculation, and agree with the
independent implementation in js/soap-film-optics.js. The still is the initial
thickness field, reflected D65 at 18 degrees, exposure 12, exponential tone
mapping, then sRGB encoding. No photograph or recorded movie is used.
