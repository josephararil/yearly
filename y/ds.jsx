// ds.jsx — local Aperture DS primitives: Button, SegmentedControl, Input, Chip.
// Exposes window.ApertureDesignSystem_72a4cd matching the shape the app reads.
(function () {
  function Button({ variant = "primary", block, disabled, icon, onClick, children }) {
    const cls = [
      "ds-btn",
      variant === "primary" ? "ds-btn-primary" : "ds-btn-secondary",
      block ? "ds-btn-block" : "",
    ].filter(Boolean).join(" ");
    return (
      <button className={cls} disabled={!!disabled} onClick={onClick}>
        {icon && <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>}
        {children}
      </button>
    );
  }

  function SegmentedControl({ options, value, fill, onChange }) {
    return (
      <div className={"ds-seg" + (fill ? " ds-seg-fill" : "")}>
        {options.map((opt) => (
          <button
            key={opt}
            className={"ds-seg-item" + (opt === value ? " active" : "")}
            onClick={() => onChange(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  function Input({ icon, placeholder, value, ariaLabel, onChange }) {
    return (
      <div className="ds-input">
        {icon && (
          <span style={{ color: "var(--muted)", display: "flex", alignItems: "center", flexShrink: 0 }}>
            {icon}
          </span>
        )}
        <input
          className="ds-input-field"
          type="text"
          placeholder={placeholder}
          value={value}
          aria-label={ariaLabel}
          onChange={onChange}
        />
      </div>
    );
  }

  function Chip({ pressed, onClick, children }) {
    return (
      <button className={"ds-chip" + (pressed ? " pressed" : "")} onClick={onClick}>
        {children}
      </button>
    );
  }

  window.ApertureDesignSystem_72a4cd = { Button, SegmentedControl, Input, Chip };
})();
