const baseUrl = normalizeBaseUrl(process.env.WORKER_URL || process.env.WORKER_HEALTH_URL || "");
const rooms = parseRooms(process.env.CLASSROOM_ROOMS || process.env.EXPECTED_CLASSROOM_ROOMS || "");
const teacherTokenValue = process.env.TEACHER_TOKEN ? "$TEACHER_TOKEN" : "<TEACHER_TOKEN>";

const failures = [];
if (!baseUrl) failures.push("WORKER_URL or WORKER_HEALTH_URL is required");
if (rooms.length === 0) failures.push("CLASSROOM_ROOMS or EXPECTED_CLASSROOM_ROOMS is required");
if (rooms.some((room) => !isFilmingRoom(room))) failures.push("CLASSROOM_ROOMS must not include default-classroom or deploy-verify rooms");
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`classroom URL generation failed: ${failures.length} setup issue(s)`);
  process.exit(1);
}

console.log("# EBS classroom URLs");
console.log("# Share only studentUrl with students. Keep teacherUrl staff-only.");
console.log("");
for (const room of rooms) {
  const studentUrl = buildUrl("/", room, "");
  const teacherUrl = buildUrl("/teacher", room, teacherTokenValue);
  console.log(`room=${room}`);
  console.log(`studentUrl=${studentUrl}`);
  console.log(`teacherUrl=${teacherUrl}`);
  console.log("");
}

function parseRooms(value) {
  return String(value || "")
    .split(/[\n,;]+/)
    .map((room) => normalizeRoomId(room))
    .filter(Boolean);
}

function buildUrl(pathname, room, token) {
  const url = new URL(baseUrl);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  url.searchParams.set("room", room);
  if (token) url.searchParams.set("token", token);
  return url.toString().replace("%24TEACHER_TOKEN", "$TEACHER_TOKEN");
}

function normalizeBaseUrl(value) {
  if (!value) return "";
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function normalizeRoomId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isFilmingRoom(value) {
  const room = String(value || "").trim();
  return Boolean(room) &&
    room !== "default-classroom" &&
    room !== "deploy-verify" &&
    !room.startsWith("deploy-verify-");
}
