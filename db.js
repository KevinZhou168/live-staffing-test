require('dotenv').config();
const { Pool } = require('pg');
// const pgUrl = `postgres://${process.env.PG_USER}` +
//               `:${process.env.PG_PASSWORD}` +
//               `@${process.env.PG_HOST}` +
//               `:${process.env.PG_PORT}` +
//               `/${process.env.PG_DB}`;
// const pgPool = new Pool({ connectionString: pgUrl });
const pgPool = new Pool({
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DB,
  host: process.env.PG_HOST || `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`,
  port: process.env.PG_PORT || 5432,
});
module.exports = pgPool;


