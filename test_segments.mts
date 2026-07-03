import fs from 'node:fs';
// @ts-ignore
import FitParser from 'fit-file-parser';
import { buildParsedFit } from './src/fit';

const buf = fs.readFileSync('../2026横浜.fit');
const parser = new FitParser({ force: true, speedUnit: 'km/h', lengthUnit: 'm', mode: 'list' });

parser.parse(buf, (err: any, data: any) => {
  if (err) throw err;

  const show = (name: string, parsed: any) =>
    console.log(
      name,
      '->',
      parsed.segments.map((s: any) => `${s.label}(${s.sport}, ${s.records.length}recs)`).join(', '),
    );

  // Full triathlon
  show('FULL', buildParsedFit('full.fit', data));

  // Helper: keep only records within one session's window
  const bySport = (sport: string) => {
    const sess = data.sessions.find((s: any) => s.sport === sport);
    const start = +new Date(sess.start_time);
    const end = start + sess.total_timer_time * 1000 + 60000;
    const recs = data.records.filter((r: any) => {
      const t = +new Date(r.timestamp);
      return t >= start && t <= end;
    });
    return { sess, recs };
  };

  // Run-only file (session + records)
  const run = bySport('running');
  show('RUN-ONLY', buildParsedFit('run.fit', { records: run.recs, sessions: [run.sess], laps: [] }));

  // Swim-only
  const swim = bySport('swimming');
  show('SWIM-ONLY', buildParsedFit('swim.fit', { records: swim.recs, sessions: [swim.sess], laps: [] }));

  // Bike-only
  const bike = bySport('cycling');
  show('BIKE-ONLY', buildParsedFit('bike.fit', { records: bike.recs, sessions: [bike.sess], laps: [] }));

  // No sessions at all — sport should be inferred
  show('NO-SESSION (bike recs)', buildParsedFit('x.fit', { records: bike.recs, sessions: [], laps: [] }));
  show('NO-SESSION (run recs)', buildParsedFit('x.fit', { records: run.recs, sessions: [], laps: [] }));
  show('NO-SESSION (sports msg)', buildParsedFit('x.fit', { records: swim.recs, sessions: [], laps: [], sports: [{ sport: 'swimming' }] }));
});
