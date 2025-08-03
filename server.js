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

const fs = require('fs')
const path = require('path')
const smProjectsPath = path.join(__dirname, 'server', 'data', 'projects.js');
const consultantsPath = path.join(__dirname, 'server', 'data', 'consultants.js');
const smDataPath = path.join(__dirname, 'server', 'data', 'smData.js');

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

// No need to re-establish pgPool if we have db.js
// const pgUrl = `postgres://${process.env.PG_USER}` +
//               `:${process.env.PG_PASSWORD}` +
//               `@${process.env.PG_HOST}` +
//               `:${process.env.PG_PORT}` +
//               `/${process.env.PG_DB}`;
// const pgPool = new Pool({ connectionString: pgUrl });

const pgPool = require('./db.js');

app.get("/api/login-validation", async (req, res) => {
  const smId = req.query.sm_id;
  const semester = req.query.project_semester;

  if (!smId || !semester) {
    return res.status(400).json({ error: "Missing sm_id or project_semester." });
  }

  try {
    const smIdCheckQuery = `
      SELECT 1 FROM projects WHERE sm_id = $1 AND project_semester = $2 LIMIT 1
    `;
    const smIdCheckResult = await pgPool.query(smIdCheckQuery, [smId, semester]);
    if (smIdCheckResult.rowCount === 0) {
      return res.status(404).json({ error: `sm_id ${smId} not found for semester ${semester}.` });
    }
    return res.status(200).json({ message: "Validation passed" });

  } catch (error) {
    console.error("Error in login-validation:", error);
    res.status(500).json({ error: "Internal server error." });
  }
});

app.get("/api/start-draft", async (req, res) => {
  const semester = req.query.project_semester;

  if (!semester) {
    return res.status(400).json({ error: "Missing project_semester." });
  }

  try {
    // 1. Fetch all SMs for this semester
    const smProjectsResult = await pgPool.query(`
      SELECT 
        project_id,
        project_name,
        client_name,
        em_id,
        sm_id,
        pm_id,
        sc1_id,
        sc2_id
      FROM projects
      WHERE project_semester = $1
    `, [semester]);

    const smProjectsMap = {};
    const allProjectIds = [];

    for (const row of smProjectsResult.rows) {
      allProjectIds.push(row.project_id);
      if (!smProjectsMap[row.sm_id]) {
        smProjectsMap[row.sm_id] = {};
      }
      smProjectsMap[row.sm_id][row.project_id] = {
        PM: row.pm_id,
        SC: [row.sc1_id, row.sc2_id].filter(Boolean),
        NC: [],
        EC: [],
        Description: row.project_name
      };
    }

    // 2. Find all consultants *already staffed*
    const staffedResult = await pgPool.query(`
      SELECT DISTINCT user_id
      FROM consultant_projects
      WHERE project_id = ANY($1)
    `, [allProjectIds]);

    const staffedIds = staffedResult.rows.map(r => r.user_id); // Might be redundant ***
    const intStaffedIds = staffedIds.map(Number);

    // 3. Fetch all *available* consultants
    const consultantsResult = await pgPool.query(`
      SELECT *
      FROM consultants c
      JOIN users u ON c.user_id = u.user_id
      WHERE c.status != 'Deferred'
        AND u.curr_role IN ('NC', 'EC')
        AND u.user_id != ALL($1::int[])
    `, [intStaffedIds]);

    const allConsultants = {};
    for (const c of consultantsResult.rows) {
      allConsultants[c.user_id] = {
        UserID: c.user_id,
        Name: c.name,
        Email: c.email,
        Major: c.major,
        Role: c.curr_role,
        Year: c.year,
        Availability_Mon: c.availability_mon,
        Availability_Tue: c.availability_tue,
        Availability_Wed: c.availability_wed,
        Availability_Thu: c.availability_thu,
        Availability_Fri: c.availability_fri,
        Availability_Sat: c.availability_sat,
        Availability_Sun: c.availability_sun,
        ConsultantScore: c.consultant_score,
        Num_SemestersInIBC: c.semesters_in_ibc,
        TimeZone: c.time_zone,
        WillingToTravel: c.willing_to_travel,
        WeekBeforeFinalsAvailability: c.week_before_finals_availability,
        IndustryInterests: c.industry_interests,
        FunctionalAreaInterests: c.functional_area_interests
      };
    }

    // 4. Fetch all SM profiles
    const smUserIds = Object.keys(smProjectsMap);
    const smResult = await pgPool.query(`
      SELECT 
        u.user_id,
        u.name,
        u.email,
        c.major,
        c.year
      FROM users u
      JOIN consultants c ON u.user_id = c.user_id
      WHERE u.user_id = ANY($1)
    `, [smUserIds]);

    const allSMs = {};
    for (const sm of smResult.rows) {
      allSMs[sm.user_id] = {
        UserID: sm.user_id,
        Name: sm.name,
        Email: sm.email,
        Major: sm.major,
        Year: sm.year
      };
    }

    // 5. Fetch all PMs and SCs
    const pmResult = await pgPool.query(`
      SELECT *
      FROM consultants c
      JOIN users u ON c.user_id = u.user_id
      WHERE c.status != 'Deferred'
        AND u.curr_role = 'PM'
    `);        

    const scResult = await pgPool.query(`
      SELECT *
      FROM consultants c
      JOIN users u ON c.user_id = u.user_id
      WHERE c.status != 'Deferred'
        AND u.curr_role = 'SC'
    `);
    
    const allPM = {};
    for (const c of pmResult.rows) {
      allPM[c.user_id] = {
        UserID: c.user_id,
        Name: c.name,
        Email: c.email,
        Major: c.major,
        Role: c.curr_role,
        Year: c.year,
        Availability_Mon: c.availability_mon,
        Availability_Tue: c.availability_tue,
        Availability_Wed: c.availability_wed,
        Availability_Thu: c.availability_thu,
        Availability_Fri: c.availability_fri,
        Availability_Sat: c.availability_sat,
        Availability_Sun: c.availability_sun,
        ConsultantScore: c.consultant_score,
        Num_SemestersInIBC: c.semesters_in_ibc,
        TimeZone: c.time_zone,
        WillingToTravel: c.willing_to_travel,
        WeekBeforeFinalsAvailability: c.week_before_finals_availability,
        IndustryInterests: c.industry_interests,
        FunctionalAreaInterests: c.functional_area_interests
      };
    }

    const allSC = {};
    for (const c of scResult.rows) {
      allSC[c.user_id] = {
        UserID: c.user_id,
        Name: c.name,
        Email: c.email,
        Major: c.major,
        Role: c.curr_role,
        Year: c.year,
        Availability_Mon: c.availability_mon,
        Availability_Tue: c.availability_tue,
        Availability_Wed: c.availability_wed,
        Availability_Thu: c.availability_thu,
        Availability_Fri: c.availability_fri,
        Availability_Sat: c.availability_sat,
        Availability_Sun: c.availability_sun,
        ConsultantScore: c.consultant_score,
        Num_SemestersInIBC: c.semesters_in_ibc,
        TimeZone: c.time_zone,
        WillingToTravel: c.willing_to_travel,
        WeekBeforeFinalsAvailability: c.week_before_finals_availability,
        IndustryInterests: c.industry_interests,
        FunctionalAreaInterests: c.functional_area_interests
      };
    }

    // 6. Write data to JS files
    await fs.promises.writeFile(
      path.join(__dirname, 'server', 'data', 'projects.js'),
      `const smProjectsMap = ${JSON.stringify(smProjectsMap, null, 2)};\n\nmodule.exports = smProjectsMap;`
    );

    await fs.promises.writeFile(
      path.join(__dirname, 'server', 'data', 'consultants.js'),
      `const allConsultants = ${JSON.stringify(allConsultants, null, 2)};\n\nconst pickedConsultants = [];\n\n
module.exports = { allConsultants, pickedConsultants };`
    );

    await fs.promises.writeFile(
      path.join(__dirname, 'server', 'data', 'smData.js'),
      `const allSMs = ${JSON.stringify(allSMs, null, 2)};\n\nmodule.exports = allSMs;`
    );

    await fs.promises.writeFile(
      path.join(__dirname, 'server', 'data', 'pmData.js'),
      `const allPM = ${JSON.stringify(allPM, null, 2)};\n\nmodule.exports = allPM;`
    );

    await fs.promises.writeFile(
      path.join(__dirname, 'server', 'data', 'scData.js'),
      `const allSC = ${JSON.stringify(allSC, null, 2)};\n\nmodule.exports = allSC;`
    );

    return res.json({
      message: "Draft data generated successfully.",
      smCount: Object.keys(allSMs).length,
      projectCount: smProjectsResult.rows.length,
      consultantCount: consultantsResult.rows.length
    });

  } catch (err) {
    console.error("Error in /api/start-draft:", err);
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
    const projectsQuery =`
      SELECT
        project_id,
      FROM
        projects
      WHERE
        project_semester = $1
    `;

    const staffedConsultantQuery = `
      SELECT 
        user_id,
      FROM 
        consultant-projects
      WHERE
        project_id = ANY($1)

    `;

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
      WHERE c.status != 'Deferred'
        AND u.curr_role IN ('NC', 'EC')
        AND user_id NOT IN ($1);
    `;

    const curr_projects = await pgPool.query(projectsQuery, [semester]);
    const projectIds = curr_projects.rows.map(row => row.project_id);

    const staffed_consultants = await pgPool.query(staffedConsultantQuery, [projectIds]);
    const staffedConsultantIds = staffed_consultants.rows.map(row => row.user_id);
    
    const result = await pgPool.query(consultantsQuery, [staffedConsultantIds]);
    
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

// fetch history from google sheets.
// iterate bottump up and ignore duplicates by consultantId
// insert to project-consultant database
app.get("/api/import-project-data", async (req, res) => {
  
  const SHEET_HISTORY_URL = "https://script.google.com/macros/s/AKfycbwEsuHzdJKr3SCLJD1CznxwoqcTOHXbJSAjcwViyJyoJom3mfPaWgxpFnxnPuOAUN55VQ/exec";

  try {
    console.log("Entering /api/import-project-data endpoint"); // Log at the start of the endpoint

    // 1) fetch the sheet history
    const { data } = await axios.get(SHEET_HISTORY_URL);
    const rows = Array.isArray(data) ? data : data.data || [];
    console.log(`Fetched ${rows.length} rows from the spreadsheet`); // Log the number of rows fetched

    // 2) iterate bottom‑to‑up, dedupe by consultantId
    const seen = new Set();
    let consultantId, projectId, role; // Declare variables outside the loop
    for (let i = rows.length - 1; i >= 0; i--) {
      console.log(`Processing row ${i}:`, rows[i]); // Debugging log for each row
      ({ consultantId, projectId, role } = rows[i]); // Update variables within the loop
      console.log(`Extracted values - consultantId: ${consultantId}, projectId: ${projectId}, role: ${role}`); // Debugging log for extracted values

      if (seen.has(consultantId)) {
        console.log(`Skipping duplicate consultantId: ${consultantId}`); // Debugging log for duplicates
        continue;
      }
      seen.add(consultantId);

      // 3) insert into the join table, ignore duplicates
      const insertSQL = `
        INSERT INTO consultant_projects (user_id, project_id, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, project_id) DO NOTHING;
      `;
      console.log(`Executing SQL: ${insertSQL} with values [${consultantId}, ${projectId}, ${role}]`); // Debugging log for SQL execution
      await pgPool.query(insertSQL, [
        consultantId,
        projectId,
        role
      ]);
    }

    res.json({ message: `Imported latest project‑consultant assignments successfully.` }); // Return a success message after the loop
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ error: "Failed to import project data." });
  }
});

// Register all socket event handlers
registerSocketHandlers(io);

// Start the server and listen on port 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🟢 Server running on port ${PORT}\nTest using this: http://localhost:3000`);
});