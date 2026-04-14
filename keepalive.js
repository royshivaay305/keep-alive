const SUCCESS_CODES = new Set([200, 206]);

function readProjects() {
  const raw = process.env.SUPABASE_PROJECTS;

  if (!raw) {
    throw new Error("Missing SUPABASE_PROJECTS secret.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error("SUPABASE_PROJECTS must be valid JSON.");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("SUPABASE_PROJECTS must be a non-empty JSON array.");
  }

  return parsed.map((project, index) => {
    const entry = {
      name: String(project.name || `Project ${index + 1}`).trim(),
      url: String(project.url || "").trim().replace(/\/+$/, ""),
      table: String(project.table || "").trim(),
      apiKey: String(project.apiKey || "").trim(),
    };

    if (!entry.url || !entry.table || !entry.apiKey) {
      throw new Error(`Project ${index + 1} is missing url, table, or apiKey.`);
    }

    return entry;
  });
}

async function pingProject(project) {
  const endpoint = `${project.url}/rest/v1/${encodeURIComponent(project.table)}?limit=1`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      apikey: project.apiKey,
      Authorization: `Bearer ${project.apiKey}`,
    },
  });

  return {
    name: project.name,
    endpoint,
    status: response.status,
    ok: SUCCESS_CODES.has(response.status),
  };
}

async function main() {
  const projects = readProjects();
  const results = [];

  for (const project of projects) {
    try {
      const result = await pingProject(project);
      results.push(result);
      console.log(`${result.ok ? "OK" : "FAIL"} ${result.name}: HTTP ${result.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      results.push({
        name: project.name,
        endpoint: `${project.url}/rest/v1/${encodeURIComponent(project.table)}?limit=1`,
        status: message,
        ok: false,
      });
      console.log(`FAIL ${project.name}: ${message}`);
    }
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    throw new Error(`${failed.length} project ping(s) failed.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
