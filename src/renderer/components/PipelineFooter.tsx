/**
 * PipelineFooter — renders at the bottom of a terminal pane when a pipeline
 * run is being tracked for that pane. Shows stage progress, status icons,
 * a progress bar, and estimated time remaining.
 */

import React, { useState } from 'react';
import { usePipelineStore } from '../state/pipeline-store';
import type { PipelineStatus, PipelineStage } from '../../shared/pipeline-types';

interface Props {
  paneId: string;
}

function stageIcon(stage: PipelineStage): string {
  if (stage.state === 'completed') {
    if (stage.result === 'succeeded') return '✓';
    if (stage.result === 'failed') return '✗';
    if (stage.result === 'canceled') return '⊘';
    if (stage.result === 'skipped') return '⊘';
    return '✓';
  }
  if (stage.state === 'inProgress') return '●';
  if (stage.state === 'cancelling') return '⊘';
  return '○';
}

function stageColor(stage: PipelineStage): string {
  if (stage.state === 'completed') {
    if (stage.result === 'succeeded') return '#a6e3a1';
    if (stage.result === 'failed') return '#f38ba8';
    if (stage.result === 'canceled') return '#a6adc8';
    return '#a6e3a1';
  }
  if (stage.state === 'inProgress') return '#89b4fa';
  return '#585b70';
}

function formatDuration(seconds: number | undefined | null): string {
  if (seconds == null || seconds < 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function overallProgress(status: PipelineStatus): number {
  if (!status.stages.length) return 0;
  const completed = status.stages.filter(s => s.state === 'completed').length;
  const inProgress = status.stages.filter(s => s.state === 'inProgress').length;
  return ((completed + inProgress * 0.5) / status.stages.length) * 100;
}

function statusEmoji(status: PipelineStatus): string {
  if (status.result === 'succeeded') return '✅';
  if (status.result === 'failed') return '❌';
  if (status.result === 'canceled') return '⊘';
  if (status.status === 'inProgress') return '🔄';
  return '⏳';
}

function estimateRemaining(status: PipelineStatus): string | null {
  let totalRemaining = 0;
  let hasEstimate = false;
  for (const stage of status.stages) {
    if (stage.state === 'completed') continue;
    if (stage.estimated) {
      hasEstimate = true;
      const elapsed = stage.elapsed || 0;
      totalRemaining += Math.max(0, stage.estimated - elapsed);
    }
  }
  if (!hasEstimate) return null;
  if (totalRemaining < 60) return `~${totalRemaining}s left`;
  return `~${Math.ceil(totalRemaining / 60)} min left`;
}

export const PipelineFooter: React.FC<Props> = ({ paneId }) => {
  const status = usePipelineStore((s) => s.statuses[paneId]);
  const isDismissed = usePipelineStore((s) => s.dismissed.has(paneId));
  const dismiss = usePipelineStore((s) => s.dismissPipeline);
  const [expanded, setExpanded] = useState(true);

  if (!status || isDismissed) return null;

  const progress = overallProgress(status);
  const remaining = estimateRemaining(status);
  const isTerminal = status.result != null;

  return (
    <div className="pipeline-footer" onMouseDown={(e) => e.stopPropagation()}>
      {/* Header bar — always visible */}
      <div className="pipeline-footer-header" onClick={() => setExpanded(!expanded)}>
        <span className="pipeline-footer-status">{statusEmoji(status)}</span>
        <span className="pipeline-footer-name">{status.pipelineName}</span>
        {status.sourceBranch && (
          <span className="pipeline-footer-branch">{status.sourceBranch}</span>
        )}
        {/* Progress bar */}
        <div className="pipeline-footer-progress-bar">
          <div
            className={`pipeline-footer-progress-fill ${isTerminal ? (status.result === 'succeeded' ? 'succeeded' : 'failed') : ''}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {remaining && <span className="pipeline-footer-eta">{remaining}</span>}
        <button
          className="pipeline-footer-toggle"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <button
          className="pipeline-footer-dismiss"
          title="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            dismiss(paneId);
          }}
        >
          ✕
        </button>
      </div>

      {/* Stage details — shown when expanded */}
      {expanded && (
        <div className="pipeline-footer-stages">
          {status.stages.map((stage) => (
            <div key={stage.name} className="pipeline-footer-stage">
              <span className="pipeline-stage-icon" style={{ color: stageColor(stage) }}>
                {stageIcon(stage)}
              </span>
              <span className="pipeline-stage-name">{stage.name}</span>
              <span className="pipeline-stage-time">
                {stage.state === 'completed'
                  ? formatDuration(stage.duration)
                  : stage.state === 'inProgress'
                    ? `${formatDuration(stage.elapsed)}/${formatDuration(stage.estimated)}`
                    : stage.estimated
                      ? `~${formatDuration(stage.estimated)}`
                      : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PipelineFooter;
