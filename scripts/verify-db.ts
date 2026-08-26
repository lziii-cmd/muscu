import { openDatabase } from "./db";

async function main() {
  const db = await openDatabase();
  const show = async (title: string, sql: string) => {
    console.log(`\n--- ${title} ---`);
    console.table(await db.query(sql));
  };
  await show("Volumes", `
    select 'exercices' as t, count(*)::int as n from exercises
    union all select 'programmes', count(*)::int from programs
    union all select 'semaines', count(*)::int from program_weeks
    union all select 'seances prescrites', count(*)::int from program_sessions
    union all select 'lignes exercices', count(*)::int from program_exercises
    union all select 'echelles', count(*)::int from ladders
    union all select 'niveaux', count(*)::int from ladder_levels
    union all select 'aliments', count(*)::int from foods
    union all select 'jalons', count(*)::int from checkpoints`);
  await show("Aujourd'hui 2026-08-26", `
    select ps.slot, ps.label, e.name, pe.order_label,
           pe.sets, pe.reps_low, pe.reps_high, pe.hold_seconds_low, pe.hold_seconds_high,
           pe.load_raw, pe.rest_seconds
    from program_sessions ps
    join program_exercises pe on pe.program_session_id = ps.id
    join exercises e on e.id = pe.exercise_id
    where ps.date = '2026-08-26'
    order by ps.slot, pe.order_index`);
  await show("Points signales dans la revue", `
    select 'lundi (force)' as jour, pe.order_label, e.name,
           pe.sets, pe.reps_low, pe.max_offset
    from program_sessions ps
    join program_exercises pe on pe.program_session_id = ps.id
    join exercises e on e.id = pe.exercise_id
    where ps.date = '2026-09-07' and ps.slot = 'matin'
    union all
    select 'jeudi (volume)', pe.order_label, e.name, pe.sets, pe.reps_low, pe.max_offset
    from program_sessions ps
    join program_exercises pe on pe.program_session_id = ps.id
    join exercises e on e.id = pe.exercise_id
    where ps.date = '2026-10-01' and ps.slot = 'matin'
    order by 1, 2`);
  await show("Fourchettes de tenue preservees", `
    select e.name, pe.sets, pe.hold_seconds_low, pe.hold_seconds_high, count(*)::int as occurrences
    from program_exercises pe join exercises e on e.id = pe.exercise_id
    where pe.hold_seconds_low is distinct from pe.hold_seconds_high
    group by e.name, pe.sets, pe.hold_seconds_low, pe.hold_seconds_high`);
  await show("Decalages sur le max", `
    select pe.max_offset, count(*)::int as lignes
    from program_exercises pe where pe.max_offset is not null
    group by pe.max_offset order by pe.max_offset`);
  await show("Alternatives maison — S2 lundi 31", `
    select pe.order_label, e.name, pe.home_alternative
    from program_sessions ps
    join program_exercises pe on pe.program_session_id = ps.id
    join exercises e on e.id = pe.exercise_id
    where ps.date = '2026-08-31' and ps.slot = 'salle'
    order by pe.order_index`);
  await show("Referentiel calisthenie", `
    select (select count(*)::int from ladders) as echelles,
           (select count(*)::int from ladder_levels) as niveaux,
           (select count(*)::int from targets) as objectifs,
           (select count(*)::int from test_metrics) as metriques,
           (select count(*)::int from program_exercises where home_alternative is not null) as lignes_avec_maison`);
  await show("Charges non nulles converties", `
    select count(*) filter (where load_kg is not null)::int as load_kg_ok,
           count(*) filter (where load_raw is not null and load_kg is null)::int as load_texte_seul,
           count(*) filter (where dumbbell_kg is not null)::int as halteres_ok
    from program_exercises`);
  await db.close();

}

main();
