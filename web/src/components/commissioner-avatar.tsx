"use client";

// Circular avatar for a commissioner. Client component so we can gracefully
// fall back to initials if the image path 404s (file renamed, not uploaded yet,
// etc.). Used on the commissioner grid and profile pages.

import { useState } from "react";

export function CommissionerAvatar({
  name,
  src,
  size = 64,
}: {
  name: string;
  src: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          border: "2px solid var(--border)",
          background: "var(--card)",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--peach-bg, #FFE8D6)",
        border: "2px solid var(--peach)",
        color: "var(--peach)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 900,
        fontSize: `${Math.round(size * 0.36)}px`,
        letterSpacing: "0.02em",
      }}
    >
      {initials}
    </div>
  );
}
