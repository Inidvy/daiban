// Playtest sheet (docs/design.md, M6): speaking time vs. session time, the 7-day recall check of Day 1
// patterns (English prompt → speak), and a JSON export to send to the person running the playtest.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import type { Cards } from '../progress.ts';
import { content } from './content.ts';
import { ResultMark, SpeakPrompt } from './menu-board.tsx';
import { Sheet } from './sheet.tsx';
import { allStats, exportData, firstPlayed, recallRuns, saveRecallRun } from './stats.ts';
import type { RecallAnswer } from './stats.ts';
import { Zh } from './words.tsx';

const DAY_MS = 86_400_000;
const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`;

function RecallCheck({ onDone }: { onDone: () => void }) {
  const patterns = useMemo(() => content.patterns.filter((p) => p.day === 1 && !p.template.startsWith('[')), []);
  const [answers, setAnswers] = useState<RecallAnswer[]>([]);
  const current = patterns[answers.length];
  const saved = useRef(false);
  useEffect(() => {
    if (current || saved.current) return;
    saved.current = true;
    const first = firstPlayed();
    saveRecallRun({
      at: new Date().toISOString(),
      daysSinceFirst: first ? Math.floor((Date.now() - new Date(first).getTime()) / DAY_MS) : null,
      answers,
    });
  }, [current, answers]);
  if (!current) {
    return (
      <div>
        <p className="big">
          {answers.filter((a) => a.ok).length} / {answers.length} remembered
        </p>
        {answers.map((a) => (
          <p key={a.patternId}>
            <ResultMark ok={a.ok} /> {content.patterns.find((p) => p.id === a.patternId)?.template} {a.heard && <span className="muted">· {a.heard}</span>}
          </p>
        ))}
        <button type="button" className="btn primary wide" onClick={onDone}>
          OK
        </button>
      </div>
    );
  }
  return (
    <div>
      <p className="muted">
        {answers.length + 1} / {patterns.length} · no hints in this check
      </p>
      <SpeakPrompt
        key={current.id}
        pattern={current}
        allowHelp={false}
        onResult={(r) => setAnswers([...answers, { patternId: current.id, ok: r.ok, heard: r.heard, ms: r.ms }])}
      />
    </div>
  );
}

export function StatsSheet({ cards, onClose }: { cards: Cards; onClose: () => void }) {
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const stats = allStats();
  const days = Object.keys(stats).sort().reverse();
  const total = days.reduce((t, d) => ({ active: t.active + stats[d].activeMs, speaking: t.speaking + stats[d].speakingMs }), { active: 0, speaking: 0 });
  const first = firstPlayed();
  const daysSince = first ? Math.floor((Date.now() - new Date(first).getTime()) / DAY_MS) : null;
  const runs = recallRuns();
  const json = JSON.stringify(exportData({ progress: cards }), null, 2);

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `daiban-playtest-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (checking) {
    return (
      <Sheet title="7天测试 Recall check" onClose={() => setChecking(false)}>
        <RecallCheck onDone={() => setChecking(false)} />
      </Sheet>
    );
  }

  return (
    <Sheet title="试玩 Playtest" onClose={onClose}>
      <h3 className="section-title"><Zh text="说话时间 Speaking time" /></h3>
      <p>
        {minutes(total.speaking)} speaking of {minutes(total.active)} played
        {total.active > 0 && <b> · {Math.round((100 * total.speaking) / total.active)}%</b>} <span className="muted">(goal: 50%)</span>
      </p>
      <div className="table-wrap">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Played</th>
              <th>Speaking</th>
              <th>Said aloud</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d}>
                <td>{d}</td>
                <td>{minutes(stats[d].activeMs)}</td>
                <td>{minutes(stats[d].speakingMs)}</td>
                <td>{stats[d].saidAloud}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Speaking is measured by the microphone (recognizer and tone mirror). Lines read aloud without a mic are only counted.</p>

      <h3 className="section-title"><Zh text="7天测试 Recall check" /></h3>
      <p>
        {daysSince === null
          ? 'Starts counting when you first play Day 1.'
          : daysSince >= 7
            ? `Day 1 was ${daysSince} days ago: time for the check.`
            : `Day 1 was ${daysSince} day${daysSince === 1 ? '' : 's'} ago. The check is meant for day 7 (in ${7 - daysSince}).`}
      </p>
      {runs.map((r) => (
        <p key={r.at} className="muted">
          {r.at.slice(0, 10)} (day {r.daysSinceFirst ?? '?'}): {r.answers.filter((a) => a.ok).length}/{r.answers.length}
        </p>
      ))}
      <button type="button" className="btn primary" onClick={() => setChecking(true)}>
        <Zh text="开始 Start the check" />
      </button>

      <h3 className="section-title"><Zh text="导出 Export" /></h3>
      <p className="hint">Send this file to whoever runs the playtest. It stays on this device otherwise.</p>
      <div className="row-end">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(json).then(() => setCopied(true));
          }}
        >
          <Copy size={16} /> {copied ? 'Copied' : 'Copy JSON'}
        </button>
        <button type="button" className="btn primary" onClick={download}>
          <Download size={16} /> Download
        </button>
      </div>
    </Sheet>
  );
}
