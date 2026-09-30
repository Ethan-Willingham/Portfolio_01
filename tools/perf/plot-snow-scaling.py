"""Plot raw GPU scaling reports. Requires NumPy and Matplotlib.

python3 tools/perf/plot-snow-scaling.py --grains /tmp/sweep/report.json \
  --town /tmp/town/report.json --trace /tmp/capture/trace.json --out /tmp/snow-report
Optional --before-grains, --before-town and --before-trace add baseline comparisons.
"""
import argparse
import csv
import json
import textwrap
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
    parser.add_argument('--before-grains', type=Path)
    parser.add_argument('--before-town', type=Path)
    parser.add_argument('--before-trace', type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--title', default='Sluice snow scaling')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    if (args.before_town or args.before_trace) and not args.before_grains:
        parser.error('--before-town and --before-trace require --before-grains')
    if args.before_town and not args.town:
        parser.error('--before-town requires --town')
    if args.before_trace and not args.trace:
        parser.error('--before-trace requires --trace')

    def engine(grain_path, town_path, trace_path):
        grain = json.loads(grain_path.read_text())
        town = json.loads(town_path.read_text()) if town_path else None
        trace = json.loads(trace_path.read_text()) if trace_path else None
        digest = grain['sourceSHA256']
        if town and town['sourceSHA256'] != digest:
            raise ValueError('Grain and town sweeps must use the same GPU engine within each run')
        if trace and trace['testHarness']['liquidSHA256'] != digest:
            raise ValueError('Native capture and sweeps must use the same GPU engine within each run')
        rows = summarize(grain)
        families = sorted(set(row['family'] for row in rows))
        result = {'sourceSHA256': digest, 'grainRows': rows,
                  'townRows': summarize(town) if town else [],
                  'fits': {family: {'linear': fit([r for r in rows if r['family'] == family], 1),
                                    'quadratic': fit([r for r in rows if r['family'] == family], 2)} for family in families},
                  'limitations': grain['limitations'], 'townLimitations': town.get('limitations') if town else None,
                  'provenance': {'grains': {'path': str(grain_path), 'sourceSHA256': digest,
                      'sourceCommit': grain.get('sourceCommit'), 'options': grain.get('options'), 'rounds': grain.get('rounds')},
                      'town': {key: town.get(key) for key in ['sourceSHA256', 'testedSourceSHA256', 'snapshotSourceSHA256',
                           'snapshotSourcePath', 'testedSourcePath', 'snapshotSHA256', 'explicitSnapshotSource',
                           'crossSourceReplay', 'options', 'rounds']} if town else None,
                      'trace': {'path': str(trace_path), 'testHarness': trace['testHarness']} if trace else None}}
        if town:
            result['provenance']['town'].update(path=str(town_path),
                snapshotOriginSHA256=town.get('snapshotSourceSHA256') or
                    (town.get('sourceGameMetadata') or {}).get('source', {}).get('liquidSHA256') or town['sourceSHA256'])
        seconds = [second for second in trace['seconds'] if second['durationMs'] >= 900] if trace else []
        if trace:
            if not seconds:
                raise ValueError('Native capture has no complete seconds')
            worst = min(seconds, key=lambda second: second['fps'])
            result['nativeCapture'] = {'frameCount': trace['frameCount'],
                'headless': trace['testHarness']['headless'], 'nativeCallbacks': trace['testHarness']['nativeCallbacks'],
                'minimumFPS': worst['fps'], 'snowAtMinimum': worst['state']['snowActive'],
                'lastFPS': seconds[-1]['fps'], 'lastSnow': seconds[-1]['state']['snowActive']}
        return grain, town, trace, seconds, result

    grains, town, trace, seconds, analysis = engine(args.grains, args.town, args.trace)
    before = engine(args.before_grains, args.before_town, args.before_trace) if args.before_grains else None
    if before:
        for label, baseline, candidate in [('grains', before[0], grains), ('town', before[1], town)]:
            if baseline and candidate:
                for key in ['warmup', 'samples']:
                    if key not in baseline.get('options', {}) or key not in candidate.get('options', {}):
                        raise ValueError(label + ' comparison needs recorded ' + key)
                if baseline['options'] != candidate['options'] or baseline.get('rounds') != candidate.get('rounds'):
                    raise ValueError(label + ' comparison requires identical warmup/sample options and rounds')
        if before[2]:
            keys = ['headless', 'nativeCallbacks', 'seed', 'inputPath', 'pointers', 'water', 'snowProfile']
            if any(key not in before[2]['testHarness'] or key not in trace['testHarness'] or
                   before[2]['testHarness'][key] != trace['testHarness'][key] for key in keys):
                raise ValueError('Native overlay requires matching recorded settings, input route and seed')
        analysis['before'] = before[4]
        analysis['pairedMeasurements'] = {}
        for sweep, key in [('grains', 'grainRows'), ('town', 'townRows')]:
            baseline_rows = {(row['family'], row['n']): row for row in before[4][key]}
            analysis['pairedMeasurements'][sweep] = [
                {'family': row['family'], 'n': row['n'], 'beforeMedianMs': baseline_rows[(row['family'], row['n'])]['medianMs'],
                 'afterMedianMs': row['medianMs'],
                 'medianSpeedup': baseline_rows[(row['family'], row['n'])]['medianMs'] / row['medianMs']}
                for row in analysis[key] if (row['family'], row['n']) in baseline_rows and row['medianMs'] > 0]
        analysis['comparisonLimitations'] = ('Paired sweeps use equal warmup/sample options. Native overlays use the same recorded settings, '
            'input route and seed, but evolving game state is not deterministic snapshot replay.')
    rows, town_rows, fits = analysis['grainRows'], analysis['townRows'], analysis['fits']
    families = sorted(set(row['family'] for row in rows + (before[4]['grainRows'] if before else [])))
    analysis.update(frameBudgetMs=1000 / 120, fourTickBudgetMs=1000 / 120 / 4)
    (args.out / 'analysis.json').write_text(json.dumps(analysis, indent=2))
    with (args.out / 'measurements.csv').open('w', newline='') as handle:
        writer = csv.writer(handle)
        header = ['family', 'grains', 'median_ms_per_tick', 'p95_ms_per_tick', 'maximum_ms_per_tick', 'maximum_cell_grains']
        if before:
            header += ['engine', 'source_sha256', 'snapshot_origin_sha256', 'sweep']
        writer.writerow(header)
        runs = [('candidate', analysis)] + ([('baseline', before[4])] if before else [])
        for label, data in runs:
            for sweep, values in [('grains', data['grainRows']), ('town', data['townRows'])]:
                for row in values:
                    record = [row['family'], row['n'], row['medianMs'], row['p95Ms'], row['maxMs'], row['grid']['maxGrains']]
                    if before:
                        origin = (data['provenance']['town'] or {}).get('snapshotOriginSHA256') if sweep == 'town' else None
                        record += [label, data['sourceSHA256'], origin, sweep]
                    writer.writerow(record)

    if trace:
        with (args.out / 'native-captures.csv').open('w', newline='') as handle:
            writer = csv.writer(handle)
            writer.writerow(['engine', 'source_sha256', 'time_seconds', 'duration_ms', 'fps', 'active_snow', 'seed'])
            captures = [('candidate', seconds, trace)] + ([('baseline', before[3], before[2])] if before and before[2] else [])
            for label, values, capture in captures:
                for second in values:
                    writer.writerow([label, capture['testHarness']['liquidSHA256'], second['atMs'] / 1000,
                                     second['durationMs'], second['fps'], second['state']['snowActive'],
                                     capture['testHarness'].get('seed')])

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
    colors = {family: 'C' + str(i % 10) for i, family in enumerate(families)}
    for label, data in runs:
        for family in families:
            values = [row for row in data['grainRows'] if row['family'] == family]
            if not values:
                continue
            x = [row['n'] / 1000 for row in values]
            y = [row['medianMs'] for row in values]
            name = names.get(family, family) + (' (' + label + ')' if before else '')
            axes[0].plot(x, y, marker='o', markersize=4, color=colors[family],
                         linestyle='--' if label == 'baseline' else '-', label=name)
            axes[0].fill_between(x, [row['p25Ms'] for row in values], [row['p75Ms'] for row in values],
                                 color=colors[family], alpha=.08 if label == 'baseline' else .15)
    axes[0].set(title='Grain solver: count versus crowding', xlabel='Active snow grains (thousands)', ylabel='GPU time per snow tick (ms)')
    axes[0].legend(fontsize=8, loc='upper left')
    axes[0].axhline(1000 / 120 / 4, linestyle=':', color='0.4', linewidth=1)
    index = 1
    if town:
        for label, data in runs:
            values = data['townRows']
            if not values:
                continue
            x = [row['n'] / 1000 for row in values]
            axes[index].plot(x, [row['medianMs'] for row in values], marker='o', color='C0',
                             linestyle='--' if label == 'baseline' else '-',
                             label='Whole snow tick' + (' (' + label + ')' if before else ' with town collisions'))
            axes[index].fill_between(x, [row['p25Ms'] for row in values], [row['p75Ms'] for row in values],
                                     color='C0', alpha=.08 if label == 'baseline' else .15)
        axes[index].axhline(1000 / 120 / 4, linestyle=':', color='0.4', linewidth=1)
        axes[index].set(title='Captured town, five natural residents', xlabel='Active snow grains (thousands)', ylabel='GPU time per snow tick (ms)')
        axes[index].legend(fontsize=8)
        index += 1
    if args.trace:
        right = axes[index].twinx()
        handles = []
        capture_runs = [('candidate', seconds)] + ([('baseline', before[3])] if before and before[2] else [])
        for label, values in capture_runs:
            x = [second['atMs'] / 1000 for second in values]
            style = '--' if label == 'baseline' else '-'
            suffix = ' (' + label + ')' if before and before[2] else ''
            fps_line, = axes[index].plot(x, [second['fps'] for second in values], label='FPS' + suffix, color='C0', linestyle=style)
            snow_line, = right.plot(x, [second['state']['snowActive'] / 1000 for second in values],
                                   color='C1', linestyle=style, label='Snow grains' + suffix)
            handles += [fps_line, snow_line]
        axes[index].set(title='Normal play: evolving state, same settings and seed' if before and before[2] else 'Normal play: slowdown and recovery',
                        xlabel='Time (seconds)', ylabel='FPS in native capture', ylim=(0, max(65, max(s['fps'] for _, values in capture_runs for s in values) * 1.05)))
        right.set_ylabel('Active snow grains (thousands)')
        axes[index].legend(handles=handles, loc='lower left', fontsize=8)
    for axis in axes:
        axis.grid(alpha=.2)
        if axis is not axes[-1] or not args.trace:
            axis.set_ylim(bottom=0)
    fig.suptitle(args.title, fontsize=15)
    footer = 'Sweeps measure warm GPU work. Shading: middle 50% of samples. Dotted line: 8.33 ms / four snow ticks, with no time left for other work.'
    if before:
        footer += '\nDashed: baseline. Solid: candidate. Paired sweeps use identical warmup/sample options.'
    if town:
        footer += '\nTown sweep holds captured terrain and five natural resident poses fixed; water records are retained, water physics is excluded.'
    if args.trace:
        footer += '\nNative capture uses ordinary snowfall and a roughly 60 Hz headless callback ceiling. Neither test establishes sustained 120 FPS.'
    if before and before[2]:
        footer += '\nNative overlays use the same settings, input route and seed; evolving game state is not deterministic replay.'
    footer = '\n'.join(textwrap.fill(line, width=int(fig.get_figwidth() * 15)) for line in footer.splitlines())
    footer_height = len(footer.splitlines()) * 11 / (fig.get_figheight() * 72) + .04
    fig.text(.02, .018, footer, fontsize=8)
    fig.tight_layout(rect=(0, footer_height, 1, .94), w_pad=2, h_pad=2)
    fig.savefig(args.out / 'snow-scaling.png', dpi=140)
    fig.savefig(args.out / 'snow-scaling.svg')
    plt.close(fig)
    print(json.dumps({'out': str(args.out), 'fits': fits, 'nativeCapture': analysis.get('nativeCapture')}, indent=2))


if __name__ == '__main__':
    main()
