import { Activity, HeartPulse, ShieldCheck, Droplets } from "lucide-react";

export default function HeartVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`heart-visual-card ${compact ? "compact" : ""}`}>
      <div className="heart-glow" />
      <div className="heart-glow secondary" />

      <svg
        className="heart-svg"
        viewBox="0 0 320 300"
        aria-label="Anatomical heart illustration"
      >
        <defs>
          <linearGradient id="heartFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff6b6b" />
            <stop offset="35%" stopColor="#e63946" />
            <stop offset="70%" stopColor="#c1121f" />
            <stop offset="100%" stopColor="#9b0a14" />
          </linearGradient>
          <linearGradient id="heartShine" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
            <stop offset="40%" stopColor="#ffffff" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="vessel" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4cc9f0" />
            <stop offset="100%" stopColor="#4895ef" />
          </linearGradient>
          <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="innerShadow">
            <feOffset dx="0" dy="2" />
            <feGaussianBlur stdDeviation="3" result="offset-blur" />
            <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse" />
            <feFlood floodColor="#000" floodOpacity="0.25" result="color" />
            <feComposite operator="in" in="color" in2="inverse" result="shadow" />
            <feComposite operator="over" in="shadow" in2="SourceGraphic" />
          </filter>
        </defs>

        {/* Soft outer shadow path */}
        <path
          d="M160 268 C142 246 40 185 28 108 C18 45 88 12 130 55 C144 68 152 82 160 95 C168 82 176 68 190 55 C232 12 302 45 292 108 C280 185 178 246 160 268Z"
          fill="#e63946"
          opacity="0.18"
          transform="translate(4,6)"
        />

        {/* Main heart body */}
        <path
          className="heart-body"
          d="M160 268 C142 246 40 185 28 108 C18 45 88 12 130 55 C144 68 152 82 160 95 C168 82 176 68 190 55 C232 12 302 45 292 108 C280 185 178 246 160 268Z"
          fill="url(#heartFill)"
          filter="url(#softGlow)"
        />

        {/* Highlight / gloss */}
        <path
          d="M160 268 C142 246 40 185 28 108 C18 45 88 12 130 55 C144 68 152 82 160 95 C168 82 176 68 190 55 C232 12 302 45 292 108 C280 185 178 246 160 268Z"
          fill="url(#heartShine)"
        />

        {/* Left atrium hint */}
        <ellipse cx="95" cy="95" rx="28" ry="22" fill="#ff8a80" opacity="0.45" />
        {/* Right atrium hint */}
        <ellipse cx="225" cy="95" rx="28" ry="22" fill="#ff8a80" opacity="0.4" />

        {/* Ventricle crease */}
        <path
          d="M160 100 L160 240"
          stroke="#9b0a14"
          strokeWidth="3.5"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M160 115 C125 135 105 165 100 200"
          stroke="#9b0a14"
          strokeWidth="2.2"
          fill="none"
          opacity="0.4"
        />
        <path
          d="M160 115 C195 135 215 165 220 200"
          stroke="#9b0a14"
          strokeWidth="2.2"
          fill="none"
          opacity="0.4"
        />

        {/* Coronary vessel arcs */}
        <path
          d="M70 85 C110 55 130 78 160 105 C190 78 210 55 250 85"
          stroke="url(#vessel)"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
          opacity="0.85"
        />
        <path
          d="M85 120 C120 100 140 125 160 145"
          stroke="#4cc9f0"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M235 120 C200 100 180 125 160 145"
          stroke="#4895ef"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* Pulse node */}
        <circle cx="160" cy="155" r="11" fill="#fff" opacity="0.9" className="pulse-node" />
        <circle cx="160" cy="155" r="6" fill="#e63946" className="pulse-core" />

        {/* Small valve marks */}
        <circle cx="130" cy="130" r="4" fill="#ffcdd2" opacity="0.8" />
        <circle cx="190" cy="130" r="4" fill="#ffcdd2" opacity="0.8" />
      </svg>

      {!compact && (
        <>
          <div className="heart-label heart-label-left">
            <Droplets size={15} /> Circulation
          </div>
          <div className="heart-label heart-label-right">
            <HeartPulse size={15} /> Cardiac Health
          </div>
          <div className="heart-badge">
            <ShieldCheck size={14} /> Live risk analytics
          </div>
          <div className="heart-bpm">
            <Activity size={14} />
            <span className="bpm-value">72</span>
            <span className="bpm-unit">BPM</span>
          </div>
        </>
      )}
    </div>
  );
}
