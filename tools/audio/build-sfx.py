#!/usr/bin/env python3
"""Bake Sluice's original procedural sound bank. Requires Python + NumPy and
macOS afconvert (AAC one-shots). Loops stay PCM to preserve sample-exact seams.
Run from any directory: python3 tools/audio/build-sfx.py
No recordings, model service, prompts, downloads, or manual slicing required.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import wave
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SR = 24000
TAU = 2 * np.pi
MATERIALS = {
    # center, grit bandwidth, modal ratios, decay, body weight
    'dirt': (270, 1300, [1, 1.39, 2.1], .045, .16),
    'stone': (480, 2300, [1, 1.47, 2.19, 3.12], .065, .29),
    'ice': (1070, 3800, [1, 1.56, 2.33, 3.71], .16, .38),
    'crystal': (1174.66, 3200, [1, 1.5, 2, 2.75], .24, .48),
    'metal': (390, 2700, [1, 2.38, 3.93, 5.41], .14, .48),
    'obsidian': (320, 2800, [1, 1.63, 2.71, 4.19], .07, .35),
}


def times(dur):
    return np.arange(round(dur * SR)) / SR


def rms(x):
    return float(np.sqrt(np.mean(x * x)))


def texture(dur, rng, low=70, high=2200, slope=.35):
    """Circular filtered noise: no filter startup and no loop-edge discontinuity."""
    n = round(dur * SR)
    f = np.fft.rfftfreq(n, 1 / SR)
    color = (1 + (f / high) ** 6) ** -.5
    color *= 1 - (1 + (f / max(1, low)) ** 4) ** -1
    color *= np.maximum(f, 30) ** -slope
    z = np.fft.rfft(rng.normal(size=n)) * color
    z[0] = 0
    x = np.fft.irfft(z, n)
    return x / max(1e-9, rms(x))


def envelope(t, decay=.1, attack=.002):
    return (1 - np.exp(-t / attack)) * np.exp(-t / decay)


def modes(t, hz, ratios, decay, rng):
    x = np.zeros(len(t))
    for i, ratio in enumerate(ratios):
        freq = hz * ratio * rng.uniform(.98, 1.02)
        x += np.sin(TAU * freq * t) * envelope(t, decay / (1 + i * .5)) / (1 + i)
    return x


def sweep(t, start, end, decay, attack=.003):
    k = max(.008, decay * .45)
    phase = end * t + (start - end) * k * (1 - np.exp(-t / k))
    return np.sin(TAU * phase) * envelope(t, decay, attack)


def add_at(x, y, seconds):
    i = round(seconds * SR)
    n = min(len(y), len(x) - i)
    if n > 0:
        x[i:i+n] += y[:n]


def impact(material, rng, dur=.65, weight=1):
    hz, high, ratios, decay, modal = MATERIALS[material]
    t = times(dur)
    x = .6 * texture(dur, rng, 120, high) * envelope(t, decay * 1.15)
    x += modal * modes(t, hz * rng.uniform(.92, 1.08), ratios, decay, rng)
    x += .26 * texture(dur, rng, 600, 5200, 0) * envelope(t, .007, .0007)
    x += .25 * weight * sweep(t, 160, 85, .048)
    # Broken pieces arrive at irregular offsets, quieter and smaller each time.
    for i in range(5):
        off = rng.uniform(.04, .11) + i * .044
        tt = np.maximum(0, t - off)
        x += (t >= off) * .10 * np.exp(-i * .45) * texture(dur, rng, 500, high) * envelope(tt, .014)
    return x


def burst(rng, dur, high=1700, decay=.12, low=80):
    t = times(dur)
    return texture(dur, rng, low, high) * envelope(t, decay)


def bell(rng, notes, dur=.8, decay=.18):
    t = times(dur)
    x = np.zeros(len(t))
    for i, hz in enumerate(notes):
        off = i * .095
        tt = np.maximum(0, t - off)
        x += (t >= off) * modes(tt, hz, [1, 2.003, 3.97], decay, rng) * .32
    x += .06 * texture(dur, rng, 800, 3600) * envelope(t, .011)
    return x


def motor(key, rng, dur=4):
    t = times(dur)
    if key.startswith('drill-grind-'):
        mat = key.removeprefix('drill-grind-')
        hz, high, _, _, modal = MATERIALS[mat]
        base = {'dirt': 76, 'stone': 83, 'ice': 88, 'crystal': 92, 'metal': 69, 'obsidian': 63}[mat]
        x = .5 * texture(dur, rng, 100, min(high, 1600))
        # Rounded motor lobes with low-frequency grit modulation, never a square-wave buzz.
        pulse = (1 + .27 * np.sin(TAU * 19 * t) + .12 * np.sin(TAU * 31.25 * t))
        x *= pulse
        x += .22 * np.sin(TAU * base * t + .20 * np.sin(TAU * 2.25 * t))
        x += .08 * np.sin(TAU * base * 2 * t)
        if mat in ('ice', 'crystal', 'metal'):
            x += .08 * modal * np.sin(TAU * round(hz * 4) / 4 * t) * (1 + .4 * np.sin(TAU * 3 * t))
    elif key in ('rig-hum', 'rig-drive', 'jet-spin', 'jetpack-loop'):
        base = 48 if key == 'rig-hum' else 64
        x = .4 * texture(dur, rng, 50, 800)
        for h in range(1, 6):
            x += .5 / h**1.6 * np.sin(TAU * base * h * t + .18 * np.sin(TAU * 1.25 * t))
        if key == 'rig-drive':
            x += .18 * texture(dur, rng, 400, 1800) * (1 + np.sin(TAU * 14 * t))**2
    elif key in ('bomb-fuse', 'lava-sizzle'):
        x = .35 * texture(dur, rng, 600, 3900)
        for _ in range(44 if key == 'lava-sizzle' else 28):
            grain = burst(rng, .08, 3700, .008, 850)
            start = int(rng.integers(len(x)))
            np.add.at(x, (start + np.arange(len(grain))) % len(x), grain * rng.uniform(.08, .25))
    elif key == 'fuel-fill':
        x = texture(dur, rng, 140, 1050) * .4
        x += .12 * np.sin(TAU * 96 * t) * (1 + .4 * np.sin(TAU * 8 * t))
    elif key == 'fall-wind':
        x = texture(dur, rng, 60, 1400)
    else:
        raise ValueError(key)
    return x


def ambience(key, rng, dur=16):
    t = times(dur)
    name = key.removeprefix('amb-')
    high = {'surface-day': 1600, 'surface-night': 1000, 'rain': 4200, 'storm': 1800,
            'shallow': 800, 'mid': 450, 'deep': 280, 'magma': 1000, 'station': 480}[name]
    x = texture(dur, rng, 35, high, .5)
    # All modulation rates close on an integral number of cycles.
    x *= .75 + .17 * np.sin(TAU * t / dur * 3) + .08 * np.sin(TAU * t / dur * 7)
    if name in ('mid', 'deep', 'magma', 'station'):
        x += .20 * np.sin(TAU * 73.4375 * t) + .08 * np.sin(TAU * 110 * t)
    if name == 'station':
        x += .2 * np.sin(TAU * 146.875 * t) * (1 + .12 * np.sin(TAU * t * .5))
    if name == 'surface-night':
        insect = np.sin(TAU * 3100 * t) * np.maximum(0, np.sin(TAU * 2.5 * t)) ** 8
        x += .035 * insect
    if name == 'rain':
        x += .20 * texture(dur, rng, 1100, 5600, 0)
    if name == 'magma':
        for _ in range(20):
            tt = times(.32)
            grain = sweep(tt, rng.uniform(160, 280), 65, .045) * .14
            start = int(rng.integers(len(x)))
            np.add.at(x, (start + np.arange(len(grain))) % len(x), grain)
    return x


def one_shot(key, rng, variant):
    if key.startswith('drill-break-'):
        return impact(key.removeprefix('drill-break-'), rng), -20
    if key == 'bomb-throw':
        return impact('metal', rng, .28, .2) * .4 + burst(rng, .28, 1300, .045) * .2, -26
    if key == 'drill-bounce':
        return impact('metal', rng, .30, .5), -24
    if key == 'debris' or key.startswith('footstep-'):
        mat = 'metal' if key.endswith('metal') else 'dirt'
        return impact(mat, rng, .25, .2), -30
    if key in ('drill-spinup', 'jetpack-ignite', 'jetpack-cutoff', 'air-pulse', 'missile-launch', 'rover-deploy', 'teleport'):
        dur = {'drill-spinup': .32, 'jetpack-ignite': .32, 'jetpack-cutoff': .20,
               'air-pulse': .20, 'missile-launch': .55, 'rover-deploy': .8, 'teleport': 1.1}[key]
        t = times(dur)
        x = burst(rng, dur, 1500, dur / 5) * .35
        if key == 'drill-spinup':
            x += sweep(t, 80, 230, .09) * .3 + sweep(t, 150, 390, .07) * .1
        elif key == 'teleport':
            x = texture(dur, rng, 350, 2000) * np.sin(np.pi * t / dur)**3 * .25
            x += sweep(t, 170, 720, .22) * .2
            add_at(x, bell(rng, [587.33, 880], .5, .1), .55)
        elif key == 'rover-deploy':
            x += impact('metal', rng, dur, .4) * .28
            x += texture(dur, rng, 600, 2400) * np.sin(np.pi * t / dur)**3 * .2
        else:
            x += sweep(t, 145, 65, dur / 5) * .22
        return x, -24 if key != 'air-pulse' else -29
    if key.startswith('land-') or key in ('hull-hit', 'obstacle-hit', 'enemy-hit', 'stinger-hit', 'drone-down'):
        heavy = key in ('land-damage', 'obstacle-hit', 'drone-down')
        dur = .9 if heavy else .5
        t = times(dur)
        x = impact('metal', rng, dur) * .55 + impact('stone', rng, dur) * .4
        x += sweep(t, 90 if heavy else 145, 48 if heavy else 83, .13 if heavy else .07) * .45
        return x, -18 if heavy else (-29 if key == 'land-soft' else -22)
    if key in ('bomb-small', 'bomb-large', 'missile-hit', 'flak-burst', 'turret-fire', 'rover-pop', 'thunder'):
        big = key in ('bomb-large', 'thunder')
        small = key in ('turret-fire', 'rover-pop')
        dur = 2.4 if big else (.24 if small else 1.3)
        t = times(dur)
        x = burst(rng, dur, 1900, .2 if big else (.025 if small else .1)) * .55
        x += sweep(t, 95 if big else 160, 42 if big else 65, .23 if big else .085) * .75
        x += burst(rng, dur, 5000, .008, 800) * .22
        if not small:
            for off, g in ((.075, .4), (.19, .23), (.37, .1)):
                add_at(x, burst(rng, dur, 700, .3 if big else .13) * g, off)
                # The delay energy is controlled by a global envelope below.
            x *= np.exp(-t / (.75 if big else .3))
        if key == 'thunder':
            x = burst(rng, dur, 600, .5) * .6 + x * .4
        return x, -18 if big else (-28 if small else -20)
    if key in ('liquid-enter', 'liquid-exit'):
        dur = .8 if key == 'liquid-enter' else .65
        t = times(dur)
        x = burst(rng, dur, 3400, .13 if key == 'liquid-enter' else .07, 250) * .3
        for i in range(14):
            off = rng.uniform(.03, dur * .7)
            tt = np.maximum(0, t - off)
            freq = rng.uniform(450, 1300)
            x += (t >= off) * sweep(tt, freq, freq * 1.8, .014) * rng.uniform(.035, .10)
        return x, -24
    if key == 'jello-wobble':
        t = times(.6)
        phase = 105 * t + 35 * .09 * (1 - np.exp(-t / .09))
        x = np.sin(TAU * phase + 2.3 * np.sin(TAU * 7 * t) * np.exp(-t * 7)) * envelope(t, .10)
        x += burst(rng, .6, 800, .03, 200) * .3
        return x, -24
    if key in ('ore-pickup', 'sell-tick', 'ring-collect'):
        # Common tonic with different physical transients, not a tune per pickup.
        hz = 1174.66 if key == 'ore-pickup' else 880
        x = bell(rng, [hz], .24, .055)
        x += impact('metal', rng, .24, .1) * .16
        return x, -28 if key == 'ore-pickup' else -27
    if key in ('ui-open', 'ui-denied', 'cargo-full'):
        x = impact('metal', rng, .3, .5) * .4
        t = times(.3)
        x += sweep(t, 220 if key == 'ui-open' else 160, 130 if key == 'ui-open' else 110, .06) * .4
        return x, -26
    if key in ('ui-confirm', 'sell-total', 'depth-record', 'discovery', 'danger-sting', 'alert-fuel', 'alert-hull'):
        notes = {'ui-confirm': [880, 1174.66], 'sell-total': [587.33, 880, 1174.66],
                 'depth-record': [293.66, 440], 'discovery': [587.33, 880, 1174.66],
                 'danger-sting': [146.83, 155.56], 'alert-fuel': [440, 440], 'alert-hull': [293.66, 277.18]}[key]
        long = key in ('discovery', 'depth-record')
        return bell(rng, notes, 1.4 if long else .65, .3 if long else .12), -25
    if key == 'amb-bird':
        t = times(.85)
        x = np.zeros(len(t))
        for i in range(3):
            tt = np.maximum(0, t - i * .15)
            x += (t >= i * .15) * sweep(tt, 2000 + variant * 170, 3000 + variant * 130, .045, .006)
        return x, -22
    if key.startswith('amb-oneshot-'):
        name = key.removeprefix('amb-oneshot-')
        if name == 'drip':
            t = times(.8)
            x = sweep(t, 620, 1400, .03) + .2 * sweep(t, 930, 2100, .04)
            add_at(x, x[:len(x)//2].copy() * .13, .14)
        elif name in ('settle', 'pebble', 'metal-tick'):
            x = impact('metal' if name == 'metal-tick' else 'stone', rng, .8, .3)
        elif name in ('creak', 'groan'):
            t = times(1.8)
            x = texture(1.8, rng, 80, 450) * np.sin(np.pi * t / 1.8)**2 * .5
            x += sweep(t, 140, 83, .5, .13) * .4
        elif name == 'rockfall':
            x = burst(rng, 1.6, 700, .33)
        elif name == 'air-hiss':
            t = times(1.4)
            x = texture(1.4, rng, 350, 1900) * np.sin(np.pi * t / 1.4)**2
        else:
            raise ValueError(key)
        return x, -22
    raise ValueError('No sound design for ' + key)


def finish(x, level, loop):
    x = np.asarray(x, dtype=np.float64)
    x -= np.mean(x)
    x *= 10 ** (level / 20) / max(1e-9, rms(x))
    # Peak headroom, not hard clipping. Preserve attacks on sparse material hits.
    peak = float(np.max(np.abs(x)))
    if peak > .56:
        x *= .56 / peak
    if not loop:
        n = min(round(.003 * SR), len(x) // 4)
        x[:n] *= np.linspace(0, 1, n)
        n = min(round(.025 * SR), len(x) // 4)
        x[-n:] *= np.linspace(1, 0, n)
    return x


def write_wav(path, x):
    with wave.open(str(path), 'wb') as w:
        w.setparams((1, 2, SR, len(x), 'NONE', 'not compressed'))
        w.writeframes(np.round(x * 32767).astype('<i2').tobytes())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--preview', type=Path, help='also write a short dry audition WAV outside the repo')
    args = parser.parse_args()
    code = (ROOT / 'js/audio.js').read_text()
    block = code.split('var SFX_MANIFEST = {', 1)[1].split('\n  };', 1)[0]
    rows = re.findall(r"'([^']+)'\s*:\s*\{([^}]+)\}", block)
    out = ROOT / 'assets/sfx'
    out.mkdir(parents=True, exist_ok=True)
    report = []
    demo = []
    picks = ['drill-spinup', 'drill-grind-stone', 'drill-break-dirt', 'drill-break-stone',
             'drill-break-ice', 'drill-break-crystal', 'drill-break-metal', 'drill-break-obsidian',
             'ore-pickup', 'liquid-enter', 'jello-wobble', 'bomb-small', 'bomb-large',
             'ui-open', 'ui-confirm', 'sell-total', 'discovery']
    samples = {}
    with tempfile.TemporaryDirectory(prefix='sluice-sfx-') as scratch:
        for key, spec in rows:
            count = int(re.search(r'n:\s*(\d+)', spec)[1])
            loop = 'loop: true' in spec
            for variant in range(1, count + 1):
                seed = int.from_bytes(hashlib.sha256(f'sluice-sfx-v1:{key}:{variant}'.encode()).digest()[:8], 'little')
                rng = np.random.default_rng(seed)
                if loop:
                    if key.startswith('amb-'):
                        x, level = ambience(key, rng), -40
                    else:
                        x, level = motor(key, rng), -28
                        if key == 'rig-hum': level = -32
                        if key in ('bomb-fuse', 'lava-sizzle', 'fuel-fill'): level = -33
                else:
                    x, level = one_shot(key, rng, variant)
                x = finish(x, level, loop)
                stem = key + (f'_{variant}' if count > 1 else '')
                ext = '.wav' if loop else '.m4a'
                target = out / (stem + ext)
                wav = target if loop else Path(scratch) / (stem + '.wav')
                write_wav(wav, x)
                if not loop:
                    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', str(wav), str(target)], check=True, capture_output=True)
                report.append({'key': key, 'file': target.name, 'loop': loop, 'seconds': round(len(x)/SR, 3),
                               'peakDb': round(20*np.log10(max(abs(x))), 2), 'rmsDb': round(20*np.log10(rms(x)), 2),
                               'seamDelta': round(float(abs(x[-1] - x[0])), 6) if loop else None,
                               'bytes': target.stat().st_size})
                if variant == 1 and key in picks:
                    samples[key] = x[:SR*2] if loop else x
    for key in picks:
        demo.extend([samples[key], np.zeros(round(SR * .22))])
    if args.preview:
        write_wav(args.preview, np.concatenate(demo))
    (out / 'bank.json').write_text(json.dumps({'version': 1, 'sampleRate': SR, 'source': 'Original procedural synthesis, tools/audio/build-sfx.py', 'sounds': report}, indent=2) + '\n')
    print(f'Built {len(report)} sounds / {len(rows)} keys / {sum(r["bytes"] for r in report)/1e6:.2f} MB')


if __name__ == '__main__':
    main()
