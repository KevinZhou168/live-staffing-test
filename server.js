// Import required modules
const express = require('express'); // Express framework for handling HTTP requests
const { createServer } = require('node:http'); // Node.js HTTP server
const { join } = require('node:path'); // Utility for handling file paths
const { Server } = require('socket.io'); // Socket.IO for real-time communication
const registerSocketHandlers = require('./server/logic/socketHandler'); // Function to register socket event handlers

require('dotenv').config();
const cors = require("cors");
const { Pool } = require("pg");
const axios = require('axios');


// Create an Express application
const app = express();

// Create an HTTP server and attach the Express app
const server = createServer(app);

// Create a Socket.IO server and attach it to the HTTP server
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static(join(__dirname, 'public')));
app.use(cors()); 
app.use(express.json());

// Handle the root route and serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'public/index.html'));
});

// Database connection
const sqlServerConnString = `
    DRIVER={${process.env.DRIVER_NAME}};
    SERVER=${process.env.SERVER_NAME};
    Database=${process.env.DATABASE_NAME};
    UID=${process.env.DATABASE_USER};
    PWD=${process.env.DATABASE_PASSWORD};
`;

// const pgUrl = `postgresql+psycopg2://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DB}`;
// const pgPool = new Pool({
//   connectionString: pgUrl,
// });

const pgUrl = `postgres://${process.env.PG_USER}` +
              `:${process.env.PG_PASSWORD}` +
              `@${process.env.PG_HOST}` +
              `:${process.env.PG_PORT}` +
              `/${process.env.PG_DB}`;

const pgPool = new Pool({ connectionString: pgUrl });

app.get("/api/login-validation", async (req, res) => {
  const smId = req.query.sm_id; // Get sm_id from query parameters
  const semester = req.query.project_semester;

  try {
    //Validate if sm_id exists
    const smIdCheckQuery = `
      SELECT 1
      FROM projects
      WHERE sm_id = $1 AND project_semester = $2
    `;
    const smIdCheckResult = await pgPool.query(smIdCheckQuery, [smId, semester]);

      
    if (smIdCheckResult.rowCount === 0) {
      return res.status(404).json({ error: `sm_id ${smId} does not exist for semester ${semester}.` });
    }
    res.json({
      message: "sm_id and semester has been validated",
      data: smIdCheckResult.rows,
    });
  } catch (error) {
    console.error("Error executing query:", error);
    res.status(500).json({ error: "Internal server error." });
  }


});

app.get("/api/get-projects", async (req, res) => {
    const smId = req.query.sm_id; // Get sm_id from query parameters
    const semester = req.query.project_semester;
    
    try{
      //Fetch projects grouped by sm_id
      const projectsQuery = `
        SELECT 
            project_id,
            project_semester,
            project_name,
            client_name,
            em_id,
            sm_id,
            pm_id,
            sc1_id,
            sc2_id
        FROM 
            projects
        WHERE
            sm_id = $1 AND
            project_semester = $2

      
      `;
      const projectsResult = await pgPool.query(projectsQuery, [smId, semester]);
  
      // Step 3: Handle response
      if (projectsResult.rows.length === 0) {
        return res.status(404).json({ message: "No current projects found for the given sm_id in the semester." });
      }
  
      res.json({
        message: "Current projects grouped by sm_id and semester",
        data: projectsResult.rows,
      });
    } catch (error) {
      console.error("Error executing query:", error);
      res.status(500).json({ error: "Internal server error." });
    }
  });
    
app.get("/api/get-consultants", async (req, res) => {

  try {
    const consultantsQuery = `
      SELECT 
        u.user_id,
        u.name,
        u.email,
        u.curr_role,
        u.gender,
        u.race,
        u.us_citizen,
        u.residency,
        u.first_gen,
        u.netid,
        c.status,
        c.year,
        c.major,
        c.minor,
        c.college,
        c.availability_mon,
        c.availability_tue,
        c.availability_wed,
        c.availability_thu,
        c.availability_fri,
        c.availability_sat,
        c.availability_sun,
        c.consultant_score,
        c.semesters_in_ibc,
        c.time_zone,
        c.willing_to_travel,
        c.week_before_finals_availability,
        c.industry_interests,
        c.functional_area_interests
      FROM consultants c
      JOIN users u ON c.user_id = u.user_id
      WHERE c.status != 'Deferred' OR c.status IS NULL
        AND u.curr_role IN ('NC', 'EC');
    `;

    const result = await pgPool.query(consultantsQuery);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No consultants found matching criteria." });
    }
    
    res.json({
      message: "Consultant directory fetched successfully.",
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching consultant directory:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

/*
app.get("/api/import-project-data", async (req, res) => { //OLD, DELETE
  try {
    // get data from Google sheets doGet enndpoint
    const googleSheetsUrl = 'https://script.google.com/macros/s/AKfycbwae3VAxJf8dBB-Rg1v4sOZwQAHihAbJ5GNV13jPBQZUBXffSS058X3Em7QwpG5ZUpYXQ/exec';
    const response = await axios.get(googleSheetsUrl);
    
    let sheetData;
    if (Array.isArray(response.data)) {
      sheetData = response.data;
    } else if (response.data.data && Array.isArray(response.data.data)) {
      sheetData = response.data.data;
    } else {
      sheetData = response.data;
    }


    for (const row of sheetData) {
      const { consultantId, role, projectId } = row;

      // insert into consultants_projects table
      // Using ON CONFLICT to update the role if a row with the same (consultantId, projectId) already exists.
      const query = `
        INSERT INTO consultants_projects (consultant_id, role, project_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (consultant_id, project_id) DO UPDATE 
          SET role = EXCLUDED.role;
      `;
      await pgPool.query(query, [consultantId, role, projectId]);
    }

    res.status(200).json({ message: "Sheet data imported to database successfully." });
  } catch (error) {
    console.error("Error importing project data:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});
*/

// fetch history from google sheets.
// iterate bottump up and ignore duplicates by consultantId
// insert to project-consultant database
app.get("/api/import-project-data", async (req, res) => {
  
  const SHEET_HISTORY_URL = "https://script.google.com/macros/s/AKfycbwae3VAxJf8dBB-Rg1v4sOZwQAHihAbJ5GNV13jPBQZUBXffSS058X3Em7QwpG5ZUpYXQ/exec";

  try {
    // 1) fetch the sheet history
    const { data } = await axios.get(SHEET_HISTORY_URL);
    const rows = Array.isArray(data) ? data : data.data || [];

    // 2) iterate bottom‑to‑up, dedupe by consultantId
    const seen = new Set();
    for (let i = rows.length - 1; i >= 0; i--) {
      const { consultantId, projectId, role } = rows[i];
      if (seen.has(consultantId)) continue;
      seen.add(consultantId);

      // 3) insert into the join table, ignore duplicates
      const insertSQL = `
        INSERT INTO consultants_projects (consultant_id, project_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (consultant_id, project_id) DO NOTHING;
      `;
      await pgPool.query(insertSQL, [
        consultantId,
        projectId,
        role
      ]);
    }

    res.json({ message: "Imported latest project‑consultant assignments." });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ error: "Failed to import project data." });
  }
});

// Register all socket event handlers
registerSocketHandlers(io);

// Start the server and listen on port 3000
server.listen(3000, () => {
  console.log('server running at http://localhost:3000'); // Log the server URL
});