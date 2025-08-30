import React from "react";

const steps = [
  "email-proof",
  "time-travel",
  "teleporter",
  "identity",
  "scoring",
  "loans",
];

function formatLabel(slug: string) {
  return slug
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

export default function Breadcrumb({ active }: { active: string }) {
  return (
    <nav className="text-sm mb-6 flex justify-center">
      <ol className="flex space-x-2 bg-gradient-to-r from-blue-900/30 to-cyan-900/30 px-4 py-2 rounded-full backdrop-blur-md border border-blue-500/20 shadow-inner">
        {steps.map((step, idx) => (
          <li key={step} className="flex items-center">
            <span
              className={`${
                active === step ? "text-blue-400 font-semibold" : "text-blue-300"
              }`}
            >
              {formatLabel(step)}
            </span>
            {idx < steps.length - 1 && (
              <span className="mx-2 text-blue-500">›</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}