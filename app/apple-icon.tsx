import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 38,
        background: "#17182b",
        color: "#f1bd61",
        fontFamily: "Arial",
        fontSize: 106,
        fontWeight: 800,
        letterSpacing: -12,
      }}
    >
      LS
    </div>,
    size,
  );
}
