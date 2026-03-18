import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const iconPath = join(process.cwd(), "public", "probook-icon.png");
  const iconBuffer = await readFile(iconPath);
  const iconBase64 = `data:image/png;base64,${iconBuffer.toString("base64")}`;

  const interBold = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf"
  ).then((res) => res.arrayBuffer());

  const interRegular = await fetch(
    "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf"
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "white",
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={iconBase64}
            width="150"
            height="142"
            alt=""
            style={{ marginRight: "20px" }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* PRO in dark blue, BOOK in teal */}
            <div style={{ display: "flex", alignItems: "baseline", lineHeight: 1 }}>
              <span
                style={{
                  fontSize: "72px",
                  fontWeight: 700,
                  color: "#1a3353",
                  letterSpacing: "4px",
                }}
              >
                PRO
              </span>
              <span
                style={{
                  fontSize: "72px",
                  fontWeight: 700,
                  color: "#30b8a2",
                  letterSpacing: "4px",
                }}
              >
                BOOK
              </span>
            </div>
            {/* Tagline */}
            <div
              style={{
                fontSize: "24px",
                fontWeight: 400,
                color: "#7cb8ae",
                letterSpacing: "2px",
                marginTop: "6px",
                paddingLeft: "4px",
              }}
            >
              Smart Business Management
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        {
          name: "Inter",
          data: interBold,
          weight: 700,
          style: "normal",
        },
        {
          name: "Inter",
          data: interRegular,
          weight: 400,
          style: "normal",
        },
      ],
    }
  );
}
