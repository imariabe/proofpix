import { useCallback } from "react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type PipelineStepKey =
  | "validate"
  | "metadata"
  | "structure"
  | "consistency"
  | "compression"
  | "compare"
  | "report";

export const IMAGE_STEP_KEYS: readonly PipelineStepKey[] = [
  "validate",
  "metadata",
  "structure",
  "consistency",
  "compression",
  "report",
];

export const COMPARISON_STEP_KEYS: readonly PipelineStepKey[] = [
  "validate",
  "compare",
  "report",
];

export type StepState = "pending" | "running" | "done" | "failed";

/**
 * Runs pipeline actions strictly in order. A step is only reported "done"
 * when its Convex action has genuinely returned — the progress UI never
 * shows work that has not finished. The first failure stops the run and is
 * re-thrown so callers can surface the reason.
 */
export function usePipeline() {
  const validateStep = useAction(api.steps.validateStep);
  const metadataStep = useAction(api.steps.metadataStep);
  const structureStep = useAction(api.steps.structureStep);
  const consistencyStep = useAction(api.steps.consistencyStep);
  const compressionStep = useAction(api.steps.compressionStep);
  const compareStep = useAction(api.steps.compareStep);
  const finalizeStep = useAction(api.steps.finalizeStep);

  return useCallback(
    async (
      analysisId: Id<"analyses">,
      keys: readonly PipelineStepKey[],
      onStep: (key: PipelineStepKey, state: StepState) => void,
    ): Promise<void> => {
      const runners: Record<PipelineStepKey, () => Promise<unknown>> = {
        validate: async () => {
          const result = await validateStep({ analysisId });
          if (
            result &&
            typeof result === "object" &&
            "ok" in result &&
            !(result as { ok: boolean }).ok
          ) {
            throw new Error(
              (result as { error?: string }).error ?? "Validation failed.",
            );
          }
          return result;
        },
        metadata: () => metadataStep({ analysisId }),
        structure: () => structureStep({ analysisId }),
        consistency: () => consistencyStep({ analysisId }),
        compression: () => compressionStep({ analysisId }),
        compare: () => compareStep({ analysisId }),
        report: () => finalizeStep({ analysisId }),
      };

      for (const key of keys) {
        onStep(key, "running");
        try {
          await runners[key]();
        } catch (error) {
          onStep(key, "failed");
          throw error;
        }
        onStep(key, "done");
      }
    },
    [
      validateStep,
      metadataStep,
      structureStep,
      consistencyStep,
      compressionStep,
      compareStep,
      finalizeStep,
    ],
  );
}
