// Tone mirror (docs/design.md): the learner's pitch curve drawn over the target tones, shown in review,
// never mid-conversation. Pitch detection by pitchy (https://github.com/ianprime0509/pitchy, MIT).

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Volume2, Waves } from 'lucide-react';
import { PitchDetector } from 'pitchy';
import { learnerContour, targetContour } from '../tones.ts';
import { Sheet } from './sheet.tsx';
import { speaker, TEACHER_VOICE } from './speech.ts';
import { addSpeaking } from './stats.ts';

const W = 320;
const H = 130;
const y = (level: number) => 12 + ((5 - level) / 4) * (H - 40);
const FRAME_MS = 25;
const MAX_MS = 5000;

async function recordPitch(onStop: (stop: () => void) => void): Promise<(number | null)[]> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  ctx.createMediaStreamSource(stream).connect(analyser);
  // see pitchy README: PitchDetector.forFloat32Array(n).findPitch(buffer, sampleRate) → [pitch, clarity]
  const detector = PitchDetector.forFloat32Array(analyser.fftSize);
  const buf = new Float32Array(analyser.fftSize);
  const track: (number | null)[] = [];
  return new Promise((resolve) => {
    const finish = () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
      resolve(track);
    };
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const [pitch, clarity] = detector.findPitch(buf, ctx.sampleRate);
      track.push(clarity > 0.88 && pitch > 60 && pitch < 600 ? pitch : null);
      if (track.length * FRAME_MS >= MAX_MS) finish();
    }, FRAME_MS);
    onStop(finish);
  });
}

function MirrorChart({ pinyin, learner }: { pinyin: string; learner: (number | null)[] }) {
  const target = targetContour(pinyin);
  const seg = W / Math.max(1, target.length);
  const learnerPath: string[] = [];
  let pen = false;
  learner.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    const x = (i / Math.max(1, learner.length - 1)) * W;
    learnerPath.push(`${pen ? 'L' : 'M'}${x.toFixed(1)},${y(v).toFixed(1)}`);
    pen = true;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mirror-chart" role="img" aria-label="Your pitch over the target tones">
      {[1, 3, 5].map((l) => (
        <line key={l} x1={0} x2={W} y1={y(l)} y2={y(l)} className="grid" />
      ))}
      {target.map((s, i) => {
        const pts = s.points.map((p, j) => `${(i * seg + 6 + (j / (s.points.length - 1)) * (seg - 12)).toFixed(1)},${y(p).toFixed(1)}`);
        return (
          <g key={i}>
            <polyline points={pts.join(' ')} className={`target tone${s.tone}`} />
            <text x={i * seg + seg / 2} y={H - 6} textAnchor="middle" className="syl">
              {s.syllable}
            </text>
          </g>
        );
      })}
      {learnerPath.length > 0 && <path d={learnerPath.join(' ')} className="learner" />}
    </svg>
  );
}

export function ToneMirror({ text, pinyin }: { text: string; pinyin: string }) {
  const [open, setOpen] = useState(false);
  const [learner, setLearner] = useState<(number | null)[]>([]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => stopRef.current?.(), []);

  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const record = async () => {
    if (recording) {
      stopRef.current?.();
      return;
    }
    setError(null);
    setRecording(true);
    try {
      const track = await recordPitch((stop) => (stopRef.current = stop));
      addSpeaking(track.filter((h) => h !== null).length * FRAME_MS);
      const curve = learnerContour(track);
      setLearner(curve);
      if (!curve.length) setError('No voice heard. Hold the phone closer and try again.');
    } catch {
      setError('Microphone not available. Allow it in the browser to use the tone mirror.');
    } finally {
      stopRef.current = null;
      setRecording(false);
    }
  };

  return (
    <>
      <button type="button" className="btn small ghost" onClick={() => setOpen(true)}>
        <Waves size={16} /> 声调 Tones
      </button>
      {open && (
        <Sheet title="声调镜子 Tone mirror" onClose={() => setOpen(false)}>
          <p className="mirror-text">{text}</p>
          <p className="muted">{pinyin}</p>
          <MirrorChart pinyin={pinyin} learner={learner} />
          <p className="hint">
            Grey: the target tones. <span className="learner-key">Red</span>: your voice, scaled to your own range. Listen, say it, compare, try again.
          </p>
          <div className="row-end">
            <button type="button" className="btn ghost" onClick={() => void speaker.speak(text, TEACHER_VOICE)}>
              <Volume2 size={16} /> 听 Listen
            </button>
            <button type="button" className={`btn primary ${recording ? 'listening' : ''}`} onClick={record} disabled={!canRecord}>
              {recording ? <Square size={16} /> : <Mic size={16} />} {recording ? '停 Stop' : '说 Record'}
            </button>
          </div>
          {error && <p className="hint warn-text">{error}</p>}
        </Sheet>
      )}
    </>
  );
}
