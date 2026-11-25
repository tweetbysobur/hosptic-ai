import { DATASETS, datasetSummary } from "@/lib/datasets";

export async function GET() {
  return Response.json(Object.keys(DATASETS).map((id) => datasetSummary(id)));
}
