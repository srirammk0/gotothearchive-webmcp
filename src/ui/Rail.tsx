import { NavLink } from "react-router";

const destinations = [
  { to: "/", label: "Archive", end: true },
  { to: "/workbench", label: "Workbench", end: false },
  { to: "/taste", label: "Taste", end: false },
];

export function Rail() {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1 pr-8">
      <p className="mb-4 font-serif text-[length:var(--text-item)] text-ink">GoToTheArchive</p>
      {destinations.map((d) => (
        <NavLink
          key={d.to}
          to={d.to}
          end={d.end}
          className={({ isActive }) =>
            `border-l-2 px-3 py-1.5 font-sans text-[length:var(--text-body)] transition-colors duration-[var(--duration-fast)] ${
              isActive ? "border-accent text-ink" : "border-transparent text-stone hover:text-ink"
            }`
          }
        >
          {d.label}
        </NavLink>
      ))}
    </nav>
  );
}
