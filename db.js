require('dotenv').config();
const { Pool } = require('pg');
const pgUrl = `postgres://${process.env.PG_USER}` +
              `:${process.env.PG_PASSWORD}` +
              `@${process.env.PG_HOST}` +
              `:${process.env.PG_PORT}` +
              `/${process.env.PG_DB}`;
const pgPool = new Pool({ connectionString: pgUrl });
module.exports = pgPool;


