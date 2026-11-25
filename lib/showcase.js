// Builds the example conversation shown in the landing page product preview.
// It runs the real analysis engine, so the figures match the workspace.
import { analyze } from "@/lib/engine";
import { DATASETS, datasetSummary } from "@/lib/datasets";

export const EXAMPLE_QUESTION = "Compare maternal complication rates across the four quarters";

export function buildShowcase() {
  const response = analyze({
    message: EXAMPLE_QUESTION,
    datasetIds: ["maternal"],
    context: {},
    history: [],
  });

  const conversation = {
    id: "showcase",
    title: "Maternal complications by quarter",
    datasetIds: ["maternal"],
    messages: [
      { id: "showcase-q", role: "user", text: EXAMPLE_QUESTION },
      { id: "showcase-a", role: "assistant", response },
    ],
  };

  const datasets = Object.keys(DATASETS).map((id) => datasetSummary(id));

  const conversations = [
    conversation,
    { id: "showcase-2", title: "Length of stay distribution", messages: [] },
    { id: "showcase-3", title: "Readmission drivers", messages: [] },
  ];

  return { conversation, datasets, conversations };
}
