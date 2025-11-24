/**
 * Admin API - pipeline control endpoints
 * POST /api/admin/ingest
 * POST /api/admin/process
 * GET /api/admin/status
 */

export default async function handler(req: any, res: any) {
  const { method, url } = req;
  
  // For now, just return 200 with {ok:true}; we'll wire later
  res.status(200).json({ ok: true, message: 'Admin API not implemented yet' });
}

