/* Thẻ "Agent đang làm": vòng sáng + các bước chạy lần lượt (tick xanh khi xong, vòng xoay ở bước đang làm) + đếm giây khi chờ lâu. */
import { useEffect, useState } from 'react';
import { ELAPSED_SHOW_MS, activeStep, runSteps, stepState } from '@/lib/agentRun';
import '@/styles/agent-fx.css';

export function AgentRun({ q }: { q: string }): JSX.Element {
  const run = runSteps(q), [ms, setMs] = useState(0);
  useEffect(() => {
    const t0 = Date.now(), id = window.setInterval(() => setMs(Date.now() - t0), 250);
    return () => window.clearInterval(id);
  }, []);
  const a = activeStep(ms, run.steps.length);
  return (
    <div className="agcard" role="status" aria-label={run.title}>
      <div className="agorb" aria-hidden="true"><i /><span>✦</span></div>
      <div className="agbody">
        <div className="agh"><b>{run.title}</b>{ms >= ELAPSED_SHOW_MS && <small>{Math.floor(ms / 1000) + ' giây'}</small>}</div>
        <ol className="agsteps">
          {run.steps.map((t, k) => { const st = stepState(k, a); return <li key={t} className={st}><b aria-hidden="true">{st === 'ok' ? '✓' : ''}</b><span>{t}</span></li>; })}
        </ol>
      </div>
    </div>
  );
}
