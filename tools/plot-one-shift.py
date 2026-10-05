"""Plot recorded game policies, without smoothing or inventing human measurements."""
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from fontTools.ttLib import TTFont
import numpy as np

folder = Path(sys.argv[1])
for weight in ["regular", "bold"]:
    font = TTFont(Path(__file__).resolve().parents[1] / "assets" / "fonts" / f"segoe_ui_{weight}.woff")
    font.flavor = None
    target = folder / f"segoe-ui-{weight}-plot.ttf"
    font.save(target)
    font_manager.fontManager.addfont(target)
plt.rcParams["font.family"] = "Segoe UI"
styles = ["casual", "average", "expert", "storage", "throughput", "services", "fulfillment", "crossdock", "mixed"]
colors = ["#9bc3ae", "#a9b9ce", "#dac69b", "#9bc3ae", "#a9b9ce", "#dac69b", "#cba6b4", "#b4c392", "#daa58b"]
plt.rcParams.update({"figure.facecolor":"#303931", "axes.facecolor":"#303931", "axes.edgecolor":"#a4a293", "text.color":"#ede0c0", "axes.labelcolor":"#b8b2a2", "xtick.color":"#b8b2a2", "ytick.color":"#b8b2a2", "font.size":10, "savefig.facecolor":"#303931"})
fig, axes = plt.subplots(3, 3, figsize=(14, 10), sharex=True, sharey=True)
for style, color, ax in zip(styles, colors, axes.flat):
    data = json.loads((folder / f"economy-{style}.json").read_text())
    curves = np.array([row["curve"] for row in data["results"]])
    days = np.arange(1, curves.shape[1] + 1)
    low, high = np.percentile(curves, [10, 90], axis=0)
    ax.fill_between(days, low, high, color=color, alpha=.16, linewidth=0)
    ax.plot(days, np.median(curves, axis=0), color=color, linewidth=1.7)
    ax.axhline(0, color="#b8b2a2", linewidth=.7, alpha=.6)
    ax.set_title(style.capitalize(), loc="left", fontweight="bold")
    ax.grid(axis="y", color="#5a675c", linewidth=.5, alpha=.5)
    ax.spines[["right", "top"]].set_visible(False)
    ax.set_xlim(1, 60)
    ax.set_xticks([1, 15, 30, 45, 60])
    if style in ["storage", "throughput", "services", "fulfillment", "crossdock", "mixed"]:
        one, single = plt.subplots(figsize=(8, 4))
        single.fill_between(days, low, high, color=color, alpha=.2, linewidth=0)
        single.plot(days, np.median(curves, axis=0), color=color, linewidth=2)
        single.axhline(0, color="#b8b2a2", linewidth=.7)
        single.set_title(style.capitalize()+": 200 seeded runs")
        single.set_xlabel("Shift"); single.set_ylabel("Daily operating profit, scaled game dollars")
        single.grid(axis="y", alpha=.2)
        one.tight_layout(); one.savefig(folder / f"profit-{style}.png", dpi=180); plt.close(one)
fig.suptitle("One Shift: nine policies over 60 shifts", fontsize=18, x=.07, ha="left")
fig.supxlabel("Shift", y=.075)
fig.supylabel("Daily operating profit, scaled game dollars")
fig.text(.07, .015, "Line: median of 200 seeded runs. Band: 10th to 90th percentile. Capital purchases are excluded from operating profit.\nAutomated policies use player commands. These results do not measure human play, fun or equal strategy strength.", color="#b8b2a2", fontsize=9)
fig.subplots_adjust(left=.075, right=.98, top=.92, bottom=.12, wspace=.15, hspace=.3)
fig.savefig(folder / "profit-curves.png", dpi=180)
fig.savefig(folder / "profit-curves.svg")
print(folder / "profit-curves.png")
