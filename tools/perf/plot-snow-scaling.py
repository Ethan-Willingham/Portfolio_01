"""Plot raw GPU scaling reports. Requires NumPy and Matplotlib.

python3 tools/perf/plot-snow-scaling.py --grains /tmp/sweep/report.json \
  --town /tmp/town/report.json --trace /tmp/capture/trace.json --out /tmp/snow-report
"""
import argparse
import csv
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np


def summarize(report):
    grouped = {}
    for row in report['rows']:
        grouped.setdefault((row['family'], row['n']), []).append(row)
    result = []
    for (family, n), rows in sorted(grouped.items()):
        samples = [sample for row in rows for sample in row['samples']]
        values = np.array([sample['totalMs'] for sample in samples])
        labels = set().union(*(sample['passes'] for sample in samples))
        result.append({
            'family': family, 'n': n, 'medianMs': float(np.median(values)),
            'p25Ms': float(np.quantile(values, .25)), 'p75Ms': float(np.quantile(values, .75)),
            'p95Ms': float(np.quantile(values, .95)), 'maxMs': float(values.max()),
            'samples': len(samples), 'roundMediansMs': [row['medianMs'] for row in rows],
            'grid': rows[0]['grid'],
            'passesMedianMs': {label: float(np.median([sample['passes'].get(label, 0) for sample in samples])) for label in sorted(labels)},
        })
    return result


def fit(rows, degree):
    rows = [row for row in rows if row['n'] >= 4000]
    if len(rows) <= degree:
        return None
    x = np.array([row['n'] / 1000 for row in rows])
    y = np.array([row['medianMs'] for row in rows])
    design = np.column_stack([x ** power for power in range(degree + 1)])
    coefficients, *_ = np.linalg.lstsq(design, y, rcond=None)
    residual = y - design @ coefficients
    total = float(((y - y.mean()) ** 2).sum())
    return {'minimumGrains': 4000, 'coefficientsMsPerThousandGrains': coefficients.tolist(),
            'rSquared': 1 - float((residual ** 2).sum()) / total if total else None,
            'residualsMs': residual.tolist()}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--grains', required=True, type=Path)
    parser.add_argument('--town', type=Path)
    parser.add_argument('--trace', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--title', default='Sluice snow scaling')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    grains = json.loads(args.grains.read_text())
    rows = summarize(grains)
    town = json.loads(args.town.read_text()) if args.town else None
    if town and town['sourceSHA256'] != grains['sourceSHA256']:
        raise ValueError('Grain and town sweeps must use the same GPU engine')
    town_rows = summarize(town) if town else []
    families = sorted(set(row['family'] for row in rows))
    fits = {family: {'linear': fit([row for row in rows if row['family'] == family], 1),
                     'quadratic': fit([row for row in rows if row['family'] == family], 2)} for family in families}
    analysis = {'sourceSHA256': grains['sourceSHA256'], 'grainRows': rows, 'townRows': town_rows,
                'fits': fits, 'frameBudgetMs': 1000 / 120, 'fourTickBudgetMs': 1000 / 120 / 4,
                'limitations': grains['limitations'],
                'townLimitations': town.get('limitations') if town else None}
    if args.trace:
        trace = json.loads(args.trace.read_text())
        if trace['testHarness']['liquidSHA256'] != grains['sourceSHA256']:
            raise ValueError('Native capture and sweeps must use the same GPU engine')
        seconds = [second for second in trace['seconds'] if second['durationMs'] >= 900]
        worst = min(seconds, key=lambda second: second['fps'])
        analysis['nativeCapture'] = {
            'frameCount': trace['frameCount'], 'headless': trace['testHarness']['headless'],
            'nativeCallbacks': trace['testHarness']['nativeCallbacks'],
            'minimumFPS': worst['fps'], 'snowAtMinimum': worst['state']['snowActive'],
            'lastFPS': seconds[-1]['fps'], 'lastSnow': seconds[-1]['state']['snowActive'],
        }
    (args.out / 'analysis.json').write_text(json.dumps(analysis, indent=2))
    with (args.out / 'measurements.csv').open('w', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(['family', 'grains', 'median_ms_per_tick', 'p95_ms_per_tick', 'maximum_ms_per_tick', 'maximum_cell_grains'])
        for row in rows + town_rows:
            writer.writerow([row['family'], row['n'], row['medianMs'], row['p95Ms'], row['maxMs'], row['grid']['maxGrains']])

    plt.rcParams.update({'font.size': 10, 'axes.titlesize': 12})
    panels = 1 + bool(town) + bool(args.trace)
    if panels == 3:
        fig = plt.figure(figsize=(11.6, 8.5))
        grid = fig.add_gridspec(2, 2, height_ratios=(1, .8))
        axes = [fig.add_subplot(grid[0, 0]), fig.add_subplot(grid[0, 1]), fig.add_subplot(grid[1, :])]
    else:
        fig, matrix = plt.subplots(1, panels, figsize=(5.8 * panels, 4.9), squeeze=False)
        axes = list(matrix[0])
    names = {'constant-density': 'Normal spacing, growing area',
             'fixed-80px-square': 'Same 80 x 80 px area',
             'fixed-40px-square': 'Same 40 x 40 px area'}
    for family in families:
        values = [row for row in rows if row['family'] == family]
        x = [row['n'] / 1000 for row in values]
        y = [row['medianMs'] for row in values]
        line, = axes[0].plot(x, y, marker='o', markersize=4, label=names.get(family, family))
        axes[0].fill_between(x, [row['p25Ms'] for row in values], [row['p75Ms'] for row in values], color=line.get_color(), alpha=.15)
    axes[0].set(title='Grain solver: count versus crowding', xlabel='Active snow grains (thousands)', ylabel='GPU time per snow tick (ms)')
    axes[0].legend(fontsize=8, loc='upper left')
    axes[0].axhline(1000 / 120 / 4, linestyle=':', color='0.4', linewidth=1)
    index = 1
    if town:
        x = [row['n'] / 1000 for row in town_rows]
        axes[index].plot(x, [row['medianMs'] for row in town_rows], marker='o', label='Whole snow tick with town collisions')
        axes[index].fill_between(x, [row['p25Ms'] for row in town_rows], [row['p75Ms'] for row in town_rows], alpha=.15)
        axes[index].axhline(1000 / 120 / 4, linestyle=':', color='0.4', linewidth=1)
        axes[index].set(title='Captured town, five natural residents', xlabel='Active snow grains (thousands)', ylabel='GPU time per snow tick (ms)')
        axes[index].legend(fontsize=8)
        index += 1
    if args.trace:
        x = [second['atMs'] / 1000 for second in seconds]
        fps_line, = axes[index].plot(x, [second['fps'] for second in seconds], label='FPS', color='C0')
        axes[index].set(title='Normal play: slowdown and recovery', xlabel='Time (seconds)', ylabel='FPS in native headless capture', ylim=(0, 65))
        right = axes[index].twinx()
        snow_line, = right.plot(x, [second['state']['snowActive'] / 1000 for second in seconds], color='C1', linestyle='--', label='Snow grains')
        right.set_ylabel('Active snow grains (thousands)')
        axes[index].legend(handles=[fps_line, snow_line], loc='lower left', fontsize=8)
    for axis in axes:
        axis.grid(alpha=.2)
        if axis is not axes[-1] or not args.trace:
            axis.set_ylim(bottom=0)
    fig.suptitle(args.title, fontsize=15)
    footer = 'Sweeps measure warm GPU work. Shading: middle 50% of samples. Dotted line: 8.33 ms / four snow ticks, with no time left for other work.'
    if town:
        footer += '\nTown sweep holds captured terrain and five natural resident poses fixed; water records are retained, water physics is excluded.'
    if args.trace:
        footer += '\nNative capture uses ordinary snowfall and a roughly 60 Hz headless callback ceiling. Neither test establishes sustained 120 FPS.'
    fig.text(.02, .025, footer, fontsize=8)
    fig.tight_layout(rect=(0, .105, 1, .94), w_pad=2, h_pad=2)
    fig.savefig(args.out / 'snow-scaling.png', dpi=140)
    fig.savefig(args.out / 'snow-scaling.svg')
    plt.close(fig)
    print(json.dumps({'out': str(args.out), 'fits': fits, 'nativeCapture': analysis.get('nativeCapture')}, indent=2))


if __name__ == '__main__':
    main()
