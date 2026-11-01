#!/usr/bin/env python3
"""Cut the game's sound effects from real field recordings (BigSoundBank, CC0 / public domain).

Usage: python3 tools/make_sfx.py <folder with the downloaded .ogg files> public/sfx

Loops get an equal-power crossfade so they repeat without a click; one-shots are found by onset detection.
Everything is mono, high-passed, loudness-matched and encoded as Ogg Vorbis.
Sources (bigsoundbank.com, all "free and royalty-free", CC0):
  2147 excavator engine (Volvo EC55B), 2148 excavator use, 2149 excavator displacement (rubber tracks),
  0984 Manitou telescopic handler, 3129 pneumatic jackhammer on a mini excavator, 1022 fall of stones,
  1117 footsteps on gravel, 1625 reverse beeping.
"""
import os, subprocess, sys
import numpy as np

SR = 32000
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)


def load(name):
    # gentle high-pass removes rumble / DC below ~25 Hz
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(src, name), '-af', 'highpass=f=25', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x * x)) + 1e-12)


def norm(x, target_db):
    y = x * 10 ** ((target_db - rms_db(x)) / 20)
    peak = np.max(np.abs(y))
    return y / peak * 0.97 if peak > 0.97 else y


def loop(x, a, b, xf=0.5):
    s, e, n = int(a * SR), int(b * SR), int(xf * SR)
    seg = x[s:e + n].copy()
    body = seg[:e - s].copy()
    t = np.linspace(0, np.pi / 2, n)
    body[:n] = seg[:n] * np.sin(t) + seg[e - s:e - s + n] * np.cos(t)  # tail fades into the head
    return body


def save(name, x):
    tmp = os.path.join(out, name + '.f32')
    x.astype(np.float32).tofile(tmp)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', tmp, '-c:a', 'libvorbis', '-q:a', '4', os.path.join(out, name + '.ogg')], check=True)
    os.remove(tmp)
    print(f'{name}.ogg  {len(x) / SR:.2f}s  {os.path.getsize(os.path.join(out, name + ".ogg")) // 1024} KB')


def onsets(x, win=0.02, min_gap=0.25, count=10, length=0.5, pre=0.01):
    w = int(win * SR)
    env = np.sqrt(np.convolve(x * x, np.ones(w) / w, mode='same'))
    d = np.maximum(0, np.diff(env, prepend=env[0]))
    cand = np.argsort(d)[::-1]
    picked = []
    for i in cand:
        if len(picked) >= count * 3: break
        if all(abs(i - j) > min_gap * SR for j in picked): picked.append(i)
    picked = sorted(picked, key=lambda i: -env[min(len(env) - 1, i + int(0.03 * SR))])[:count]
    res = []
    for i in sorted(picked):
        s = max(0, i - int(pre * SR)); e = min(len(x), s + int(length * SR))
        c = x[s:e].copy()
        fade = int(0.08 * SR); c[-fade:] *= np.linspace(1, 0, fade); c[:int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
        res.append(c)
    return res


# ---- loops
save('engine_idle', norm(loop(load('2147.ogg'), 8.0, 20.0), -18))
save('engine_load', norm(loop(load('2148.ogg'), 12.5, 22.5), -18))
save('engine_heavy', norm(loop(load('0984.ogg'), 44.0, 54.0), -18))
save('tracks', norm(loop(load('2149.ogg'), 40.0, 54.0), -18))
jh = load('3129.ogg')
save('breaker', norm(loop(jh, 0.05, len(jh) / SR - 0.12, 0.08), -16))
# reverse beeper: autocorrelation finds the beep period, loop exactly 2 periods
rb = load('1625.ogg')
seg = rb[int(1 * SR):int(6 * SR)]
env = np.abs(seg); env = np.convolve(env, np.ones(200) / 200, mode='same')
ac = np.correlate(env - env.mean(), env - env.mean(), mode='full')[len(env) - 1:]
lag = int(0.4 * SR) + int(np.argmax(ac[int(0.4 * SR):int(2.0 * SR)]))
save('reverse_beep', norm(loop(rb, 1.0, 1.0 + 2 * lag / SR, 0.02), -18))

# ---- one-shots (concatenated banks + offsets in a JSON sidecar)
import json
banks = {}
for name, srcf, args, db in [
    ('stones', '1022.ogg', dict(count=10, length=0.7, min_gap=0.35), -16),
    ('steps', '1117.ogg', dict(count=10, length=0.32, min_gap=0.22), -20),
    ('clank', '2148.ogg', dict(count=6, length=1.1, min_gap=2.0), -16),
]:
    clips = [norm(c, db) for c in onsets(load(srcf), **args)]
    gap = np.zeros(int(0.05 * SR))
    data, offs, t = [], [], 0.0
    for c in clips:
        offs.append([round(t, 4), round(len(c) / SR, 4)]); data += [c, gap]; t += (len(c) + len(gap)) / SR
    save(name, np.concatenate(data))
    banks[name] = offs
with open(os.path.join(out, 'banks.json'), 'w') as f: json.dump(banks, f)
print('banks', {k: len(v) for k, v in banks.items()})
