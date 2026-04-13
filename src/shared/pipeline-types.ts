/** Stage-level status for a pipeline run */
export interface PipelineStage {
  name: string;
  state: 'pending' | 'inProgress' | 'completed' | 'skipped' | 'cancelling';
  result: 'succeeded' | 'failed' | 'canceled' | 'skipped' | null;
  /** Elapsed seconds (only when inProgress or completed) */
  duration?: number;
  /** Elapsed seconds so far (only when inProgress) */
  elapsed?: number;
  /** Estimated total seconds (from historical average) */
  estimated?: number;
}

/** Full status payload written by the monitor script and sent to renderer */
export interface PipelineStatus {
  buildId: number;
  pipelineName: string;
  sourceBranch: string;
  status: 'notStarted' | 'inProgress' | 'completed' | 'cancelling';
  result: 'succeeded' | 'failed' | 'canceled' | null;
  stages: PipelineStage[];
  startTime: string;
  /** Estimated remaining seconds */
  estimatedRemaining: number | null;
  updatedAt: string;
}
