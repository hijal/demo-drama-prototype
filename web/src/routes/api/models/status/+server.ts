import { getAllModelsStatus } from '@/lib/model-downloader'


export async function GET() {
  const models = getAllModelsStatus()
  return Response.json({ models })
}
