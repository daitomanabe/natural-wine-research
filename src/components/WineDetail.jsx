import { COLOR_MAP, FARMING_MAP, FLAG_MAP } from "../data/wines";
import { naturalness } from "../lib/naturalness";
import { RadarMini } from "./RadarMini";

export function WineDetail({ wine }) {
  if (!wine) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "rgba(255, 255, 255, 0.38)", fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: 11, letterSpacing: 2, textAlign: "center", gap: 8 }}>
        <div style={{ fontSize: 28, opacity: 0.3 }}>◉</div>
        <div>SELECT A WINE</div>
        <div style={{ fontSize: 9, opacity: 0.5 }}>CLICK ANY NODE</div>
      </div>
    );
  }

  const col = COLOR_MAP[wine.color]?.dot ?? "#aaa";
  const fm = FARMING_MAP[wine.farming];
  const score = naturalness(wine);
  const formatValue = (value, fallback = "UNKNOWN") => (
    value === null || value === undefined || value === "" ? fallback : value
  );
  const formatVintage = wine.vintage ?? "NV";

  return (
    <div style={{ fontFamily: "Menlo, Monaco, Consolas, monospace", fontSize: 11, color: "#fff", lineHeight: 1.7 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{FLAG_MAP[wine.country] ?? ""}</span>
        <div>
          <div style={{ color: col, fontSize: 13, letterSpacing: 1, lineHeight: 1.3, fontWeight: 600 }}>{wine.name}</div>
          <div style={{ color: "rgba(255, 255, 255, 0.56)", fontSize: 10, letterSpacing: 1 }}>{wine.producer}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ background: COLOR_MAP[wine.color]?.bg ?? "rgba(255,255,255,0.05)", color: col, border: `1px solid ${col}40`, padding: "1px 7px", fontSize: 9, letterSpacing: 1.5 }}>{COLOR_MAP[wine.color]?.label}</span>
        <span style={{ background: "rgba(0,0,0,0.2)", color: fm?.color ?? "#888", border: `1px solid ${fm?.color ?? "#888"}40`, padding: "1px 7px", fontSize: 9, letterSpacing: 1.5 }}>{fm?.label}</span>
        <span style={{ background: "rgba(0,0,0,0.2)", color: "rgba(255, 255, 255, 0.56)", padding: "1px 7px", fontSize: 9, letterSpacing: 1 }}>{formatVintage}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", marginBottom: 12, fontSize: 10 }}>
        {[
          ["REGION", wine.region],
          ["APPELLATION", wine.appellation],
          ["GRAPES", wine.grapes.join(", ")],
          ["SO₂ TOTAL", wine.so2 === 0 ? "ZERO" : Number.isFinite(wine.so2) ? `${wine.so2} mg/L` : "UNKNOWN"],
          ["PRICE", Number.isFinite(wine.price) ? `€${wine.price}` : "UNKNOWN"],
          ["SKIN CONTACT", Number.isFinite(wine.skinDays) ? `${wine.skinDays}d` : "UNKNOWN"],
          ["WHOLE CLUSTER", Number.isFinite(wine.wholeCluster) ? `${wine.wholeCluster}%` : "UNKNOWN"],
          ["ABV", Number.isFinite(wine.abv) ? `${wine.abv}%` : "UNKNOWN"],
          ["BOTTLE", Number.isFinite(wine.bottleMl) ? `${wine.bottleMl} mL` : formatValue(wine.bottleMl)],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ color: "rgba(255, 255, 255, 0.38)", fontSize: 8, letterSpacing: 1.5 }}>{k}</div>
            <div style={{ color: "rgba(255, 255, 255, 0.78)", fontSize: 10 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          ["YEAST", wine.indigenousYeast, "INDIGENOUS", wine.indigenousYeast === null ? "UNKNOWN" : "SELECTED"],
          ["SO₂ ADDED", wine.addedSo2 === null ? null : !wine.addedSo2, "NONE", wine.addedSo2 === null ? "UNKNOWN" : "ADDED"],
          ["FILTRATION", wine.filtration === "none", "NONE", wine.filtration ? wine.filtration.toUpperCase() : "UNKNOWN"],
        ].map(([k, good, trueLabel, falseLabel]) => (
          <div key={k} style={{ fontSize: 9, letterSpacing: 1 }}>
            <span style={{ color: "rgba(255, 255, 255, 0.38)" }}>{k} </span>
            <span style={{ color: good === null ? "rgba(255, 255, 255, 0.5)" : good ? "#fff" : "#c06030" }}>{good ? trueLabel : falseLabel}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        {score !== null ? <RadarMini wine={wine} /> : (
          <div style={{ width: 136, height: 136, border: "1px solid #333", display: "grid", placeItems: "center", color: "rgba(255, 255, 255, 0.56)", fontSize: 9, letterSpacing: 1.5, textAlign: "center", padding: 12 }}>
            INCOMPLETE
            <br />
            METRICS
          </div>
        )}
        <div>
          <div style={{ fontSize: 8, letterSpacing: 1.5, color: "rgba(255, 255, 255, 0.38)", marginBottom: 6 }}>NATURALNESS</div>
          <div style={{ fontSize: 28, color: col, lineHeight: 1 }}>{score === null ? "N/A" : score.toFixed(1)}</div>
          <div style={{ fontSize: 8, color: "rgba(255, 255, 255, 0.38)", letterSpacing: 1 }}>/ 10.0</div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #333", paddingTop: 8 }}>
        <div style={{ fontSize: 8, letterSpacing: 2, color: "rgba(255, 255, 255, 0.38)", marginBottom: 5 }}>FLAVOR PROFILE</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {wine.flavors.map((f) => (
            <span key={f} style={{ background: "#000", color: "rgba(255, 255, 255, 0.62)", border: "1px solid #333", padding: "2px 6px", fontSize: 9, letterSpacing: 0.5 }}>
              {f}
            </span>
          ))}
        </div>
      </div>

      {wine.aliases?.length ? (
        <div style={{ borderTop: "1px solid #333", paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: "rgba(255, 255, 255, 0.38)", marginBottom: 5 }}>LABEL HINTS</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {wine.aliases.map((alias) => (
              <span key={alias} style={{ background: "#000", color: "rgba(255, 255, 255, 0.62)", border: "1px solid #333", padding: "2px 6px", fontSize: 9, letterSpacing: 0.5 }}>
                {alias}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {wine.labels?.length ? (
        <div style={{ borderTop: "1px solid #333", paddingTop: 8, marginTop: 8 }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: "rgba(255, 255, 255, 0.38)", marginBottom: 8 }}>LABEL ASSETS</div>
          <div style={{ display: "grid", gap: 8 }}>
            {wine.labels.map((label) => (
              <div key={label.id} style={{ border: "1px solid #333", background: "#000", padding: 8 }}>
                {label.imagePath ? (
                  <img src={label.imagePath} alt={label.displayName || label.originalName || "Label"} loading="lazy" decoding="async" style={{ width: "100%", display: "block", marginBottom: 8, background: "#fff" }} />
                ) : null}
                <div style={{ color: "#fff", fontSize: 10 }}>{label.displayName || label.originalName || "Untitled label"}</div>
                {label.badgeText ? <div style={{ color: "#caa56a", fontSize: 9 }}>{label.badgeText}</div> : null}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                  {[...(label.dominantColors ?? []), ...(label.motifs ?? []), ...(label.extractedKeywords ?? []).slice(0, 6)].map((item) => (
                    <span key={`${label.id}-${item}`} style={{ background: "#000", color: "rgba(255, 255, 255, 0.62)", border: "1px solid #333", padding: "2px 6px", fontSize: 9, letterSpacing: 0.5 }}>
                      {item}
                    </span>
                  ))}
                </div>
                {label.typography ? <div style={{ color: "rgba(255, 255, 255, 0.62)", fontSize: 9, marginTop: 6 }}>Typography: {label.typography}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {wine.notes ? (
        <div style={{ borderTop: "1px solid #333", paddingTop: 8, marginTop: 8, color: "rgba(255, 255, 255, 0.62)", fontSize: 9 }}>
          {wine.notes}
        </div>
      ) : null}
    </div>
  );
}
