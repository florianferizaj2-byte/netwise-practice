import { useId } from "react";
import "./membership-tier-art.css";

// Fixed local artwork. Tier names and account permissions are rendered separately.
export function MembershipTierArt({ plan }) {
  const id = "tier-art-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tier = ["vip", "svip", "ssvip"].includes(plan) ? plan : "vip";
  const colors = {
    vip: ["#93caff", "#2263eb", "#1642b6"],
    svip: ["#d5b8ff", "#9250ed", "#6630be"],
    ssvip: ["#ffe3a2", "#edab2f", "#bb7013"],
  }[tier];
  return (
    <span
      className={`membership-tier-art tier-art-${tier}`}
      data-tier-art={tier}
      aria-hidden="true"
    >
      <svg viewBox="0 0 96 96" fill="none">
        <defs>
          <linearGradient
            id={id}
            x1="24"
            y1="17"
            x2="73"
            y2="79"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={colors[0]} />
            <stop offset="1" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <ellipse
          cx="48"
          cy="83"
          rx="29"
          ry="5"
          fill={colors[1]}
          opacity=".12"
        />
        <g className="tier-art-core">
          {tier === "vip" ? (
            <>
              <path
                d="M48 12c10 7 22 10 31 11v25c0 17-14 30-31 39-17-9-31-22-31-39V23c9-1 21-4 31-11Z"
                fill={colors[2]}
              />
              <path
                d="M46 9c10 7 22 10 31 11v25c0 17-14 30-31 39-17-9-31-22-31-39V20c9-1 21-4 31-11Z"
                fill={`url(#${id})`}
                stroke="#b8dfff"
                strokeWidth="2"
              />
              <path
                d="M46 19c7 5 14 7 22 9v17c0 12-9 22-22 29-13-7-22-17-22-29V28c8-2 15-4 22-9Z"
                fill="#275fd5"
                opacity=".5"
              />
              <path
                d="m46 29 6 13 12 5-12 6-6 14-6-14-12-6 12-5 6-13Z"
                fill="#f4fbff"
              />
              <path
                d="M23 29v15c0 10 5 18 11 24"
                stroke="#d8edff"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity=".8"
              />
            </>
          ) : tier === "svip" ? (
            <>
              <path d="m13 36 17-20h36l17 20-35 49Z" fill={colors[2]} />
              <path
                d="m13 33 17-20h36l17 20-35 49Z"
                fill={`url(#${id})`}
                stroke="#eadcff"
                strokeWidth="1.5"
              />
              <path d="m13 33 35 49-13-49Z" fill="#a878ee" />
              <path d="m35 33 13 49 13-49Z" fill="#7a38d1" />
              <path d="m61 33-13 49 35-49Z" fill="#995de2" />
              <path d="m30 13 5 20 13-20 13 20 5-20Z" fill="#e5d3ff" />
              <path
                d="m13 33 22 0-5-20m5 20 13-20 13 20 5-20m-31 20h26l22 0"
                stroke="#f1e7ff"
                strokeWidth="1.2"
                opacity=".8"
              />
            </>
          ) : (
            <>
              <path
                d="m16 39 17 10 15-24 15 24 17-10-8 35H24Z"
                fill={colors[2]}
              />
              <path
                d="m14 34 19 12 15-25 15 25 19-12-9 34H23Z"
                fill={`url(#${id})`}
                stroke="#ffe5ae"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="m48 22 6 33-6 9-7-9Z" fill="#ffe5ab" opacity=".7" />
              <rect
                x="23"
                y="68"
                width="50"
                height="9"
                rx="4.5"
                fill={colors[2]}
              />
              <rect
                x="23"
                y="65"
                width="50"
                height="9"
                rx="4.5"
                fill={`url(#${id})`}
              />
              <path
                d="M28 69h40"
                stroke="#ffdf8e"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <circle cx="14" cy="31" r="5" fill="#efb547" />
              <circle cx="48" cy="17" r="6" fill="#f9ca61" />
              <circle cx="82" cy="31" r="5" fill="#efb547" />
            </>
          )}
        </g>
        <path
          className="tier-art-glint"
          d="m77 9 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z"
          fill={colors[0]}
        />
        <circle
          className="tier-art-glint tier-art-dot"
          cx="12"
          cy="67"
          r="2.5"
          fill={colors[1]}
        />
      </svg>
    </span>
  );
}
