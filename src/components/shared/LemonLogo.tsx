export function LemonLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Lemon body */}
      <ellipse
        cx="16"
        cy="17"
        rx="11"
        ry="9.5"
        fill="#FFF700"
        stroke="#222"
        strokeWidth="1.5"
        transform="rotate(-30 16 17)"
      />
      {/* Lemon tip left */}
      <path
        d="M6.5 11.5C5 10 4.5 8 5.5 7s3 0.5 4.5 2"
        stroke="#222"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="#FFF700"
      />
      {/* Leaf */}
      <path
        d="M22 7C23.5 5 26 4.5 27 5.5S26 8 24 9.5C22.5 10.5 21 10 21 10"
        stroke="#222"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="#4ade80"
      />
      {/* Leaf vein */}
      <path
        d="M23 6.5L22.5 9"
        stroke="#222"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      {/* Highlight */}
      <ellipse
        cx="13"
        cy="14"
        rx="3"
        ry="1.5"
        fill="white"
        opacity="0.4"
        transform="rotate(-30 13 14)"
      />
    </svg>
  );
}
