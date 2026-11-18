// ReelStudio component library. Reels import from '@rs'.
// Canvas 1080x1920. Safe zones: content in y 200..1180, captions ~1240..1440, keep y>1500 empty (Instagram UI).
import React, {createContext, useContext} from 'react';
import {AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing, delayRender, continueRender} from 'remotion';
import {loadFont} from '@remotion/fonts';

export {AbsoluteFill, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing};

export type Word = {text: string; start: number; end: number};
export type TScene = {id: string; from: number; duration: number; audio: string; voiceover: string; words: Word[]};
export type Timeline = {fps: number; width: number; height: number; total: number; scenes: TScene[]};
export type Brand = {
  name?: string; handle?: string; font?: string;
  colors: {bg1: string; bg2: string; accent: string; text: string; muted: string; card?: string};
  captions?: 'stroke' | 'pill' | 'clean';
  background?: 'gradient' | 'paper' | 'solid';
  mascot?: string;
  fontFiles?: {family: string; weight: string; src: string}[];
};
export function isLight(hex: string) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6;
}
const shadowFor = (b: Brand) => (isLight(b.colors.bg1) ? 'none' : '0 2px 4px rgba(0,0,0,.85), 0 6px 34px rgba(0,0,0,.75), 0 0 80px rgba(0,0,0,.5)');
export type ReelProps = {timeline: Timeline; brand: Brand; reel: any};

const Ctx = createContext<{brand: Brand; scene?: TScene; still?: boolean}>({brand: {colors: {bg1: '#000', bg2: '#111', accent: '#ff0', text: '#fff', muted: '#aaa'}}});
export const useBrand = () => useContext(Ctx).brand;
export const useScene = () => useContext(Ctx).scene!;
/** Current frame, or a large number on a Cover still so every animation is finished. */
export const useF = () => { const still = useContext(Ctx).still; const f = useCurrentFrame(); return still ? 9999 : f; };
export const SAFE = {top: 200, bottom: 1180, side: 80, captionY: 1250};

/** Pick a font size so `text` fits in `lines` lines of `width` px. */
export function fitFont(text: string, {width = 920, lines = 3, max = 120, min = 44, charW = 0.56} = {}) {
  const len = Math.max(1, text.length);
  for (let fs = max; fs >= min; fs -= 2) {
    const perLine = Math.floor(width / (fs * charW));
    const words = text.split(/\s+/);
    let l = 1, cur = 0;
    for (const w of words) {
      if (cur && cur + 1 + w.length > perLine) { l++; cur = w.length; } else cur += (cur ? 1 : 0) + w.length;
      if (w.length > perLine) l += Math.ceil(w.length / perLine) - 1;
    }
    if (l <= lines) return fs;
  }
  return min;
}

/** Spring 0→1 starting at `delay` frames. */
export function usePop(delay = 0, damping = 14) {
  const f = useF();
  const {fps} = useVideoConfig();
  return spring({frame: f - delay, fps, config: {damping, mass: 0.8}});
}

/** Rich text: wrap words in *stars* to color them with the accent. */
export const Rich: React.FC<{text: string; accent?: string}> = ({text, accent}) => {
  const b = useBrand();
  const parts = text.split(/(\*[^*]+\*)/g);
  return <>{parts.map((p, i) => p.startsWith('*') ? <span key={i} style={{color: accent || b.colors.accent}}>{p.slice(1, -1)}</span> : <span key={i}>{p}</span>)}</>;
};
const plain = (t: string) => t.replace(/\*/g, '');

// ---------- frame ----------
export const GradientBG: React.FC<{a?: string; b?: string}> = ({a, b}) => {
  const br = useBrand();
  const f = useF();
  const ang = 160 + Math.sin(f / 90) * 20;
  const x = 50 + Math.sin(f / 70) * 25, y = 30 + Math.cos(f / 85) * 15;
  return (
    <AbsoluteFill style={{background: `linear-gradient(${ang}deg, ${a || br.colors.bg1}, ${b || br.colors.bg2})`}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${x}% ${y}%, ${br.colors.accent}33 0%, transparent 45%)`}} />
      <AbsoluteFill style={{opacity: 0.07, backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '36px 36px'}} />
    </AbsoluteFill>
  );
};

/** Warm paper: flat brand color, soft vignette, fine grain, faint ruled lines. */
export const PaperBG: React.FC = () => {
  const b = useBrand();
  const f = useF();
  return (
    <AbsoluteFill style={{background: b.colors.bg1}}>
      <AbsoluteFill style={{background: `radial-gradient(circle at ${50 + Math.sin(f / 80) * 10}% 35%, ${b.colors.bg2} 0%, transparent 70%)`}} />
      <AbsoluteFill style={{opacity: 0.35, backgroundImage: `repeating-linear-gradient(0deg, transparent 0 63px, ${b.colors.muted}22 63px 64px)`}} />
      <AbsoluteFill style={{opacity: 0.18, backgroundImage: 'radial-gradient(rgba(0,0,0,.35) 0.6px, transparent 0.8px)', backgroundSize: '5px 5px'}} />
    </AbsoluteFill>
  );
};

/** Background chosen by the look: paper | gradient | solid. */
export const BrandBG: React.FC = () => {
  const b = useBrand();
  if (b.background === 'paper') return <PaperBG />;
  if (b.background === 'solid') return <AbsoluteFill style={{background: b.colors.bg1}} />;
  return <GradientBG />;
};

/** The look's mascot. pos: 'corner' (small, bottom-right of content), 'center' (hero), 'peek' (from the right edge). */
export const Mascot: React.FC<{src?: string; pos?: 'corner' | 'center' | 'peek'; size?: number; delay?: number}> = ({src, pos = 'corner', size, delay = 4}) => {
  const b = useBrand();
  const f = useF();
  const p = usePop(delay, 11);
  const img = src || b.mascot;
  if (!img) return null;
  const bob = Math.sin(f / 14) * 8;
  const sz = size || (pos === 'center' ? 620 : pos === 'peek' ? 420 : 300);
  const style: React.CSSProperties =
    pos === 'center' ? {left: (1080 - sz) / 2, top: 360} :
    pos === 'peek' ? {left: 1080 - sz * 0.72 + (1 - p) * sz, top: SAFE.bottom - sz - 10} :
    {left: 1080 - 60 - sz, top: SAFE.bottom - sz + 40};
  return (
    <AbsoluteFill style={{...style, right: 'auto', bottom: 'auto', width: sz, height: sz, transform: `translateY(${bob + (1 - p) * 80}px) rotate(${Math.sin(f / 20) * 2}deg)`, opacity: p}}>
      <Img src={staticFile(img)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
    </AbsoluteFill>
  );
};

/** Full-bleed image with slow Ken Burns zoom and a dark gradient for legibility. */
export const ImageBG: React.FC<{src: string; dim?: number; zoom?: [number, number]; pan?: number}> = ({src, dim = 0.45, zoom = [1.05, 1.18], pan = 30}) => {
  const f = useF();
  const s = useScene();
  const d = s?.duration || 150;
  const z = interpolate(f, [0, d], zoom, {extrapolateRight: 'clamp'});
  const x = interpolate(f, [0, d], [0, -pan], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill>
      <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z}) translateX(${x}px)`}} />
      <AbsoluteFill style={{background: `linear-gradient(180deg, rgba(0,0,0,${dim * 0.6}) 0%, rgba(0,0,0,${dim * 0.3}) 40%, rgba(0,0,0,${dim + 0.25}) 100%)`}} />
    </AbsoluteFill>
  );
};

/** Content box inside the safe zone. align: 'center' | 'top'. */
export const Stage: React.FC<{children: React.ReactNode; align?: 'center' | 'top'; gap?: number}> = ({children, align = 'center', gap = 36}) => (
  <AbsoluteFill style={{top: SAFE.top, height: SAFE.bottom - SAFE.top, left: SAFE.side, right: SAFE.side, width: 'auto', display: 'flex', flexDirection: 'column', justifyContent: align === 'center' ? 'center' : 'flex-start', gap}}>
    {children}
  </AbsoluteFill>
);

// ---------- scene building blocks ----------
export const Kicker: React.FC<{text: string; delay?: number}> = ({text, delay = 0}) => {
  const b = useBrand();
  const p = usePop(delay);
  return (
    <div style={{alignSelf: 'flex-start', padding: '12px 26px', borderRadius: 999, background: b.colors.accent, color: isLight(b.colors.accent) ? b.colors.bg1 : '#fff', fontWeight: 800, fontSize: 38, letterSpacing: 2, textTransform: 'uppercase', transform: `scale(${p})`, transformOrigin: 'left center'}}>
      {text}
    </div>
  );
};

/** Big headline, words fly in one by one. Use *word* for accent. */
export const Title: React.FC<{text: string; kicker?: string; size?: number; lines?: number; delay?: number; align?: 'left' | 'center'}> = ({text, kicker, size, lines = 4, delay = 0, align = 'left'}) => {
  const b = useBrand();
  const f = useF();
  const {fps} = useVideoConfig();
  const fs = size || fitFont(plain(text), {lines, max: 132, min: 56});
  const tokens = text.split(/(\s+)/);
  let inStar = false, wi = 0;
  return (
    <Stage>
      {kicker ? <Kicker text={kicker} delay={delay} /> : null}
      <div style={{fontSize: fs, lineHeight: 1.05, fontWeight: 900, color: b.colors.text, letterSpacing: -1.5, textAlign: align, textShadow: shadowFor(b)}}>
        {tokens.map((t, i) => {
          if (/^\s+$/.test(t)) return <span key={i}> </span>;
          const startStar = t.startsWith('*');
          if (startStar) inStar = true;
          const accent = inStar;
          if (t.endsWith('*')) inStar = false;
          const p = spring({frame: f - delay - 4 - wi++ * 3, fps, config: {damping: 13}});
          return <span key={i} style={{display: 'inline-block', color: accent ? b.colors.accent : undefined, opacity: p, transform: `translateY(${(1 - p) * 40}px)`}}>{t.replace(/\*/g, '')}</span>;
        })}
      </div>
    </Stage>
  );
};

/** List that reveals items spread across the scene (or at given frames). */
export const Bullets: React.FC<{title?: string; items: string[]; at?: number[]; numbered?: boolean}> = ({title, items, at, numbered}) => {
  const b = useBrand();
  const f = useF();
  const {fps} = useVideoConfig();
  const s = useScene();
  const d = s?.duration || 150;
  const times = at || items.map((_, i) => Math.round(8 + (i * (d * 0.75)) / items.length));
  const longest = items.reduce((a, x) => (x.length > a.length ? x : a), '');
  const fs = Math.min(64, fitFont(plain(longest), {width: 800, lines: 2, max: 64, min: 40}));
  return (
    <Stage gap={30}>
      {title ? <div style={{fontSize: fitFont(plain(title), {lines: 2, max: 84, min: 50}), fontWeight: 900, color: b.colors.text, marginBottom: 12}}><Rich text={title} /></div> : null}
      {items.map((it, i) => {
        const p = spring({frame: f - times[i], fps, config: {damping: 14}});
        const active = f >= times[i] && (i === items.length - 1 || f < times[i + 1]);
        return (
          <div key={i} style={{display: 'flex', alignItems: 'center', gap: 28, opacity: p * (active ? 1 : 0.55) + (1 - p) * 0, transform: `translateX(${(1 - p) * -80}px)`}}>
            <div style={{flex: '0 0 auto', width: 78, height: 78, borderRadius: 22, background: active ? b.colors.accent : (isLight(b.colors.bg1) ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.12)'), color: active ? (isLight(b.colors.accent) ? b.colors.bg1 : '#fff') : b.colors.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, fontWeight: 900}}>
              {numbered ? i + 1 : '✓'}
            </div>
            <div style={{fontSize: fs, fontWeight: 750, color: b.colors.text, lineHeight: 1.12}}><Rich text={it} /></div>
          </div>
        );
      })}
    </Stage>
  );
};

/** Animated count-up number with a label. */
export const BigStat: React.FC<{value: number; prefix?: string; suffix?: string; label: string; decimals?: number; kicker?: string}> = ({value, prefix = '', suffix = '', label, decimals = 0, kicker}) => {
  const b = useBrand();
  const f = useF();
  const v = interpolate(f, [6, 45], [0, value], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const txt = prefix + v.toLocaleString('it-IT', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}) + suffix;
  const p = usePop(40);
  const fsNum = fitFont(prefix + value.toLocaleString('it-IT') + suffix + '00', {lines: 1, max: 300, min: 120, charW: 0.62});
  return (
    <Stage gap={20}>
      {kicker ? <Kicker text={kicker} /> : null}
      <div style={{fontSize: fsNum, fontWeight: 900, color: b.colors.accent, letterSpacing: -6, lineHeight: 1, fontVariantNumeric: 'tabular-nums'}}>{txt}</div>
      <div style={{fontSize: fitFont(plain(label), {lines: 3, max: 72, min: 44}), fontWeight: 750, color: b.colors.text, opacity: p, transform: `translateY(${(1 - p) * 30}px)`}}><Rich text={label} /></div>
    </Stage>
  );
};

export const Quote: React.FC<{text: string; author?: string}> = ({text, author}) => {
  const b = useBrand();
  const p = usePop(4), q = usePop(22);
  return (
    <Stage>
      <div style={{fontSize: 260, lineHeight: 0.6, color: b.colors.accent, fontWeight: 900, height: 120, opacity: p}}>“</div>
      <div style={{fontSize: fitFont(plain(text), {lines: 6, max: 86, min: 48}), fontWeight: 800, color: b.colors.text, lineHeight: 1.15, fontStyle: 'italic', opacity: p, transform: `scale(${0.92 + p * 0.08})`, transformOrigin: 'left'}}><Rich text={text} /></div>
      {author ? <div style={{fontSize: 44, color: b.colors.muted, fontWeight: 700, opacity: q}}>— {author}</div> : null}
    </Stage>
  );
};

/** Two columns, e.g. myth vs fact, before vs after. */
export const Compare: React.FC<{left: {title: string; items: string[]}; right: {title: string; items: string[]}; vs?: string}> = ({left, right, vs = 'VS'}) => {
  const b = useBrand();
  const pl = usePop(4), pr = usePop(30), pv = usePop(18);
  const col = (c: {title: string; items: string[]}, p: number, good: boolean) => (
    <div style={{flex: 1, borderRadius: 36, padding: 36, background: good ? b.colors.accent : (b.colors.card || 'rgba(255,255,255,.1)'), color: good ? (isLight(b.colors.accent) ? b.colors.bg1 : '#fff') : b.colors.text, opacity: p, transform: `translateY(${(1 - p) * 60}px)`, display: 'flex', flexDirection: 'column', gap: 22}}>
      <div style={{fontSize: 52, fontWeight: 900}}>{c.title}</div>
      {c.items.map((x, i) => <div key={i} style={{fontSize: fitFont(x, {width: 330, lines: 3, max: 40, min: 28}), fontWeight: 700, lineHeight: 1.15}}>{x}</div>)}
    </div>
  );
  return (
    <Stage>
      <div style={{display: 'flex', gap: 28, alignItems: 'stretch', position: 'relative'}}>
        {col(left, pl, false)}
        {col(right, pr, true)}
        <div style={{position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${pv})`, width: 120, height: 120, borderRadius: 999, background: b.colors.bg1, color: b.colors.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 40, border: `6px solid ${b.colors.text}`}}>{vs}</div>
      </div>
    </Stage>
  );
};

/** Big emoji / symbol with a line of text. */
export const Icon: React.FC<{char: string; text?: string}> = ({char, text}) => {
  const b = useBrand();
  const f = useF();
  const p = usePop(2, 8);
  return (
    <Stage>
      <div style={{fontSize: 340, textAlign: 'center', transform: `scale(${p}) rotate(${Math.sin(f / 12) * 4}deg)`}}>{char}</div>
      {text ? <div style={{fontSize: fitFont(plain(text), {lines: 3, max: 90, min: 50}), fontWeight: 900, color: b.colors.text, textAlign: 'center'}}><Rich text={text} /></div> : null}
    </Stage>
  );
};

/** Image card (not full-bleed). */
export const Card: React.FC<{src: string; caption?: string; height?: number}> = ({src, caption, height = 720}) => {
  const b = useBrand();
  const p = usePop(2);
  const f = useF();
  return (
    <Stage>
      <div style={{height, borderRadius: 44, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,.5)', transform: `scale(${0.85 + p * 0.15})`, opacity: p}}>
        <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.05 + f / 3000})`}} />
      </div>
      {caption ? <div style={{fontSize: fitFont(plain(caption), {lines: 2, max: 64, min: 40}), fontWeight: 800, color: b.colors.text}}><Rich text={caption} /></div> : null}
    </Stage>
  );
};

export const CTA: React.FC<{text: string; sub?: string}> = ({text, sub}) => {
  const b = useBrand();
  const p = usePop(4);
  const f = useF();
  return (
    <Stage>
      <div style={{fontSize: fitFont(plain(text), {lines: 3, max: 110, min: 60}), fontWeight: 900, color: b.colors.text, textAlign: 'center', opacity: p}}><Rich text={text} /></div>
      <div style={{alignSelf: 'center', padding: '26px 54px', borderRadius: 999, background: b.colors.accent, color: isLight(b.colors.accent) ? b.colors.bg1 : '#fff', fontSize: 54, fontWeight: 900, transform: `scale(${p * (1 + Math.sin(f / 6) * 0.03)})`}}>{sub || b.handle}</div>
    </Stage>
  );
};

// ---------- overlays ----------
/** Karaoke captions from word timings; 3-word chunks, current word in accent. */
export const Captions: React.FC<{y?: number; size?: number; chunk?: number}> = ({y = SAFE.captionY, size = 74, chunk = 3}) => {
  const b = useBrand();
  const s = useScene();
  const f = useF();
  if (!s?.words?.length) return null;
  const groups: Word[][] = [];
  let g: Word[] = [];
  s.words.forEach((w, i) => {
    g.push(w);
    const brk = /[.,!?;:]$/.test(w.text) || g.length >= chunk || i === s.words.length - 1;
    if (brk) {
      const prev = groups[groups.length - 1];
      if (g.length === 1 && prev && prev.length < 4 && !/[.!?]$/.test(prev[prev.length - 1].text)) prev.push(...g);
      else groups.push(g);
      g = [];
    }
  });
  const gi = groups.findIndex((gr, i) => f >= gr[0].start && (i === groups.length - 1 || f < groups[i + 1][0].start));
  if (gi < 0) return null;
  const gr = groups[gi];
  const p = spring({frame: f - gr[0].start, fps: 30, config: {damping: 12, mass: 0.5}});
  const len = gr.map((w) => w.text).join(' ').length;
  const fs = len > 22 ? Math.round(size * 22 / len) + 8 : size;
  const mode = b.captions || 'stroke';
  const light = isLight(b.colors.bg1);
  const box: React.CSSProperties =
    mode === 'pill' ? {background: b.colors.card || (light ? '#fff' : 'rgba(0,0,0,.6)'), padding: '18px 34px', borderRadius: 34, boxShadow: '0 24px 50px -22px rgba(0,0,0,.35)', textTransform: 'none', fontWeight: 700}
    : mode === 'clean' ? {textTransform: 'none', fontWeight: 800, textShadow: light ? 'none' : '0 3px 18px rgba(0,0,0,.8)'}
    : {textTransform: 'uppercase', fontWeight: 900, WebkitTextStroke: '10px rgba(0,0,0,.9)', paintOrder: 'stroke fill'};
  return (
    <AbsoluteFill style={{top: y, height: 220, left: 60, right: 60, width: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <div style={{fontSize: mode === 'stroke' ? fs : Math.round(fs * 0.92), textAlign: 'center', lineHeight: 1.12, transform: `scale(${0.85 + p * 0.15})`, letterSpacing: -0.5, ...box} as React.CSSProperties}>
        {gr.map((w, i) => {
          const on = f >= w.start && f < (gr[i + 1]?.start ?? w.end + 6);
          return <span key={i} style={{color: on ? b.colors.accent : b.colors.text}}>{w.text}{i < gr.length - 1 ? ' ' : ''}</span>;
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Progress: React.FC<{total: number}> = ({total}) => {
  const b = useBrand();
  const f = useF();
  return (
    <AbsoluteFill style={{top: 0, height: 10}}>
      <div style={{height: 10, width: `${(f / total) * 100}%`, background: b.colors.accent}} />
    </AbsoluteFill>
  );
};

export const Handle: React.FC = () => {
  const b = useBrand();
  if (!b.handle) return null;
  return <AbsoluteFill style={{top: 80, left: SAFE.side, height: 60, fontSize: 34, fontWeight: 700, color: b.colors.muted, opacity: 0.9}}>{b.handle}</AbsoluteFill>;
};

// ---------- the reel ----------
type SceneMap = Record<string, React.ReactNode | (() => React.ReactNode)>;

/**
 * Lays out every scene from the timeline with its voice track.
 * scenes:      id -> visual for that scene
 * backgrounds: id -> background (defaults to the brand gradient)
 */
export const Reel: React.FC<ReelProps & {scenes: SceneMap; backgrounds?: SceneMap; captions?: boolean; progress?: boolean; handle?: boolean; transition?: number}> = ({
  timeline, brand, scenes, backgrounds = {}, captions = true, progress = true, handle = true, transition = 8,
}) => {
  const b: Brand = {...brand, colors: {...brand.colors}};
  useFonts(b);
  return (
    <Ctx.Provider value={{brand: b}}>
      <AbsoluteFill style={{fontFamily: b.font || 'Inter, -apple-system, sans-serif', background: b.colors.bg1, overflow: 'hidden'}}>
        {timeline.scenes.map((s) => {
          const v = scenes[s.id];
          const bg = backgrounds[s.id];
          return (
            <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.id}>
              <Ctx.Provider value={{brand: b, scene: s}}>
                <SceneFade duration={s.duration} t={transition}>
                  {bg ? (typeof bg === 'function' ? (bg as any)() : bg) : <BrandBG />}
                  {typeof v === 'function' ? (v as any)() : v ?? <Title text={`⚠ missing scene "${s.id}"`} />}
                </SceneFade>
                {captions ? <Captions /> : null}
                <Audio src={staticFile(s.audio)} />
              </Ctx.Provider>
            </Sequence>
          );
        })}
        {handle ? <Handle /> : null}
        {progress ? <Progress total={timeline.total} /> : null}
      </AbsoluteFill>
    </Ctx.Provider>
  );
};

const SceneFade: React.FC<{children: React.ReactNode; duration: number; t: number}> = ({children, duration, t}) => {
  const f = useF();
  const o = Math.min(interpolate(f, [0, t], [0, 1], {extrapolateRight: 'clamp'}), interpolate(f, [duration - 4, duration], [1, 0.6], {extrapolateLeft: 'clamp'}));
  const s = interpolate(f, [0, t], [1.04, 1], {extrapolateRight: 'clamp'});
  return <AbsoluteFill style={{opacity: o, transform: `scale(${s})`}}>{children}</AbsoluteFill>;
};

/** Helper for an optional Cover still: brand context with no timeline. */
export const CoverFrame: React.FC<{brand: Brand; children: React.ReactNode}> = ({brand, children}) => { useFonts(brand); return (
  <Ctx.Provider value={{brand, still: true}}>
    <AbsoluteFill style={{fontFamily: brand.font || 'Inter, -apple-system, sans-serif', background: brand.colors.bg1}}>{children}</AbsoluteFill>
  </Ctx.Provider>
); };

const loaded = new Set<string>();
/** Loads the look's font files (copied into the reel's assets by rs) before the first frame. */
function useFonts(b: Brand) {
  const [handle] = React.useState(() => {
    const todo = (b.fontFiles || []).filter((x) => !loaded.has(x.src));
    if (!todo.length) return null;
    const h = delayRender('fonts');
    Promise.all(todo.map((x) => { loaded.add(x.src); return loadFont({family: x.family, url: staticFile(x.src), weight: x.weight}); }))
      .then(() => continueRender(h)).catch((e) => { console.error(e); continueRender(h); });
    return h;
  });
  return handle;
}
