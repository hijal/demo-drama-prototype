import { rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
interface Attempt {
  id: string;
  attempt: number;
}
export function outputSubfolder(job: Attempt) {
  if (!Number.isInteger(job.attempt) || job.attempt < 1)
    throw new Error("Invalid job attempt");
  return `pipeline_${job.id.replace(/[^\w-]/g, "_")}_a${job.attempt}`;
}
export async function cleanOutputs(
  job: Attempt,
  root = process.env.COMFY_OUTPUT_DIR,
) {
  if (!root) return;
  // Only a single generated subdirectory is owned by this attempt.
  await rm(resolve(root, outputSubfolder(job)), {
    recursive: true,
    force: true,
  });
}

export async function cleanInputs(
  names: string[],
  root = process.env.COMFY_INPUT_DIR,
) {
  if (!root) return;
  const directory = resolve(root);
  const files = names.map((name) => resolve(directory, name));
  if (files.some((file) => !file.startsWith(directory + sep)))
    throw new Error("Input cleanup path is outside its directory");
  for (const file of files) await rm(file, { force: true });
}
