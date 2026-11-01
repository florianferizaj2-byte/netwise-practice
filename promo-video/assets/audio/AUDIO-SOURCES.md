# Audio sources

All music and sound effects in `public/audio/` and `public/sfx/` were procedurally synthesized by
`scripts/music.mjs` (dependency-free Node.js). They are original works: no third-party samples,
loops, presets or downloaded audio were used. Every sound is generated from oscillators
(PolyBLEP band-limited saw/square, sine, triangle, additive partials) and seeded pseudo-random
noise, then processed with in-script filters, envelopes, delay, reverb and dynamics. Output is
deterministic: re-running `node scripts/music.mjs` from `promo-video/` reproduces the same files.

Format: 48 kHz, 16-bit PCM, stereo WAV. Beds are peak-normalized to -1 dBFS; SFX to about -3 dBFS.

## Music beds (30 fps; beat grids are sample-exact)

| File | Tempo | Length | Structure / sync points |
|---|---|---|---|
| `public/audio/premium.wav` | 100 BPM (beat 0.6 s = 18 f, bar 2.4 s) | 12 bars = 28.8 s | Bars 1-2 pad, felt piano, sub swell. Bars 3-4 soft kick (beats 1, 3), rim offbeats, eighth pluck arp. Reverse riser through bar 4 peaking at 9.6 s. Bars 5-8 add bass and 16th shaker. Bars 9-10 fuller chords, filtered riser in 2nd half of bar 10. Impact + bell/shimmer at 24.0 s (logo), drums stop, resolving Dmaj9, fade 28.0-28.8 s. |
| `public/audio/cyberpunk.wav` | 900/7 BPM (beat 14 f = 0.4667 s, bar 1.8667 s) | 15 bars = 28.0 s | Bar 1 drone + glitches. Bar 2 4/4 kick, noise riser, filter sweep, silence on last 8th (3.5000-3.7333 s). Drop + impact at 3.7333 s. Bars 3-9 full groove (arp varies every 2 bars, fills on last beat of bars 6 and 9). Bars 10-11 breakdown, snare roll in bar 11. Impact + groove at 20.5333 s (bars 12-13). Biggest impact at 24.2667 s (logo), then tails, drone, final blip at 27.07 s; fade 25.6-28.0 s. |
| `public/audio/trendy.wav` | 120 BPM (beat 15 f = 0.5 s, bar 2 s) | 13 bars = 26.0 s | Stamp hit at 0.0 s, bouncy groove. Bars 2-3 stab accent on every beat. Stop on bar 3 beat 4 (5.5-6.0 s) with synth "hey". Drop + stamp at 6.0 s, lead hook bars 4-11, fills end of bars 7 and 11. Stamp at 22.0 s, final hit at 25.0 s ringing out to 26.0 s. |

## SFX (`public/sfx/`)

click, tap, whoosh, whoosh-fast, riser, impact-soft, impact-big, glitch, blip, type, scan, pop,
boing, stamp, error, correct, shimmer, swipe. All synthesized in the `SFX` section of
`scripts/music.mjs`; trimmed with short fade-in/out.
