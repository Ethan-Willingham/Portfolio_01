# MRI editorial revision

Final title: **What's Actually on an MRI Disc**. The HTML title, social title and visible h1 retain this wording.

The payoff is a usable look through the owner's own MRI exports, with a clear distinction between an examination, its web images and the illustrative models made from it. The reading path runs from the disc experience to the slices, sequence labels, models, scanner and sharing limits. Four build steps are optional. Both viewers and model downloads stay on the page.

## Original issues and changes

- The standfirst said all 1,189 images came from the head, although the post described brain, cervical and lumbar studies. It also presented the displayed subset as all the raw files. The revised opening keeps the owner's disc experience and scan history, then distinguishes the verified 515 displayed slices from the reported 1,189 disc files.
- MRI was described as measuring each box of tissue sequentially, then moving to another slice. The new explanation names radio signals and spatial encoding by magnetic gradients. Brightness is sequence-dependent signal intensity, not tissue mass density.
- The T1/T2 explanation claimed that brightness simply flips. Fat can remain bright on ordinary T2 images. The revised text says what changes for fluid and explains suppression, SWI, DWI, MEDIC, contrast and the three plane labels without interpreting any finding in the owner's scan.
- The slice viewer was called raw and unchanged. It actually crops fixed-window, grayscale JPEG sprite sheets. Compression, fixed contrast and missing geometry fields are now explicit beside the viewer.
- The narrative implied a volume viewer and an untouched cortical surface. The deployed tool loads only two finished meshes. Neural estimation, skull stripping, filling ventricles, closing grooves and smoothing change the model. This limit appears before the 3D viewer and in its static and generated captions.
- Cube-shaped voxels were claimed to be a requirement for 3D. They are not. The revised notes distinguish physical coordinates, grid spacing and anatomical resolution. The reported 0.9 mm grid is retained as the original build's output target, with no claim that it recovered measured 0.9 mm anatomy.
- The torso caption said MRI cannot resolve bone. The replacement describes the actual rough localizer envelope and distinguishes that model's limitations from MRI's ability to show marrow and bone abnormalities.
- The field-strength ladder made unsupported rankings, population-frequency claims and assumptions about why the protocol was ordered. It is replaced by the verified Sola field strength and the relevant limits of comparing scans from these exports.
- The privacy heading guaranteed anonymity. The new callout describes the excluded DICOM headers and the published files, cites the DICOM standard's warning about metadata removal, and acknowledges that the scan is on the owner's named website.
- Repeated stack metaphors, dramatic praise, the field-strength tangent, seven-step duplication, the unverifiable six-minute training time and 42-series claim were removed. The ending states the actual limit of the display.

## Claim ledger

| Claim | Kind and confidence | Evidence opened or inspected | Editorial treatment |
| --- | --- | --- | --- |
| Requested MRI disc; 1,189 original image files; one-sided numbness; brain, neck and lower-back scans in one sitting; contrast injection | Existing owner account, preserved without independent confirmation | Original HTML and its historical revision | Kept as first person. No invented symptom, memory, diagnosis or rationale for the order. The disc itself is not in the published repository. |
| 16 displayed series, 515 slices | Direct asset observation, high confidence | [Manifest](/Users/ethan/Portfolio_01/archive/mri/assets/mri/manifest.json) and all 16 JPEG sheets | New exact count. Brain 226, cervical 135, lumbar 154. This is not a count of the complete disc. |
| Most tiles 448 by 448 pixels; SWI 240 by 256 | Direct implementation observation, high confidence | Manifest and decoded sheet dimensions | Display pixels are separated from millimeter-scale acquisition resolution. Other exceptions are DWI at 384 by 384 and cervical MEDIC at 448 by 336. |
| Fixed-window grayscale JPEGs cropped on a canvas | Current code and asset observation; windowing also part of original build account | [Viewer](/Users/ethan/Portfolio_01/archive/mri/js/mri.js), Pillow metadata and pixel inspection | Replaces raw-slices claim. All sheets are 8-bit grayscale JPEGs. No original DICOM signal range, voxel coordinates or physical spacing is supplied by these exports. |
| MRI signal and spatial encoding | Established mechanism, high confidence | [NIH MRI introduction](https://www.nibib.nih.gov/science-education/science-topics/magnetic-resonance-imaging-mri), [Siemens sequence teaching material](https://academy.siemens-healthineers.com/_/id-id/mr-pulse-sequence-practice-id/), [ACR/RSNA explanation](https://www.radiologyinfo.org/en/info/safety-mr) | Corrects sequential box measurement and simple density language. |
| Ordinary T1 fluid dark/fat bright; ordinary T2 fluid bright and fat can remain bright; FLAIR/STIR/FS suppression; diffusion sensitivity | Established contrast definitions, high confidence within the stated ordinary-sequence scope | [Lauder and Driscoll, Radiology Introduction](https://catalogimages.wiley.com/images/db/pdf/9781119809449.excerpt.pdf), chapter 1, sections 1.13.3 and table 1.3, pages 8 to 10 | Full relevant publisher excerpt opened and read. No tissue-wide brightness inversion or diagnosis from a single sequence. |
| MEDIC combines signal echoes; clinical 2D and 3D acquisition; spatial encoding | Official manufacturer teaching source, high confidence | [Siemens sequence guide](https://academy.siemens-healthineers.com/_/id-id/mr-pulse-sequence-practice-id/), slides 28 to 30 and 67 to 74 | Removed assertion that radiologists universally read only 2D protocols. |
| SWI uses susceptibility differences, showing veins and iron-rich tissue | Modest definition supported by the original authors; no sensitivity claim | [Haacke et al., 2004](https://pubmed.ncbi.nlm.nih.gov/15334582/) | PubMed abstract and described magnitude/phase masking method opened. Full journal article was not available. Removed faintest-trace rhetoric; do not treat this reference as validation of these exports. |
| DICOM image position/orientation/pixel spacing; thickness differs from center spacing | Standard specification, high confidence | [DICOM PS3.3 C.7.6.2](https://dicom.nema.org/medical/dicom/current/output/chtml/part03/sect_C.7.6.2.html) | Corrects stack geometry and rejects indiscriminate mixing of contrasts and planes. Actual source T1 geometry is not present in the current web assets. |
| Self-trained network; approximately 0.9 mm output grid; HD-BET; filling and smoothing | Original process account, not independently reproducible from shipped assets | Original HTML; [HD-BET official implementation](https://github.com/MIC-DKFZ/HD-BET); [Zhao et al., Self Super-Resolution](https://arxiv.org/pdf/1802.09431) | Preserved existing process claims without adding architecture, timing, training data or performance. Published research explains estimation, not which exact network this build used or whether its details are accurate. |
| Resampling is different from recovered anatomical resolution | Physical/model distinction, high confidence | Zhao et al., full four-page paper, methods and experiments | The paper uses 20 downsampled subjects with known high-resolution references, plus real low-resolution data without ground truth. Its results do not validate this owner's mesh. Smaller grid spacing alone cannot establish recovered detail. |
| Brain has 120,000 triangles and 60,002 vertices; torso 75,342 triangles and 39,211 vertices | Binary asset observation, high confidence | MZ3 headers after gzip decoding, cross-checked against GLB index and position accessor counts | The brain triangle count is retained exactly. GLB generator identifies trimesh; no segmentation pipeline or training log accompanies the exports. |
| Current 3D shows meshes only | Direct code and network observation, high confidence | Viewer loadMeshes calls; live browser requests; restore commit 5e6beae1 | Removed unused volume modes and SCENES volume paths. Removed manifest entries naming three absent NIfTI volumes. No volumes restored or assets added. |
| Spine MRI can show marrow, bone abnormalities, discs, nerves and cord | Official clinical guidance, high confidence | [ACR/RSNA Spine MRI](https://www.radiologyinfo.org/en/info/spinemr), plus Lauder/Driscoll marrow description | Separates a stylized envelope from MRI's clinical capabilities. |
| Sola is 1.5 tesla | Manufacturer specification, high confidence; scanner use remains owner account | [Current Sola specification](https://www.siemens-healthineers.com/en-us/magnetic-resonance-imaging/1-5t-mri-scanner/magnetom-sola) | Replaced dead old product URL. Removed model-year, global prevalence, doubled-signal and scan-quality ranking claims. |
| Removing identifiers does not guarantee anonymity | Standard specification, high confidence | [DICOM PS3.15 Annex E](https://dicom.nema.org/medical/dicom/current/output/chtml/part15/chapter_E.html), opening warning and pixel/visual feature provisions | Removes absolute promise. JPEG metadata is only JFIF; GLB JSON contains geometry/generator information. This is not a formal re-identification or complete pixel-privacy audit. |

No clinical conclusion about the owner's symptoms or anatomy is offered. External sources explain formats, physics and established techniques. They are not evidence that this particular processed model is medically accurate.

## Length and voice

Approximate original body: 1,332 words, all on the main path. Revised body: 976 words total, 706 on the main path and 270 in optional build notes. Counts include headings, static captions and controls, but exclude the hero and footer. The exact final count varies slightly with tokenization of hyphenated terms.

The total cut is approximately 27 percent and the main path is approximately 47 percent shorter. A ten-percent cut was considered and exceeded: the field-strength tangent and repeated conversion explanation did not earn their space. The remaining length gives enough context to use the viewers and recognize the most consequential limitations. Metadata now says four minutes for the main reading and two minutes for build notes, with interactive viewing separate.

The five VOICE passes were applied: flat sentence reading, opening deletion test, generic-sentence check, volume cut and source pass. The first paragraph stays because the symptom, regions and disc format are owner-specific information that disappears without it. Technical detail stays in the optional section when it is needed to understand construction rather than operate the viewer.

## Viewer changes

- Dynamic NiiVue import and independent initializers allow the slice viewer to work when the external 3D library fails.
- Every series selection invalidates previous image callbacks. An old sheet can still enter the cache, but cannot replace the selected series or its failure message.
- Switching series stops playback. Repeated start calls do not create multiple timers; stop clears the timer reference.
- Play and Pause use clear text and updated accessible labels/states. Region and series buttons also expose their selection.
- Mesh loads are serialized, with the latest selection winning. Older asynchronous responses cannot leave the wrong mesh under a newer caption.
- Failed loads have truthful messages with no endless loading spinner. 3D controls remain disabled until initialization succeeds.
- Existing mouse wheel, dragging, touch dragging, slider, animation, mesh switching, native rotation/zoom and auto-rotation remain. Local module URL is bumped to v=20261003a.

## Verification performed

- JavaScript syntax: node --check for local module; inline classic scripts parsed with Node VM.
- git diff --check passed for the owned archive files.
- All 16 sprite files were decoded with Pillow. Dimensions match rows/columns and tile sizes. Counts sum to 515. JPEG metadata and all four model file structures were inspected.
- Browser harness used the approved agent-chrome-for-testing executable, owned its own local server and closed browser/server in finally blocks.
- All 16 series were selected across all three regions. Each slider maximum and count readout matched the manifest. First, middle and last slices in every series matched independent source JPEG crops pixel for pixel, including non-square SWI and MEDIC tiles.
- Wheel stepping, mouse dragging, slider scrubbing, play advancement, pause stability and accessible state were exercised. Repeated start retained one timer and stop cleared it.
- A deliberately delayed initial sprite completed after another series was selected and could not replace it.
- Live NiiVue loaded both actual MZ3 files. Both region switches, native pointer rotation, wheel zoom and auto-rotate checkbox worked. Native rotation changed azimuth/elevation; wheel zoom changed its scale from 1 to 1.1.
- A deterministic NiiVue test double additionally verified rapid spine/brain selection, one in-flight load and the final requested mesh, plus auto-rotation stop/restart. This supplements the real library test and is not presented as an actual-render check.
- Aborted external import produced the 3D-unavailable message while 2D region, series, play and scrub remained usable.
- At 375px the page had no horizontal overflow and exactly 20px left/right reading gutters. Desktop and mobile screenshots were visually inspected. The hero uses the shared contract, the reading column uses Century Supra, and major sections use centered serif headings and fine rules. Build disclosure opens.
- No page errors occurred in the successful live-viewer run. No em dashes, en dashes or prohibited encoded controls remain in the owned files.

Temporary verification files: /tmp/mri-editorial/check.cjs, check-report.json, desktop.png and mobile.png. No repository test harness, shared file, index or progress ledger was edited.

## Residual limits

The original DICOM files, pipeline scripts, acquisition-spacing measurements and training logs are absent from the shipped repository and the restored MRI history. Accordingly the 1,189 original file count, scan history and exact reconstruction process remain the owner's existing account. The six-minute timing, 42-series count, claimed 0.3/0.4 mm resolution and 5 to 6 mm slice spacing were omitted because this review could not check them. Old manifest volume spacing values referred to absent scout/SWI volumes and could not substantiate the T1 brain mesh.

WebGL2 and the external NiiVue import are still required for the real 3D render. The 2D viewer no longer shares that failure mode. The 3D control checks use a real desktop browser at mobile viewport size, not a physical phone or a touch-device test. No diagnostic or re-identification assessment was performed.

Proposed archive card, 29 words:

> I asked for my MRI on a disc and got 1,189 image files. Browse selected brain and spine slices, then rotate two models and see what their processing changes.

Changed files: archive/mri/mri.html; archive/mri/js/mri.js; archive/mri/assets/mri/manifest.json; docs/editorial/2026-10-03/mri.md.
