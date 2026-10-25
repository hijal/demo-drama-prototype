/** Capability discovery contains no private project data. */
export function GET() { return Response.json({manual:true,pipeline:true}) }
