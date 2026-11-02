import { ImageResponse } from "next/og";

export const runtime = "nodejs";

/**
 * The social card, drawn from the same mark and palette as the app.
 *
 * public/og-image.png is a capture of this route — the metadata points at the
 * static file so a crawler never waits on a font download. Re-capture it after
 * changing anything here.
 */

// Same paths as src/components/shared/Logo.tsx. Satori cannot follow
// `currentColor` into an <img>, so the colour is written into the SVG.
const P = "M5 2 H16 A8.5 8.5 0 0 1 16 19 H11.5 V30 H5 Z M11.5 8 H16 A2.5 2.5 0 0 1 16 13 H11.5 Z";
const CHECK = "M14 21 L19 26 L29 9";

const PETROL = "#1c5f68"; // primary-600
const INK = "#1e1c19"; // slate-900
const MUTED = "#635e56"; // slate-600
const PAPER = "#faf9f7"; // bg-secondary

const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
<mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
<rect width="32" height="32" fill="white"/>
<path d="${CHECK}" stroke="black" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>
</mask>
<path d="${P}" fill="${PETROL}" fill-rule="evenodd" mask="url(#cut)"/>
<path d="${CHECK}" stroke="${PETROL}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
const markSrc = `data:image/svg+xml;base64,${Buffer.from(mark).toString("base64")}`;

export async function GET() {
  const [plexBold, plexRegular] = await Promise.all([
    fetch(
      "https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDDV5zAA.ttf"
    ).then((res) => res.arrayBuffer()),
    fetch(
      "https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llzAA.ttf"
    ).then((res) => res.arrayBuffer()),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: PAPER,
          fontFamily: "IBM Plex Sans",
        }}
      >
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={168} height={168} alt="" style={{ marginRight: "36px" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: "112px",
                fontWeight: 700,
                color: INK,
                letterSpacing: "-2px",
                lineHeight: 1,
              }}
            >
              Probook
            </div>
            <div
              style={{
                fontSize: "32px",
                fontWeight: 400,
                color: MUTED,
                marginTop: "14px",
                paddingLeft: "4px",
              }}
            >
              Smart Business Management
            </div>
          </div>
        </div>
        {/* The accent as a single band, the way it appears in the app: rare. */}
        <div style={{ height: "16px", backgroundColor: PETROL }} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "IBM Plex Sans", data: plexBold, weight: 700, style: "normal" },
        { name: "IBM Plex Sans", data: plexRegular, weight: 400, style: "normal" },
      ],
    }
  );
}
