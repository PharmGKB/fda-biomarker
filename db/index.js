const pgp = require('pg-promise')({schema: 'pgkbcomm'});

if (!process.env.PGHOST) {
  console.error('PGHOST env is not defined');
  process.exit(1);
}

const user = process.env.PGHOST === 'localhost' ? 'preview' : `preview:${process.env.PGPASS}`;
const dbname = process.env.PGDB || 'pharmgkb';
const cn = `postgres://${user}@${process.env.PGHOST}:5432/${dbname}`;
const db = pgp(cn);

module.exports = db;