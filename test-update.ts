import { getDatabase } from './src/lib/db';
async function main() {
  const db = getDatabase();
  const sb = db.client;
  const { data: before } = await sb.from('observations').select('review_status').eq('id', 'obs-asset-01-1').single();
  console.log('BEFORE:', before?.review_status);
  const { data: updateData, error: updateErr } = await sb.from('observations').update({
    review_status: 'accepted',
    reviewed_by: 'c0786223-ecb5-4876-926c-6b433084029c',
    reviewed_at: new Date().toISOString()
  }).eq('id', 'obs-asset-01-1').select();
  console.log('UPDATE result:', updateData);
  console.log('UPDATE error:', updateErr);
  const { data: after } = await sb.from('observations').select('review_status').eq('id', 'obs-asset-01-1').single();
  console.log('AFTER:', after?.review_status);
}
main().catch(console.error);
