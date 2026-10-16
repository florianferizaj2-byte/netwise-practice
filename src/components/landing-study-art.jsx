import { useId } from "react";

// Fixed local illustration: no network assets or generated executable content.
export function LandingStudyArt({ compact = false }) {
  const id = "landing-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg
      className={`landing-study-art${compact ? " is-compact" : ""}`}
      viewBox="0 0 400 360"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#81b7ff" />
          <stop offset="1" stopColor="#2454ed" />
        </linearGradient>
        <linearGradient id={`${id}-paper`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#dcecff" />
        </linearGradient>
        <linearGradient id={`${id}-mint`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#6ce0bf" />
          <stop offset="1" stopColor="#0f9978" />
        </linearGradient>
      </defs>
      <ellipse cx="207" cy="195" rx="177" ry="144" fill="#e4efff" />
      <ellipse
        cx="200"
        cy="312"
        rx="158"
        ry="22"
        fill="#bed5ff"
        opacity=".45"
      />
      <g className="landing-window" transform="rotate(-7 220 164)">
        <rect
          x="96"
          y="72"
          width="240"
          height="187"
          rx="13"
          fill="#bbd4ff"
          transform="translate(5 7)"
        />
        <rect
          x="96"
          y="72"
          width="240"
          height="187"
          rx="13"
          fill={`url(#${id}-paper)`}
          stroke="#99bfff"
          strokeWidth="3"
        />
        <path
          d="M109 72h214a13 13 0 0 1 13 13v17H96V85a13 13 0 0 1 13-13"
          fill={`url(#${id}-blue)`}
        />
        {[110, 121, 132].map((cx) => (
          <circle key={cx} cx={cx} cy="87" r="3" fill="white" />
        ))}
        <rect x="113" y="118" width="50" height="123" rx="5" fill="#e0ecff" />
        <rect x="120" y="126" width="35" height="24" rx="4" fill="#b0d0ff" />
        {[161, 178, 195, 212].map((y) => (
          <rect
            key={y}
            x="120"
            y={y}
            width="34"
            height="7"
            rx="3"
            fill="#c0d9fc"
          />
        ))}
        {[123, 143, 163, 183, 223].map((y, index) => (
          <rect
            key={y}
            x="179"
            y={y}
            width={index % 2 ? 105 : 130}
            height="9"
            rx="4"
            fill="#c5dcfc"
          />
        ))}
        <circle cx="285" cy="183" r="27" fill={`url(#${id}-blue)`} />
        <path d="m279 171 17 12-17 12z" fill="white" />
        <path d="m204 260-8 25h68l-12-25" fill="#b7d2ff" />
        <path d="M182 285h92l15 10H169z" fill="#d7e6ff" />
      </g>
      <g className="landing-books" transform="rotate(-9 89 280)">
        <path d="m36 262 74-15 48 22-77 17z" fill="#a9d0ff" />
        <path d="M36 262v19l45 23v-18z" fill="#4b88ee" />
        <path d="m81 286 77-17v18l-77 17" fill="#2a60cf" />
        <path d="m46 276 36 17 67-14v8l-67 15-36-18z" fill="white" />
        <path d="m36 235 74-15 48 22-77 17z" fill="#c8e5ff" />
        <path d="M36 235v18l45 23v-17z" fill="#72a9f7" />
        <path d="m81 259 77-17v18l-77 16" fill="#3873ea" />
      </g>
      <g className="landing-note" transform="rotate(10 313 285)">
        <rect
          x="278"
          y="245"
          width="66"
          height="82"
          rx="7"
          fill="#a8c9fa"
          transform="translate(4 4)"
        />
        <rect
          x="278"
          y="245"
          width="66"
          height="82"
          rx="7"
          fill={`url(#${id}-paper)`}
          stroke="#b6d3ff"
          strokeWidth="2"
        />
        {[259, 277, 295].map((y) => (
          <g key={y}>
            <rect x="287" y={y} width="9" height="9" rx="2" fill="#8db8fb" />
            <rect
              x="302"
              y={y + 1}
              width="31"
              height="6"
              rx="3"
              fill="#c0d7f7"
            />
          </g>
        ))}
      </g>
      {!compact && (
        <>
          <g
            className="landing-badge badge-chapter"
            transform="rotate(-7 163 45)"
          >
            <rect
              x="111"
              y="27"
              width="106"
              height="35"
              rx="7"
              fill={`url(#${id}-blue)`}
            />
            <text
              x="164"
              y="50"
              textAnchor="middle"
              fill="white"
              fontSize="14"
              fontWeight="600"
            >
              章节练习
            </text>
          </g>
          <g className="landing-badge badge-review">
            <rect
              x="19"
              y="164"
              width="91"
              height="34"
              rx="7"
              fill={`url(#${id}-mint)`}
            />
            <text
              x="65"
              y="186"
              textAnchor="middle"
              fill="white"
              fontSize="14"
              fontWeight="600"
            >
              错题复习
            </text>
          </g>
          <g className="landing-badge badge-ai">
            <rect
              x="277"
              y="222"
              width="104"
              height="34"
              rx="7"
              fill="#f4a05b"
            />
            <text
              x="329"
              y="244"
              textAnchor="middle"
              fill="#613209"
              fontSize="14"
              fontWeight="600"
            >
              AI 精讲 · VIP
            </text>
          </g>
        </>
      )}
      <path d="m355 91 4 9 9 4-9 4-4 9-4-9-9-4 9-4z" fill="#a5c8ff" />
      <circle cx="58" cy="112" r="5" fill="#b7d5ff" />
    </svg>
  );
}
